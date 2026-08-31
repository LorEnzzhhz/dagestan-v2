package com.dagestan.mobile

import android.content.Context
import android.util.Log
import com.github.luben.zstd.ZstdInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/**
 * Downloads, caches, and extracts the AnyClaw rootfs used by the
 * [OpenClawAndroid/openclaw-android-assistant] app.
 *
 * Why this exists
 * ---------------
 * Dagestan's on-device runtime historically used a 30 MB Termux bootstrap
 * (`bootstrap-aarch64.zip`) and then ran `npm install -g openclaw@latest`
 * on first launch. That install is slow, fragile (often fails because
 * the Play/npm path is restricted on locked-down devices), and lacks
 * the patched koffi, openclaw.mjs shebang, and Termux-style bin
 * wrappers that AnyClaw ships pre-built.
 *
 * AnyClaw instead ships a 608 MB zstd-compressed Debian rootfs that
 * already contains node, npm, openclaw, codex-acp, hermes-webui, and
 * the right `libproot.so` + `libtalloc.so` + `libtermux.so` JNI libs.
 * The rootfs is published as a "rolling" GitHub release at
 * `friuns2/anyclaw-rootfs-assets/releases/download/rootfs-latest/` so
 * we can fetch the latest snapshot on first launch.
 *
 * Layout compatibility
 * --------------------
 * The AnyClaw rootfs is a Debian-style filesystem that unpacks with
 * `bin/`, `lib/`, `opt/`, `etc/`, `root/`, `usr/` at the top level.
 * Dagestan's [BootstrapInstaller] also uses a Debian-style prefix rooted
 * at `files/usr/`. To keep the rest of the codebase (46+ call sites of
 * `BootstrapInstaller.getPaths(context)`) untouched, we extract the
 * AnyClaw rootfs **into** `files/usr/` so that:
 *
 *   AnyClaw path                                → Dagestan `paths.prefixDir` path
 *   bin/sh                                      → files/usr/bin/sh
 *   lib/node_modules/openclaw/openclaw.mjs      → files/usr/lib/node_modules/openclaw/...
 *   usr/local/lib/node_modules/codex-web-local  → files/usr/usr/local/lib/node_modules/...
 *   opt/hermes-webui/server.py                  → files/usr/opt/hermes-webui/server.py
 *
 * The legacy `bootstrap-aarch64.zip` is therefore not needed when the
 * AnyClaw rootfs is present. The runtime still uses `${paths.prefixDir}`
 * everywhere; only the on-disk contents change.
 *
 * Behaviour
 * ---------
 * - If `files/usr/.anyclaw_extracted` exists, treat the rootfs as
 *   already installed and skip the network entirely.
 * - Otherwise stream `rootfs.tar.zst.bin` to the cache dir,
 *   decompress with zstd-JNI, and untar into `files/usr-staging/`,
 *   then atomically rename to `files/usr/` (replacing the Termux
 *   bootstrap if it was there).
 * - Also fetch `jniLibs-arm64-v8a.tar.gz` (110 KB) and extract it
 *   into `files/usr/usr/lib/` so `libproot.so`, `libtalloc.so`, and
 *   `libtermux.so` are findable via LD_LIBRARY_PATH for the
 *   openclaw.mjs runtime.
 * - Network is required (per product decision: stay online, not
 *   offline). On failure we surface the error so the caller can fall
 *   back to the legacy Termux bootstrap.
 *
 * Threading
 * ---------
 * All public functions block; the caller is expected to invoke us
 * from a coroutine on `Dispatchers.IO` (MainActivity does this).
 */
object AnyClawBootstrapper {

    private const val TAG = "AnyClawBootstrapper"

    data class Paths(
        val filesDir: String,
        val prefixDir: String,        // = $filesDir/usr (same as BootstrapInstaller)
        val cacheDir: String,         // = $filesDir/cache
        val stagingDir: String,       // = $filesDir/.anyclaw-staging
    )

    fun getPaths(context: Context): Paths {
        val filesDir = context.filesDir.absolutePath
        return Paths(
            filesDir = filesDir,
            prefixDir = "$filesDir/usr",
            cacheDir = "$filesDir/cache",
            stagingDir = "$filesDir/.anyclaw-staging",
        )
    }

    // ── Sources ────────────────────────────────────────────────────────────
    //
    // The "rootfs-latest" tag is a rolling release: any time AnyClaw
    // upstream rebuilds the rootfs, we get the new one on next bootstrap.
    // To pin a specific version, set ANYCLAW_ROOTFS_RELEASE before
    // building the APK (e.g. "rootfs-2026.05.17") and we'll fetch that
    // tag instead.
    private const val ROOTFS_RELEASE_LATEST = "rootfs-latest"
    private const val ROOTFS_BASE_URL =
        "https://github.com/friuns2/anyclaw-rootfs-assets/releases/download"
    private val ROOTFS_TARBALL = "rootfs.tar.zst.bin"
    private val ROOTFS_JNI_TARBALL = "jniLibs-arm64-v8a.tar.gz"

    fun rootfsTarballUrl(release: String = ROOTFS_RELEASE_LATEST): String =
        "$ROOTFS_BASE_URL/$release/$ROOTFS_TARBALL"

    fun jniLibsUrl(release: String = ROOTFS_RELEASE_LATEST): String =
        "$ROOTFS_BASE_URL/$release/$ROOTFS_JNI_TARBALL"

    // ── State checks ───────────────────────────────────────────────────────

    /**
     * True when the AnyClaw rootfs is extracted into the legacy Termux
     * prefix path and the marker file is present. We sanity-check a few
     * key paths so we don't trust a stale marker.
     */
    fun isInstalled(context: Context): Boolean {
        val p = getPaths(context)
        val marker = File(p.prefixDir, ".anyclaw_extracted")
        if (!marker.exists()) return false
        return File(p.prefixDir, "bin/sh").exists() &&
            File(p.prefixDir, "usr/local/bin/node").exists() &&
            File(p.prefixDir, "lib/node_modules").exists() &&
            File(p.prefixDir, "opt/hermes-webui/server.py").exists()
    }

    // ── Install ────────────────────────────────────────────────────────────

    /**
     * Idempotent: skips if already installed. Performs the full
     * download + extract + verify sequence, calling [onProgress]
     * with human-readable status messages.
     *
     * @return true on success; false on any error (with details in
     *         [lastError] for the caller to display).
     */
    fun install(
        context: Context,
        onProgress: (String) -> Unit = {},
    ): Boolean {
        lastError = null
        val p = getPaths(context)

        if (isInstalled(context)) {
            Log.i(TAG, "AnyClaw rootfs already installed at ${p.prefixDir}")
            onProgress("AnyClaw rootfs ready")
            return true
        }

        File(p.cacheDir).mkdirs()

        return try {
            val cachedTarball = File(p.cacheDir, ROOTFS_TARBALL)
            val jniTarball = File(p.cacheDir, ROOTFS_JNI_TARBALL)

            // 1. Download the rootfs tarball (resumable). It unpacks with a
            //    full Debian layout (usr/, opt/, etc/, bin -> usr/bin,
            //    lib -> usr/lib at the top level). We extract it into a
            //    staging dir *inside* filesDir so the resulting tree
            //    (files/usr, files/opt, files/bin, …) lines up with
            //    BootstrapInstaller.prefixDir == files/usr.
            downloadWithProgress(
                url = rootfsTarballUrl(),
                target = cachedTarball,
                onProgress = { msg -> onProgress("Downloading rootfs: $msg") },
            )

            onProgress("Extracting rootfs (this takes a minute)…")
            val staging = File(p.filesDir, ".anyclaw-staging")
            if (staging.exists()) deleteRecursive(staging)
            staging.mkdirs()
            extractTarZstd(cachedTarball, staging)

            // 2. Drop the JNI libs (libproot.so, libtalloc.so, libtermux.so)
            //    into staging/usr/lib/arm64-v8a/ so they land under
            //    files/usr/lib/arm64-v8a/ after the move below.
            downloadWithProgress(
                url = jniLibsUrl(),
                target = jniTarball,
                onProgress = { msg -> onProgress("Downloading JNI libs: $msg") },
            )
            val jniTarget = File(staging, "usr/lib")
            jniTarget.mkdirs()
            extractTarGz(jniTarball, jniTarget)

            // 3. Merge the extracted Debian tree into filesDir. We keep only
            //    usr/opt/etc/bin/lib and reject app-managed dirs (home, root,
            //    var, tmp, media, mnt, srv, run) so we never clobber them.
            onProgress("Installing rootfs into ${p.filesDir}…")
            moveStagingIntoFiles(staging, p.filesDir)

            // 4. Bridge the Debian layout to the Termux-style prefix the rest
            //    of the app expects (prefixDir/bin, prefixDir/lib/node_modules, …).
            createCompatibilitySymlinks(p)

            // 5. Drop the marker file so we skip all of this next time.
            File(p.prefixDir, ".anyclaw_extracted").writeText(
                "installed_at=${System.currentTimeMillis()}\n" +
                    "release=$ROOTFS_RELEASE_LATEST\n"
            )

            // 6. Drop the downloaded tarballs to save space.
            cachedTarball.delete()
            jniTarball.delete()

            Log.i(TAG, "AnyClaw rootfs installed at ${p.prefixDir}")
            onProgress("AnyClaw rootfs ready")
            true
        } catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
            Log.e(TAG, "AnyClaw bootstrap failed", e)
            onProgress("AnyClaw bootstrap failed: $lastError")
            runCatching { deleteRecursive(File(p.filesDir, ".anyclaw-staging")) }
            false
        }
    }

    /**
     * Move the relevant top-level directories of the staged Debian rootfs
     * into [filesDir]. The rootfs unpacks as usr/, opt/, etc/, bin/ (symlink
     * to usr/bin), lib/ (symlink to usr/lib), plus app-managed dirs such as
     * home/root/var/tmp. We move only the dirs Dagestan serves from so we
     * never overwrite user data.
     */
    private fun moveStagingIntoFiles(staging: File, filesDir: String) {
        for (name in listOf("usr", "opt", "etc", "bin", "lib")) {
            val src = File(staging, name)
            if (!src.exists()) continue
            val dst = File(filesDir, name)
            if (dst.exists()) deleteRecursive(dst)
            if (!src.renameTo(dst)) {
                copyRecursive(src, dst)
                deleteRecursive(src)
            }
        }
        deleteRecursive(staging)
    }

    /**
     * Create the symlinks that let the rest of the app (which assumes a
     * Termux prefix rooted at files/usr) find the binaries/libraries that
     * the Debian-rooted AnyClaw rootfs actually keeps under usr/local/.
     */
    private fun createCompatibilitySymlinks(p: Paths) {
        val prefix = File(p.prefixDir)

        // bin/ -> usr/local/bin/* (node, openclaw, codex, codexui-android, …)
        val localBin = File(prefix, "usr/local/bin")
        val binDir = File(prefix, "bin")
        localBin.listFiles().orEmpty().forEach { f ->
            if (f.isFile) {
                val link = File(binDir, f.name)
                createRelativeSymlink(link, "../local/bin/${f.name}")
            }
        }

        // opt/ -> ../opt  (the rootfs keeps hermes-webui at files/opt)
        val optLink = File(prefix, "opt")
        val optReal = File(p.filesDir, "opt")
        if (!optLink.exists() && optReal.exists()) {
            createRelativeSymlink(optLink, "../opt")
        }

        // etc/ -> ../etc  (the rootfs keeps system config at files/etc, not
        // files/usr/etc, so the legacy prefixDir/etc/* cert/apt paths resolve)
        val etcLink = File(prefix, "etc")
        val etcReal = File(p.filesDir, "etc")
        if (!etcLink.exists() && etcReal.exists()) {
            createRelativeSymlink(etcLink, "../etc")
        }

        // lib/node_modules/ -> usr/local/lib/node_modules/*
        val realNm = File(prefix, "usr/local/lib/node_modules")
        val bridge = File(prefix, "lib/node_modules")
        bridge.mkdirs()
        realNm.listFiles().orEmpty().forEach { f ->
            val link = File(bridge, f.name)
            createRelativeSymlink(link, "../../usr/local/lib/node_modules/${f.name}")
        }
        // codex-web-local is the old npm name; AnyClaw ships it as the
        // @brutalstrikedevs/codexui-android package.
        createRelativeSymlink(
            File(bridge, "codex-web-local"),
            "../../usr/local/lib/node_modules/@brutalstrikedevs/codexui-android",
        )
    }

    /** Create [link] as a symlink whose target is resolved relative to its parent. */
    private fun createRelativeSymlink(link: File, relativeTarget: String) {
        if (java.nio.file.Files.exists(link.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) return
        try {
            link.parentFile?.mkdirs()
            java.nio.file.Files.createSymbolicLink(link.toPath(), java.nio.file.Paths.get(relativeTarget))
        } catch (e: Exception) {
            Log.w(TAG, "symlink failed: $link -> $relativeTarget (${e.message})")
        }
    }

    private fun copyRecursive(src: File, dst: File) {
        if (src.isDirectory) {
            dst.mkdirs()
            src.listFiles().orEmpty().forEach { copyRecursive(it, File(dst, it.name)) }
        } else {
            dst.parentFile?.mkdirs()
            src.copyTo(dst, overwrite = true)
        }
    }

    /** Set by the most recent [install] attempt; null on success. */
    var lastError: String? = null
        private set

    // ── Networking ─────────────────────────────────────────────────────────

    private fun downloadWithProgress(
        url: String,
        target: File,
        onProgress: (String) -> Unit,
    ) {
        val existing = if (target.exists()) target.length() else 0L
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            if (existing > 0) {
                setRequestProperty("Range", "bytes=$existing-")
            }
            connect()
        }
        val total = conn.contentLengthLong + existing
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            throw RuntimeException("HTTP $code downloading $url")
        }
        val append = code == 206 || (existing > 0 && code == 200)
        conn.inputStream.use { input ->
            FileOutputStream(target, append).use { output ->
                val buf = ByteArray(64 * 1024)
                var read: Int
                var downloaded = existing
                var lastPct = -1
                while (input.read(buf).also { read = it } > 0) {
                    output.write(buf, 0, read)
                    downloaded += read
                    if (total > 0) {
                        val pct = (downloaded * 100 / total).toInt()
                        if (pct != lastPct) {
                            lastPct = pct
                            onProgress("$pct% (${humanSize(downloaded)}/${humanSize(total)})")
                        }
                    }
                }
            }
        }
        conn.disconnect()
    }

    // ── Extraction ─────────────────────────────────────────────────────────

    private fun extractTarZstd(archive: File, intoDir: File) {
        FileInputStream(archive).use { fis ->
            BufferedInputStream(fis).use { bis ->
                ZstdInputStream(bis).use { zis ->
                    untar(zis, intoDir)
                }
            }
        }
    }

    private fun extractTarGz(archive: File, intoDir: File) {
        FileInputStream(archive).use { fis ->
            BufferedInputStream(fis).use { bis ->
                GZIPInputStream(bis).use { gzis ->
                    untar(gzis, intoDir)
                }
            }
        }
    }

    /**
     * Minimal tar extractor. We don't need full POSIX tar — just the
     * subset AnyClaw uses: regular files, directories, and symlinks.
     * Headers are 512-byte blocks; entries are null-padded to 512.
     */
    private fun untar(input: InputStream, intoDir: File) {
        intoDir.mkdirs()
        val header = ByteArray(512)
        while (true) {
            val n = input.read(header)
            if (n <= 0) break
            if (n < 512) break
            // End-of-archive marker: two consecutive 512-byte zero blocks.
            if (header.all { it == 0.toByte() }) break

            val name = readName(header).trimEnd('\u0000')
            if (name.isEmpty()) continue
            val size = readOctal(header, 124, 12)
            val typeFlag = header[156].toChar()
            val linkTarget = readName(header, 157, 100).trimEnd('\u0000')

            val outFile = File(intoDir, name)
            when (typeFlag) {
                '5', 'D' -> {
                    outFile.mkdirs()
                }
                '2' -> {
                    if (outFile.exists() || outFile.isDirectory) {
                        if (outFile.isDirectory) deleteRecursive(outFile)
                        else outFile.delete()
                    }
                    outFile.parentFile?.mkdirs()
                    try {
                        java.nio.file.Files.createSymbolicLink(
                            outFile.toPath(),
                            java.nio.file.Paths.get(linkTarget),
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "symlink failed: $outFile -> $linkTarget (${e.message})")
                    }
                }
                '0', '\u0000', '7' -> {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { output ->
                        val remaining = size
                        var copied = 0L
                        val buf = ByteArray(64 * 1024)
                        while (copied < remaining) {
                            val want = minOf(buf.size.toLong(), remaining - copied).toInt()
                            val r = input.read(buf, 0, want)
                            if (r < 0) break
                            output.write(buf, 0, r)
                            copied += r
                        }
                    }
                    val mode = readOctal(header, 100, 8)
                    if (mode and 0b001_000_000_000L != 0L) {
                        outFile.setExecutable(true, false)
                    }
                    if (mode and 0b010_000_000_000L != 0L) {
                        outFile.setReadable(true, false)
                    }
                    if (mode and 0b100_000_000_000L != 0L) {
                        outFile.setWritable(true, false)
                    }
                }
                else -> {
                    Log.d(TAG, "Skipping tar entry $name (type=$typeFlag, size=$size)")
                }
            }
            // Tar pads each entry to a 512-byte boundary.
            val skip = ((size + 511) / 512) * 512 - size
            if (skip > 0) {
                var skipped = 0L
                val buf = ByteArray(8192)
                while (skipped < skip) {
                    val want = minOf(buf.size.toLong(), skip - skipped).toInt()
                    val r = input.read(buf, 0, want)
                    if (r < 0) break
                    skipped += r
                }
            }
        }
    }

    private fun readName(header: ByteArray, offset: Int = 0, length: Int = 100): String {
        val sb = StringBuilder()
        for (i in offset until offset + length) {
            val b = header[i].toInt() and 0xff
            if (b == 0) break
            sb.append(b.toChar())
        }
        return sb.toString()
    }

    private fun readOctal(header: ByteArray, offset: Int, length: Int): Long {
        var v = 0L
        for (i in offset until offset + length) {
            val c = header[i].toInt() and 0xff
            if (c == 0 || c == ' '.code) continue
            if (c < '0'.code || c > '7'.code) break
            v = (v shl 3) or (c - '0'.code).toLong()
        }
        return v
    }

    // ── Misc helpers ───────────────────────────────────────────────────────

    private fun humanSize(bytes: Long): String = when {
        bytes >= 1024L * 1024 * 1024 -> "%.1f GB".format(bytes / 1024.0 / 1024 / 1024)
        bytes >= 1024L * 1024 -> "%.1f MB".format(bytes / 1024.0 / 1024)
        bytes >= 1024L -> "%.1f KB".format(bytes / 1024.0)
        else -> "$bytes B"
    }

    private fun deleteRecursive(file: File) {
        if (file.isDirectory) {
            file.listFiles()?.forEach { deleteRecursive(it) }
        }
        file.delete()
    }
}
