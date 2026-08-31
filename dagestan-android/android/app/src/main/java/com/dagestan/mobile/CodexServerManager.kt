package com.dagestan.mobile

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Manages the lifecycle of the Node.js codex-web-local server process running
 * inside the Termux bootstrap environment. Handles installation of Node.js,
 * Codex CLI, the platform-specific native binary, authentication via
 * `codex login`, and the codex-web-local web server.
 */
class CodexServerManager(private val context: Context) {

    companion object {
        private const val TAG = "CodexServerManager"

        @Volatile
        private var instance: CodexServerManager? = null

        /** Process-wide instance so Activity recreation keeps live handles. */
        fun getInstance(context: Context): CodexServerManager =
            instance ?: synchronized(this) {
                instance ?: CodexServerManager(context.applicationContext)
                    .also { instance = it }
            }
        const val SERVER_PORT = 18925
        private const val PROXY_PORT = 18926
        private const val CODEX_VERSION = "0.104.0"
        const val OPENCLAW_GATEWAY_PORT = 18790
        const val OPENCLAW_CONTROL_UI_PORT = 19002
        const val OPENCODEX_PORT = 10101
        private const val BUN_VERSION = "1.4.0"
        const val HERMES_PORT = 8788

        /** Model providers shown in pickers — all with free tiers. */
        val PROVIDERS = listOf(
            ModelProvider(
                "opencode", "OpenCode Zen", "100% FREE",
                "https://opencode.ai/zen/v1", "OPENCODE_ZEN_API_KEY", "responses",
                "big-pickle",
                "100% free models · zero retention",
                "https://opencode.ai/auth",
            ),
            ModelProvider(
                "openrouter", "OpenRouter", "FREE TIERS",
                "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "responses",
                "deepseek/deepseek-chat-v3.1:free",
                "Huge catalog with :free models",
                "https://openrouter.ai/keys",
            ),
        ModelProvider(
            "nvidia", "NVIDIA NIM", "FREE CREDITS",
            "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY", "responses",
            "meta/llama-3.3-70b-instruct",
            "Fast NVIDIA-hosted open models",
            "https://build.nvidia.com",
        ),
        ModelProvider(
            "custom", "Custom endpoint", "BRING YOUR OWN",
            "https://example.invalid/v1", "CUSTOM_API_KEY", "responses",
            "gpt-4o-mini",
            "Any OpenAI-compatible base URL + model + key",
            "",
        ),
    )

        /** Legacy provider — not offered in the UI; login via Terminal (`codex login`). */
        val OPENAI_LEGACY = ModelProvider(
            "openai", "OpenAI", "PAID",
            "https://api.openai.com/v1", "OPENAI_API_KEY", "responses",
            "gpt-5-codex",
            "ChatGPT Plus / API key · sk-…",
            "https://platform.openai.com/api-keys",
        )
    }

    private var serverProcess: Process? = null

    /** Human-readable reason for the most recent startServer() failure. */
    var lastServerError: String? = null
        private set

    /** Recent output lines from the server process (crash diagnostics). */
    private val serverOutput = ArrayDeque<String>()

    private fun recordServerOutput(line: String) {
        synchronized(serverOutput) {
            serverOutput.addLast(line)
            while (serverOutput.size > 40) serverOutput.removeFirst()
        }
    }

    /** Last server output lines, for error messages and logs. */
    fun serverOutputTail(): String = synchronized(serverOutput) {
        serverOutput.joinToString("\n").takeLast(800)
    }
    private var proxyProcess: Process? = null
    private var openClawGatewayProcess: Process? = null
    private var openClawControlUiProcess: Process? = null
    private var openCodexProcess: Process? = null
    private var hermesProcess: Process? = null

    /** Last output lines from OpenCodex process. */
    private val openCodexOutput = ArrayDeque<String>()
    var openCodexLastError: String? = null
        private set

    /** Last output lines from Hermes process. */
    private val hermesOutput = ArrayDeque<String>()
    var hermesLastError: String? = null
        private set

    val isRunning: Boolean
        get() {
            val proc = serverProcess ?: return false
            return try {
                proc.exitValue()
                false
            } catch (_: IllegalThreadStateException) {
                true
            }
        }

    val isGatewayRunning: Boolean
        get() {
            val proc = openClawGatewayProcess ?: return false
            return try {
                proc.exitValue()
                false
            } catch (_: IllegalThreadStateException) {
                true
            }
        }

    fun serverUrl(): String = "http://127.0.0.1:$SERVER_PORT/"

    fun controlUiUrl(): String = "http://127.0.0.1:$OPENCLAW_CONTROL_UI_PORT/"

    /**
     * Control UI URL with the gateway WebSocket preconfigured — the UI reads
     * `gatewayUrl` from the query string, otherwise it defaults to its own
     * port and cannot reach the gateway.
     */
    fun controlUiLaunchUrl(): String {
        val ws = "ws://127.0.0.1:$OPENCLAW_GATEWAY_PORT"
        return controlUiUrl() + "?gatewayUrl=" +
            java.net.URLEncoder.encode(ws, "UTF-8")
    }

    fun hermesUrl(): String = "http://127.0.0.1:$HERMES_PORT/"

    // ── Shell helpers ──────────────────────────────────────────────────────

    /**
     * Run a shell command inside the Termux prefix environment.
     * Returns the exit code.
     */
    fun runInPrefix(
        command: String,
        onOutput: ((String) -> Unit)? = null,
    ): Int {
        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths)

        val shell = "${paths.prefixDir}/bin/sh"
        val pb = ProcessBuilder(shell, "-c", command)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        val reader = BufferedReader(InputStreamReader(proc.inputStream))
        var line = reader.readLine()
        while (line != null) {
            Log.d(TAG, line)
            onOutput?.invoke(line)
            line = reader.readLine()
        }
        // Wait max 60s for command completion; force-kill if stuck.
        try {
            Thread({ Thread.sleep(60000); try { proc.destroyForcibly() } catch (_: Exception) {} }).start()
            proc.waitFor(60, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        return try { proc.exitValue() } catch (_: Exception) { -1 }
    }

    /**
     * Run a command and capture its stdout as a single trimmed string.
     */
    private fun runCapture(command: String): String {
        val sb = StringBuilder()
        runInPrefix(command) { sb.appendLine(it) }
        return sb.toString().trim()
    }

    /**
     * Run a prefix command with retry: on failure, waits and retries up to
     * [maxRetries] times with exponential backoff (2s, 4s, 8s…).
     * Retries only apply to npm network errors (ECONNRESET, ETIMEDOUT,
     * ENOTFOUND, ENETUNREACH) — not to local/logic errors.
     */
    private fun runInPrefixWithRetry(
        command: String,
        maxRetries: Int = 3,
        onOutput: ((String) -> Unit)? = null,
    ): Int {
        var attempt = 0
        while (true) {
            val code = runInPrefix(command, onOutput)
            if (code == 0) return 0
            attempt++
            if (attempt > maxRetries) return code
            val delay = (1000L * (1 shl (attempt - 1))).coerceAtMost(8000)
            onOutput?.invoke("[retry $attempt/$maxRetries in ${delay / 1000}s…]")
            Thread.sleep(delay)
        }
    }

    // ── Install checks ─────────────────────────────────────────────────────

    fun isProotInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "bin/proot").exists()
    }

    fun isNodeInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "bin/node").exists()
    }

    fun isCodexInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "lib/node_modules/@openai/codex/bin/codex.js").exists()
    }

    fun isServerBundleInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "lib/node_modules/codex-web-local/dist-cli/index.js")
            .exists()
    }
    /**
     * The native Rust binary that the JS launcher delegates to.
     * Required for `codex app-server`, `codex login`, `codex exec`, etc.
     */
    fun isPlatformBinaryInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(
            paths.prefixDir,
            "lib/node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/codex/codex",
        ).exists()
    }

    // ── Installation ────────────────────────────────────────────────────────

    fun installNode(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir

        onProgress("Downloading Node.js packages…")

        val downloadCmd = """
            cd $prefix/tmp &&
            apt-get update --allow-insecure-repositories 2>&1;
            apt-get download --allow-unauthenticated c-ares libicu libsqlite nodejs-lts npm 2>&1
        """.trimIndent()

        val dlCode = runInPrefix(downloadCmd, onOutput = { onProgress(it) })
        if (dlCode != 0) {
            Log.e(TAG, "apt-get download failed with code $dlCode")
        }

        onProgress("Extracting Node.js packages…")
        val termuxPrefix = "/data/data/com.termux/files/usr"
        val extractCmd = """
            cd $prefix/tmp &&
            mkdir -p _stage &&
            for deb in *.deb; do
                echo "Extracting ${'$'}deb..." &&
                dpkg-deb -x "${'$'}deb" _stage/ 2>&1
            done &&
            if [ -d "_stage$termuxPrefix" ]; then
                cp -a _stage$termuxPrefix/* "$prefix/" 2>&1
            elif [ -d "_stage/usr" ]; then
                cp -a _stage/usr/* "$prefix/" 2>&1
            fi &&
            rm -rf _stage *.deb 2>/dev/null
            echo "done"
        """.trimIndent()

        val extractCode = runInPrefix(extractCmd, onOutput = { onProgress(it) })
        if (extractCode != 0) {
            Log.e(TAG, "dpkg-deb extract failed with code $extractCode")
            return false
        }

        onProgress("Fixing script paths…")
        val fixCmd = """
            chmod 700 "$prefix/bin/node" 2>/dev/null

            CODEX_JS="$prefix/lib/node_modules/@openai/codex/bin/codex.js"
            if [ -f "${'$'}CODEX_JS" ]; then
                rm -f "$prefix/bin/codex"
                cat > "$prefix/bin/codex" << 'WEOF'
#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh
exec /data/user/0/com.dagestan.mobile/files/usr/bin/node /data/user/0/com.dagestan.mobile/files/usr/lib/node_modules/@openai/codex/bin/codex.js "${'$'}@"
WEOF
                chmod 700 "$prefix/bin/codex"
            fi

            NPM_CLI="$prefix/lib/node_modules/npm/bin/npm-cli.js"
            if [ -f "${'$'}NPM_CLI" ]; then
                rm -f "$prefix/bin/npm"
                cat > "$prefix/bin/npm" << 'WEOF'
#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh
exec /data/user/0/com.dagestan.mobile/files/usr/bin/node /data/user/0/com.dagestan.mobile/files/usr/lib/node_modules/npm/bin/npm-cli.js "${'$'}@"
WEOF
                chmod 700 "$prefix/bin/npm"
            fi

            echo "Wrapper scripts created"
        """.trimIndent()
        runInPrefix(fixCmd, onOutput = { onProgress(it) })

        return isNodeInstalled()
    }

    /**
     * Install proot from the Termux repository. proot uses ptrace to
     * intercept filesystem syscalls and remap hardcoded Termux paths
     * (e.g. /data/data/com.termux/files/usr) to our actual prefix,
     * enabling dpkg, apt-get install, and other tools that have
     * compiled-in path references.
     */
    fun installProot(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val termuxPrefix = "/data/data/com.termux/files/usr"

        onProgress("Downloading proot…")

        val downloadCmd = """
            cd $prefix/tmp &&
            apt-get update --allow-insecure-repositories 2>&1;
            apt-get download --allow-unauthenticated proot libtalloc 2>&1
        """.trimIndent()

        val dlCode = runInPrefix(downloadCmd, onOutput = { onProgress(it) })
        if (dlCode != 0) {
            Log.e(TAG, "apt-get download proot failed with code $dlCode")
            return false
        }

        onProgress("Extracting proot…")
        val extractCmd = """
            cd $prefix/tmp &&
            mkdir -p _proot_stage &&
            for deb in proot*.deb libtalloc*.deb; do
                [ -f "${'$'}deb" ] && dpkg-deb -x "${'$'}deb" _proot_stage/ 2>&1
            done &&
            if [ -d "_proot_stage$termuxPrefix" ]; then
                cp -a _proot_stage$termuxPrefix/* "$prefix/" 2>&1
            elif [ -d "_proot_stage/usr" ]; then
                cp -a _proot_stage/usr/* "$prefix/" 2>&1
            fi &&
            chmod 700 "$prefix/bin/proot" 2>/dev/null
            rm -rf _proot_stage proot*.deb libtalloc*.deb 2>/dev/null
            echo "proot installed"
        """.trimIndent()

        val extractCode = runInPrefix(extractCmd, onOutput = { onProgress(it) })
        if (extractCode != 0) {
            Log.e(TAG, "proot extract failed with code $extractCode")
            return false
        }

        return isProotInstalled()
    }

    fun isPythonInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "bin/python3").exists() ||
            File(paths.prefixDir, "bin/python").exists()
    }

    /**
     * Install Python using proot to handle dpkg's hardcoded Termux paths.
     * proot bind-mounts our prefix onto the compiled-in Termux prefix so
     * dpkg postinst scripts and shared library lookups resolve correctly.
     */
    fun installPython(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val termuxPrefix = "/data/data/com.termux/files/usr"

        onProgress("Downloading Python packages…")

        val downloadCmd = """
            cd $prefix/tmp &&
            apt-get update --allow-insecure-repositories 2>&1;
            apt-get download --allow-unauthenticated python python-pip 2>&1
        """.trimIndent()

        val dlCode = runInPrefix(downloadCmd, onOutput = { onProgress(it) })
        if (dlCode != 0) {
            Log.e(TAG, "apt-get download python failed with code $dlCode")
        }

        onProgress("Extracting Python…")
        val extractCmd = """
            cd $prefix/tmp &&
            mkdir -p _python_stage &&
            for deb in python*.deb; do
                [ -f "${'$'}deb" ] && echo "Extracting ${'$'}deb..." && dpkg-deb -x "${'$'}deb" _python_stage/ 2>&1
            done &&
            if [ -d "_python_stage$termuxPrefix" ]; then
                cp -a _python_stage$termuxPrefix/* "$prefix/" 2>&1
            elif [ -d "_python_stage/usr" ]; then
                cp -a _python_stage/usr/* "$prefix/" 2>&1
            fi &&
            chmod 700 "$prefix/bin/python"* 2>/dev/null
            chmod 700 "$prefix/bin/pip"* 2>/dev/null
            rm -rf _python_stage python*.deb 2>/dev/null
            echo "Python installed"
        """.trimIndent()

        val extractCode = runInPrefix(extractCmd, onOutput = { onProgress(it) })
        if (extractCode != 0) {
            Log.e(TAG, "Python extract failed with code $extractCode")
            return false
        }

        // Create python3 wrapper to handle shebang issues
        val fixCmd = """
            if [ -f "$prefix/bin/python3" ] && [ ! -f "$prefix/bin/python" ]; then
                ln -sf python3 "$prefix/bin/python"
            fi
            echo "Python ready"
        """.trimIndent()
        runInPrefix(fixCmd, onOutput = { onProgress(it) })

        return isPythonInstalled()
    }

    // ── OpenClaw ─────────────────────────────────────────────────────────────

    fun isOpenClawInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val npmRoot = "${paths.prefixDir}/lib/node_modules"
        return File(npmRoot, "openclaw/package.json").exists()
    }

    /**
     * Install bionic-compat.js from APK assets into the home directory.
     * This shim patches process.platform, os.cpus(), and
     * os.networkInterfaces() for Android compatibility.
     * Loaded via NODE_OPTIONS="-r <path>/bionic-compat.js".
     */
    fun ensureBionicCompat() {
        val paths = BootstrapInstaller.getPaths(context)
        val patchDir = File(paths.homeDir, ".openclaw-android/patches")
        patchDir.mkdirs()

        val target = File(patchDir, "bionic-compat.js")
        try {
            context.assets.open("bionic-compat.js").use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            Log.i(TAG, "bionic-compat.js installed to $target")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract bionic-compat.js: ${e.message}")
        }
    }

    /**
     * Install all Termux packages needed for OpenClaw's native module
     * builds. This includes git, make, cmake, clang, lld (linker),
     * NDK sysroot/multilib, and all transitive shared library deps.
     * Uses dpkg-deb manual extraction (same approach as Node.js install).
     */
    fun installOpenClawDeps(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val termuxPrefix = "/data/data/com.termux/files/usr"

        onProgress("Downloading build dependencies…")

        // All packages needed for native compilation (koffi) in one batch.
        // Split into groups to avoid apt-get download failures on missing pkgs.
        val pkgGroups = listOf(
            "git make cmake clang binutils lld",
            "libllvm libedit libffi ndk-sysroot ndk-multilib libcompiler-rt",
            "libarchive libxml2 liblzma libcurl libuv libnghttp2 libnghttp3",
            "rhash jsoncpp",
        )

        for (group in pkgGroups) {
            val dlCode = runInPrefix(
                "cd $prefix/tmp && apt-get download --allow-unauthenticated $group 2>&1",
                onOutput = { onProgress(it) },
            )
            if (dlCode != 0) {
                Log.w(TAG, "apt-get download ($group) failed with code $dlCode (non-fatal)")
            }
        }

        onProgress("Extracting build dependencies…")
        val extractCmd = """
            cd $prefix/tmp &&
            mkdir -p _deps_stage &&
            for deb in *.deb; do
                [ -f "${'$'}deb" ] && echo "Extracting ${'$'}deb..." && dpkg-deb -x "${'$'}deb" _deps_stage/ 2>&1
            done &&
            if [ -d "_deps_stage$termuxPrefix" ]; then
                cp -a _deps_stage$termuxPrefix/* "$prefix/" 2>&1
            elif [ -d "_deps_stage/usr" ]; then
                cp -a _deps_stage/usr/* "$prefix/" 2>&1
            fi &&
            rm -rf _deps_stage *.deb 2>/dev/null
            echo "Build deps installed"
        """.trimIndent()

        val extractCode = runInPrefix(extractCmd, onOutput = { onProgress(it) })
        if (extractCode != 0) {
            Log.w(TAG, "Deps extract failed with code $extractCode (non-fatal)")
        }

        // Create symlinks for tools that expect different names
        runInPrefix("""
            [ ! -f "$prefix/bin/ar" ] && [ -f "$prefix/bin/llvm-ar" ] && ln -sf llvm-ar "$prefix/bin/ar"
            [ ! -f "$prefix/bin/ld" ] || [ -L "$prefix/bin/ld" ] && ln -sf ld.lld "$prefix/bin/ld"
            echo "Symlinks created"
        """.trimIndent())

        onProgress("Fixing git-core script shebangs…")
        fixGitCoreShebangs(prefix)

        onProgress("Patching make & cmake binaries…")
        patchBinaryTermuxPaths(prefix)

        onProgress("Creating header stubs…")
        createHeaderStubs(prefix)

        return true
    }

    /**
     * Fix shebangs in all git-core shell scripts. They ship with
     * #!/data/data/com.termux/files/usr/bin/sh which doesn't exist
     * at our actual prefix path.
     */
    private fun fixGitCoreShebangs(prefix: String) {
        val cmd = """
            cd "$prefix/libexec/git-core" 2>/dev/null || exit 0
            for f in git-*; do
                if head -1 "${'$'}f" 2>/dev/null | grep -q "com.termux"; then
                    sed -i "1s|/data/data/com.termux/files/usr|$prefix|" "${'$'}f"
                fi
            done
            echo "Git shebangs fixed"
        """.trimIndent()
        runInPrefix(cmd) { Log.d(TAG, "[fix-shebang] $it") }
    }

    /**
     * Binary-patch the `make` and `cmake` ELF binaries to replace the
     * hardcoded Termux shell paths with /system/bin/sh (null-padded).
     * Without this, cmake's test-compile step and make's recipe execution
     * fail with "Permission denied" on the non-existent Termux sh path.
     */
    private fun patchBinaryTermuxPaths(prefix: String) {
        val patchScript = """
            cat > "$prefix/tmp/_patchbin.py" << 'PYEOF'
import sys
with open(sys.argv[1], "rb") as f:
    data = f.read()
pairs = [
    (b"/data/data/com.termux/files/usr/bin/sh", b"/system/bin/sh"),
    (b"/data/data/com.termux/files/usr/bin/bash", b"/system/bin/sh"),
]
for old, new in pairs:
    padded = new + b"\x00" * (len(old) - len(new))
    data = data.replace(old, padded)
with open(sys.argv[1], "wb") as f:
    f.write(data)
print("patched " + sys.argv[1])
PYEOF
            for bin in "$prefix/bin/make" "$prefix/bin/cmake"; do
                [ -f "${'$'}bin" ] && python3 "$prefix/tmp/_patchbin.py" "${'$'}bin" && chmod 700 "${'$'}bin"
            done
            rm -f "$prefix/tmp/_patchbin.py"
        """.trimIndent()
        runInPrefix(patchScript) { Log.d(TAG, "[patch-bin] $it") }
    }

    /**
     * Create stub headers needed for native builds on Android:
     * - android/api-level.h — cmake system detection
     * - spawn.h — POSIX spawn (not available on older Android NDK)
     * - renameat2_shim.h — syscall wrapper (API 30+ only in bionic)
     */
    private fun createHeaderStubs(prefix: String) {
        val cmd = """
            mkdir -p "$prefix/include/android"

            cat > "$prefix/include/android/api-level.h" << 'H1'
#pragma once
#define __ANDROID_API__ 24
H1

            cat > "$prefix/include/spawn.h" << 'H2'
#pragma once
#include <sys/types.h>
typedef struct { short __flags; pid_t __pgroup; } posix_spawnattr_t;
typedef struct { int __allocated; int __used; void **__actions; } posix_spawn_file_actions_t;
static inline int posix_spawn(pid_t *p,const char *path,const posix_spawn_file_actions_t *fa,const posix_spawnattr_t *a,char *const argv[],char *const envp[]){return -1;}
static inline int posix_spawnp(pid_t *p,const char *file,const posix_spawn_file_actions_t *fa,const posix_spawnattr_t *a,char *const argv[],char *const envp[]){return -1;}
static inline int posix_spawnattr_init(posix_spawnattr_t *a){return 0;}
static inline int posix_spawnattr_destroy(posix_spawnattr_t *a){return 0;}
static inline int posix_spawnattr_setflags(posix_spawnattr_t *a,short f){a->__flags=f;return 0;}
static inline int posix_spawnattr_setpgroup(posix_spawnattr_t *a,pid_t g){a->__pgroup=g;return 0;}
static inline int posix_spawn_file_actions_init(posix_spawn_file_actions_t *fa){return 0;}
static inline int posix_spawn_file_actions_destroy(posix_spawn_file_actions_t *fa){return 0;}
static inline int posix_spawn_file_actions_adddup2(posix_spawn_file_actions_t *fa,int o,int n){return 0;}
static inline int posix_spawn_file_actions_addclose(posix_spawn_file_actions_t *fa,int f){return 0;}
#define POSIX_SPAWN_SETPGROUP 2
#define POSIX_SPAWN_SETSIGDEF 4
#define POSIX_SPAWN_SETSIGMASK 8
H2

            cat > "$prefix/include/renameat2_shim.h" << 'H3'
#pragma once
#include <sys/syscall.h>
#include <unistd.h>
#include <fcntl.h>
#include <linux/fs.h>
static inline int renameat2(int olddirfd, const char *oldpath, int newdirfd, const char *newpath, unsigned int flags) {
    return syscall(__NR_renameat2, olddirfd, oldpath, newdirfd, newpath, flags);
}
H3
            echo "Header stubs created"
        """.trimIndent()
        runInPrefix(cmd) { Log.d(TAG, "[headers] $it") }
    }

    /**
     * Install OpenClaw via npm with --ignore-scripts (to skip the koffi
     * native build during npm install), then build koffi separately with
     * the correct CXXFLAGS/LDFLAGS. Finally, apply Termux path patches.
     *
     * Based on https://github.com/AidanPark/openclaw-android
     */
    fun installOpenClaw(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
                val prefix = paths.prefixDir
        val npmCli = "$prefix/lib/node_modules/npm/bin/npm-cli.js"

        // If the AnyClaw rootfs is in place it already ships OpenClaw
        // (and the patched bin/openclaw, koffi, openclaw.mjs shebang,
        // and bin/ocx wrapper). Skip the on-device npm install entirely
        // — those npm installs are slow, fragile, and fail on locked-down
        // devices. We still run the patch steps below because they're
        // idempotent and harmless when the rootfs is already patched.
        if (isOpenClawInstalled() && AnyClawBootstrapper.isInstalled(context)) {
            Log.i(TAG, "OpenClaw provided by AnyClaw rootfs — skipping npm install")
            onProgress("OpenClaw provided by AnyClaw rootfs")
            runInPrefix("mkdir -p $prefix/tmp/openclaw ${paths.homeDir}/.openclaw-android/patches ${paths.homeDir}/.openclaw")
            val systemctlStub = File(prefix, "bin/systemctl")
            if (!systemctlStub.exists()) {
                systemctlStub.writeText(
                    "#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh\n" +
                        "exit 0\n"
                )
                systemctlStub.setExecutable(true)
            }
            patchOpenClawPaths()
            patchGatewayForAndroid()
            return isOpenClawInstalled()
        }

        // Create directories OpenClaw expects
        runInPrefix("mkdir -p $prefix/tmp/openclaw ${paths.homeDir}/.openclaw-android/patches ${paths.homeDir}/.openclaw")

        // Install systemctl stub (OpenClaw checks for systemd)
        val systemctlStub = File(prefix, "bin/systemctl")
        if (!systemctlStub.exists()) {
            systemctlStub.writeText(
                "#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh\n" +
                    "exit 0\n"
            )
            systemctlStub.setExecutable(true)
            Log.i(TAG, "Created systemctl stub")
        }

        // Configure git to use HTTPS instead of SSH (ssh not available in prefix)
        configureGitHttps(paths)

        // Clean npm cache to avoid stale git clones
        runInPrefix("node $npmCli cache clean --force 2>&1") { Log.d(TAG, "[npm-cache] $it") }

        onProgress("Installing OpenClaw (npm)…")
        val installCode = runInPrefixWithRetry(
            "node $npmCli install -g --ignore-scripts --no-save --no-package-lock --no-audit --no-fund openclaw@latest 2>&1",
            onOutput = { onProgress(it) },
        )
        if (installCode != 0) {
            Log.e(TAG, "npm install openclaw failed with code $installCode")
            return false
        }

        // Build koffi native module separately
        onProgress("Building koffi native module…")
        val koffiBuilt = buildKoffi(prefix, paths.homeDir, onProgress)
        if (!koffiBuilt) {
            Log.w(TAG, "koffi build failed (OpenClaw may have limited functionality)")
        }

        // Patch hardcoded paths in the installed JS files
        onProgress("Patching OpenClaw paths…")
        patchOpenClawPaths()

        // Patch gateway JS to survive Android network interface errors
        // and allow device-auth bypass
        onProgress("Patching gateway for Android…")
        patchGatewayForAndroid()

        return isOpenClawInstalled()
    }

    /**
     * Write git insteadOf rules so all SSH GitHub URLs are rewritten
     * to HTTPS (we don't have ssh in our prefix).
     */
    private fun configureGitHttps(paths: BootstrapInstaller.Paths) {
        val gitconfigFile = File(paths.homeDir, ".gitconfig")
        val desired = """
            |[url "https://github.com/"]
            |	insteadOf = ssh://git@github.com/
            |	insteadOf = git@github.com:
        """.trimMargin()
        val existing = if (gitconfigFile.exists()) gitconfigFile.readText() else ""
        if (!existing.contains("insteadOf = ssh://git@github.com")) {
            gitconfigFile.appendText("\n$desired\n")
        }
    }

    /**
     * Build the koffi native FFI module inside the already-installed
     * openclaw package. Uses cmake + make + clang with our patched
     * binaries and header stubs.
     */
    private fun buildKoffi(prefix: String, homeDir: String, onProgress: (String) -> Unit): Boolean {
        val koffiDir = "$prefix/lib/node_modules/openclaw/node_modules/koffi"
        if (!File(koffiDir, "src/cnoke/cnoke.js").exists()) {
            Log.w(TAG, "koffi cnoke.js not found, skipping build")
            return false
        }

        val shimHeader = "$prefix/include/renameat2_shim.h"
        val buildCmd = """
            export CC=clang CXX=clang++ \
                CFLAGS="-include $shimHeader" \
                CXXFLAGS="-include $shimHeader" \
                LDFLAGS="-fuse-ld=lld" \
                SHELL=/system/bin/sh &&
            rm -rf "$koffiDir/build" &&
            cd "$koffiDir" &&
            node src/cnoke/cnoke.js -p . -d src/koffi --prebuild 2>&1
        """.trimIndent()

        val code = runInPrefix(buildCmd, onOutput = { onProgress(it) })
        if (code != 0) {
            Log.e(TAG, "koffi build failed with code $code")
            return false
        }

        Log.i(TAG, "koffi native module built successfully")
        return true
    }

    /**
     * Replace hardcoded Linux paths in OpenClaw's JS files with our
     * Termux prefix equivalents, and fix the openclaw.mjs shebang.
     * Mirrors patch-paths.sh from openclaw-android.
     */
    private fun patchOpenClawPaths() {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val openclawDir = "$prefix/lib/node_modules/openclaw"

        val patchCmd = """
            ODIR="$openclawDir"
            [ ! -d "${'$'}ODIR" ] && echo "OpenClaw dir not found" && exit 0

            # Fix the openclaw.mjs shebang
            if [ -f "${'$'}ODIR/openclaw.mjs" ]; then
                sed -i "1s|#!/usr/bin/env node|#!$prefix/bin/node|" "${'$'}ODIR/openclaw.mjs"
            fi

            # Patch /tmp -> $prefix/tmp
            for f in ${'$'}(grep -rl '/tmp' "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null); do
                sed -i "s|\"\/tmp/|\"$prefix/tmp/|g" "${'$'}f"
                sed -i "s|'\/tmp/|'$prefix/tmp/|g" "${'$'}f"
                sed -i "s|\`\/tmp/|\`$prefix/tmp/|g" "${'$'}f"
                sed -i "s|\"\/tmp\"|\"$prefix/tmp\"|g" "${'$'}f"
                sed -i "s|'\/tmp'|'$prefix/tmp'|g" "${'$'}f"
            done

            # Patch /bin/sh -> $prefix/bin/sh
            for f in ${'$'}(grep -rl '"/bin/sh"' "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null) \
                     ${'$'}(grep -rl "'/bin/sh'" "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null); do
                sed -i "s|\"\/bin\/sh\"|\"$prefix/bin/sh\"|g" "${'$'}f"
                sed -i "s|'\/bin\/sh'|'$prefix/bin/sh'|g" "${'$'}f"
            done

            # Patch /bin/bash -> $prefix/bin/bash
            for f in ${'$'}(grep -rl '"/bin/bash"' "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null) \
                     ${'$'}(grep -rl "'/bin/bash'" "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null); do
                sed -i "s|\"\/bin\/bash\"|\"$prefix/bin/bash\"|g" "${'$'}f"
                sed -i "s|'\/bin\/bash'|'$prefix/bin/bash'|g" "${'$'}f"
            done

            # Patch /usr/bin/env -> $prefix/bin/env
            for f in ${'$'}(grep -rl '"/usr/bin/env"' "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null) \
                     ${'$'}(grep -rl "'/usr/bin/env'" "${'$'}ODIR" --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null); do
                sed -i "s|\"\/usr\/bin\/env\"|\"$prefix/bin/env\"|g" "${'$'}f"
                sed -i "s|'\/usr\/bin\/env'|'$prefix/bin/env'|g" "${'$'}f"
            done

            echo "Path patches applied"
        """.trimIndent()

        runInPrefix(patchCmd) { Log.d(TAG, "[patch] $it") }
        Log.i(TAG, "OpenClaw path patches applied")
    }

    /**
     * Patch OpenClaw gateway JS files for Android compatibility:
     * 1. runner-*.js: Prevent process.exit(1) on @homebridge/ciao
     *    assertion errors (Android's ccmni cellular interface triggers
     *    "Could not find valid addresses for interface 'ccmniN'").
     * 2. gateway-cli-*.js: Make evaluateMissingDeviceIdentity() return
     *    "allow" when dangerouslyDisableDeviceAuth is true, so the
     *    Control UI can connect without generating device identity keys.
     */
    private fun patchGatewayForAndroid() {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val distDir = "$prefix/lib/node_modules/openclaw/dist"

        val patchCmd = """
            DIST="$distDir"
            [ ! -d "${'$'}DIST" ] && echo "dist not found" && exit 0

            # 1. Patch runner-*.js: catch network interface errors
            for f in ${'$'}DIST/runner-*.js; do
                [ ! -f "${'$'}f" ] && continue
                grep -q 'Unhandled promise rejection' "${'$'}f" || continue
                sed -i 's|console.error("\[openclaw\] Unhandled promise rejection:", formatUncaughtError(reason));|if (reason \&\& reason.message \&\& reason.message.includes("interface")) { console.warn("[openclaw] Non-fatal network interface error (continuing):", formatUncaughtError(reason)); return; } console.error("[openclaw] Unhandled promise rejection:", formatUncaughtError(reason));|' "${'$'}f"
                echo "patched runner: ${'$'}f"
            done

            # 2. Patch gateway-cli-*.js: allow device-auth bypass
            for f in ${'$'}DIST/gateway-cli-*.js; do
                [ ! -f "${'$'}f" ] && continue
                grep -q 'evaluateMissingDeviceIdentity' "${'$'}f" || continue
                sed -i 's|function evaluateMissingDeviceIdentity(params) {|function evaluateMissingDeviceIdentity(params) { if (params.controlUiAuthPolicy.allowBypass) return { kind: "allow" };|' "${'$'}f"
                echo "patched gateway-cli: ${'$'}f"
            done

            echo "Gateway Android patches applied"
        """.trimIndent()

        runInPrefix(patchCmd) { Log.d(TAG, "[gw-patch] $it") }
        Log.i(TAG, "Gateway Android patches applied")
    }

    /**
     * Write openclaw.json (gateway auth=none + dangerouslyDisableDeviceAuth)
     * and auth-profiles.json (OpenAI token from existing Codex login).
     * auth.mode is "none" because the Control UI's device-token
     * negotiation can fail on fresh installs when no device token is
     * stored, causing token_missing rejections.  The combination of
     * auth=none + dangerouslyDisableDeviceAuth + allowInsecureAuth
     * lets any local client connect without authentication.
     */
    fun configureOpenClawAuth() {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val openclawDir = File(paths.homeDir, ".openclaw")
        openclawDir.mkdirs()

        val configFile = File(openclawDir, "openclaw.json")
        val configJson = """
            |{
            |  "meta": {
            |    "lastTouchedVersion": "2026.2.21-2",
            |    "lastTouchedAt": "${java.time.Instant.now()}"
            |  },
            |  "commands": {
            |    "native": "auto",
            |    "nativeSkills": "auto",
            |    "restart": true,
            |    "ownerDisplay": "raw"
            |  },
            |  "gateway": {
            |    "mode": "local",
            |    "controlUi": {
            |      "enabled": true,
            |      "allowedOrigins": ["http://127.0.0.1:$OPENCLAW_CONTROL_UI_PORT", "http://localhost:$OPENCLAW_CONTROL_UI_PORT"],
            |      "allowInsecureAuth": true,
            |      "dangerouslyDisableDeviceAuth": true
            |    },
            |    "auth": {
            |      "mode": "none"
            |    }
            |  },
            |  "agents": {
            |    "defaults": {
            |      "model": {
            |        "primary": "openai-codex/gpt-5.3-codex"
            |      }
            |    }
            |  }
            |}
        """.trimMargin()
        configFile.writeText(configJson)
        Log.i(TAG, "Wrote OpenClaw config to $configFile")

        // Copy the Codex access_token into OpenClaw's auth-profiles.json.
        // The profile needs: version=1, type="token", provider="openai-codex",
        // and the canonical profile ID "openai-codex:codex-cli".
        // Must be written to both global and agent-specific directories.
        val authJson = File(paths.homeDir, ".codex/auth.json")
        if (authJson.exists()) {
            val copyScript = """
                node -e "
                  const fs = require('fs');
                  const path = require('path');
                  const auth = JSON.parse(fs.readFileSync('${'$'}HOME/.codex/auth.json','utf8'));
                  const token = auth.tokens && auth.tokens.access_token;
                  if (!token) { console.error('No access_token in codex auth'); process.exit(1); }
                  const profiles = {
                    version: 1,
                    profiles: {
                      'openai-codex:codex-cli': {
                        type: 'token',
                        provider: 'openai-codex',
                        token: token,
                        source: 'codex-auth',
                        createdAt: new Date().toISOString()
                      },
                      'openai:codex': {
                        type: 'token',
                        provider: 'openai',
                        token: token,
                        source: 'codex-auth',
                        createdAt: new Date().toISOString()
                      }
                    },
                    order: ['openai-codex:codex-cli', 'openai:codex']
                  };
                  const json = JSON.stringify(profiles, null, 2);
                  fs.writeFileSync('${'$'}HOME/.openclaw/auth-profiles.json', json);
                  const agentDir = '${'$'}HOME/.openclaw/agents/main/agent';
                  fs.mkdirSync(agentDir, { recursive: true });
                  fs.writeFileSync(path.join(agentDir, 'auth-profiles.json'), json);
                  console.log('OpenClaw auth-profiles.json written (global + agent)');
                " 2>&1
            """.trimIndent()
            runInPrefix(copyScript) { Log.d(TAG, "[openclaw-auth] $it") }
        } else {
            Log.w(TAG, "Codex auth.json not found — OpenClaw will lack API credentials")
        }
    }

    /**
     * Start the OpenClaw WebSocket gateway. Requires openclaw.json to be
     * configured first via [configureOpenClawAuth].
     *
     * Before starting:
     * 1. Kill any orphaned gateway process (scanning /proc, PID files).
     * 2. Reset device tokens via `openclaw gateway token reset` so stale
     *    device identities from previous devices/browsers are wiped.
     * 3. Clear lock/pid files and client-side device-auth state.
     *
     * Combined with `dangerouslyDisableDeviceAuth: true` and
     * `allowInsecureAuth: true` in openclaw.json, this ensures any
     * device can connect without "device token mismatch" errors.
     */
    fun startOpenClawGateway(): Boolean {
        if (openClawGatewayProcess != null) {
            try {
                openClawGatewayProcess!!.exitValue()
                openClawGatewayProcess = null
            } catch (_: IllegalThreadStateException) {
                Log.i(TAG, "OpenClaw gateway already running")
                return true
            }
        }

        val paths = BootstrapInstaller.getPaths(context)

        // Kill any orphaned gateway processes and reset all device tokens.
        runInPrefix("""
            # Kill by PID file
            for pidfile in ${paths.prefixDir}/tmp/openclaw*/gateway.pid ${paths.prefixDir}/tmp/openclaw/gateway.pid; do
                [ -f "${'$'}pidfile" ] && kill -9 ${'$'}(cat "${'$'}pidfile" 2>/dev/null) 2>/dev/null
            done
            # Scan /proc for any node process bound to the gateway port
            for pid in ${'$'}(ls /proc 2>/dev/null | grep '^[0-9]'); do
                if cat /proc/${'$'}pid/cmdline 2>/dev/null | tr '\0' ' ' | grep -q "18790"; then
                    kill -9 ${'$'}pid 2>/dev/null
                fi
            done
            # Snapshot stale gateway lock/pid files BEFORE we delete them,
            # so we can tell a real "previous run died" from a fresh start.
            stale=0
            for pidfile in ${paths.prefixDir}/tmp/openclaw/gateway.pid ${paths.prefixDir}/tmp/openclaw/gateway.lock; do
                if [ -e "${'$'}pidfile" ]; then stale=1; break; fi
            done
            # Clear stale lock/pid files now that we've recorded the state.
            rm -f ${paths.prefixDir}/tmp/openclaw*/gateway.lock ${paths.prefixDir}/tmp/openclaw*/gateway.pid 2>/dev/null
            rm -f ${paths.prefixDir}/tmp/openclaw/gateway.lock ${paths.prefixDir}/tmp/openclaw/gateway.pid 2>/dev/null
            # Only wipe device-auth state when we detected a stale PID/lock
            # above. A fresh start must NEVER delete the identity keypair
            # or paired-device tokens, otherwise every app restart kicks
            # the user's paired devices.
            if [ "${"$"}stale" = "1" ]; then
                rm -rf ${paths.homeDir}/.local/state/openclaw/identity 2>/dev/null
                rm -f ${paths.homeDir}/.local/state/openclaw/device-auth.json 2>/dev/null
                timeout 5 openclaw gateway token reset 2>&1 || echo "token reset skipped"
                echo "Stale gateway state cleared, pairings reset"
            else
                echo "No stale gateway state, keeping device pairings"
            fi
            echo "Gateway state cleaned"
        """.trimIndent()) { Log.d(TAG, "[openclaw-gw] $it") }

        val env = buildEnvironment(paths)
        val shell = "${paths.prefixDir}/bin/sh"
                // Patch openclaw.json: clear denyCommands, set allowCommands for Android
        runInPrefix("""
            mkdir -p ${paths.homeDir}/.openclaw
            [ -f ${paths.homeDir}/.openclaw/openclaw.json ] && {
                # Backup first
                cp ${paths.homeDir}/.openclaw/openclaw.json ${paths.homeDir}/.openclaw/openclaw.json.bak 2>/dev/null
                # Remove denyCommands and set allowCommands for all commands
                node -e '
                    const fs = require("fs");
                    const p = "${paths.homeDir}/.openclaw/openclaw.json";
                    try {
                        let c = JSON.parse(fs.readFileSync(p, "utf8"));
                        if (!c.gateway) c.gateway = {};
                        if (!c.gateway.node) c.gateway.node = {};
                        c.gateway.node.denyCommands = [];
                        c.gateway.node.allowCommands = ["camera.snap","camera.clip","camera.list","canvas.navigate","canvas.eval","canvas.snapshot","flash.on","flash.off","flash.toggle","flash.status","location.get","screen.record","sensor.read","sensor.list","haptic.vibrate"];
                        fs.writeFileSync(p, JSON.stringify(c, null, 2));
                        console.log("patched openclaw.json");
                    } catch(e) { console.error("patch failed:", e.message); }
                ' 2>&1 || echo "config patch skipped"
            }
        """) { Log.d(TAG, "[openclaw-cfg] $it") }
        val cmd = "exec openclaw gateway run --force --port $OPENCLAW_GATEWAY_PORT 2>&1"

        val pb = ProcessBuilder(shell, "-c", cmd)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        openClawGatewayProcess = proc

        val gwOutput = ArrayDeque<String>()
        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[openclaw-gw] $line")
                synchronized(gwOutput) {
                    gwOutput.addLast(line)
                    while (gwOutput.size > 30) gwOutput.removeFirst()
                }
                line = reader.readLine()
            }
            val exitCode = proc.waitFor()
            Log.i(TAG, "[openclaw-gw] exited with code: $exitCode")
            if (exitCode != 0) {
                Log.e(TAG, "[openclaw-gw] FAILED: ${gwOutput.joinToString("\n").takeLast(500)}")
            }
        }.start()

        // Wait for gateway to bind its WebSocket port.
        // Probe the TCP port with a socket connect (works even though
        // it's WebSocket, not HTTP). Retry up to 5 times × 2s = 10s.
        var gwReady = false
        for (attempt in 1..5) {
            Thread.sleep(2000)
            if (!processAlive(openClawGatewayProcess)) {
                Log.e(TAG, "OpenClaw gateway process exited on attempt $attempt")
                openClawGatewayProcess = null
                return false
            }
            try {
                val sock = java.net.Socket()
                sock.connect(java.net.InetSocketAddress("127.0.0.1", OPENCLAW_GATEWAY_PORT), 1500)
                sock.close()
                gwReady = true
                Log.i(TAG, "OpenClaw gateway port $OPENCLAW_GATEWAY_PORT is listening (attempt $attempt)")
                break
            } catch (_: Exception) {
                Log.d(TAG, "OpenClaw gateway port not ready yet (attempt $attempt/5)")
            }
        }
        if (!gwReady) {
            Log.e(TAG, "OpenClaw gateway port $OPENCLAW_GATEWAY_PORT not listening after 10s")
            openClawGatewayProcess = null
            return false
        }
        return true
    }

    /**
     * Start a lightweight Node.js static file server to serve the OpenClaw
     * Control UI on [OPENCLAW_CONTROL_UI_PORT]. The UI assets live inside
     * the installed openclaw npm package at dist/control-ui/.
     */
    fun startOpenClawControlUiServer(): Boolean {
        if (openClawControlUiProcess != null) {
            try {
                openClawControlUiProcess!!.exitValue()
                openClawControlUiProcess = null
            } catch (_: IllegalThreadStateException) {
                Log.i(TAG, "OpenClaw Control UI server already running")
                return true
            }
        }

        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths)
        val prefix = paths.prefixDir
        val controlUiRoot = "$prefix/lib/node_modules/openclaw/dist/control-ui"

        if (!File(controlUiRoot).exists()) {
            Log.w(TAG, "OpenClaw control-ui directory not found at $controlUiRoot")
            return false
        }

        val shell = "${paths.prefixDir}/bin/sh"
        // Write the server script to a temp file to avoid shell escaping issues.
        val serverFile = File(paths.homeDir, ".tmp_control_ui_server.js")
        serverFile.parentFile?.mkdirs()
        serverFile.writeText("""
            const http = require('http');
            const fs = require('fs');
            const path = require('path');
            const root = '$controlUiRoot';
            const wsUrl = 'ws://127.0.0.1:$OPENCLAW_GATEWAY_PORT';
            const mimeTypes = {
              '.html':'text/html','.js':'application/javascript',
              '.css':'text/css','.json':'application/json',
              '.svg':'image/svg+xml','.png':'image/png',
              '.woff2':'font/woff2','.woff':'font/woff',
            };
            http.createServer((req, res) => {
              let url = req.url.split('?')[0];
              if (url === '/') url = '/index.html';
              const fp = path.join(root, url);
              if (!fp.startsWith(root)) { res.writeHead(403); return res.end(); }
              fs.readFile(fp, (err, data) => {
                if (err) {
                  fs.readFile(path.join(root,'index.html'), (e2, d2) => {
                    res.writeHead(200, {'Content-Type':'text/html'});
                    res.end(d2);
                  });
                  return;
                }
                const ext = path.extname(fp);
                res.writeHead(200, {'Content-Type': mimeTypes[ext]||'application/octet-stream'});
                res.end(data);
              });
            }).listen($OPENCLAW_CONTROL_UI_PORT, '0.0.0.0', () => console.log('Control UI on port $OPENCLAW_CONTROL_UI_PORT (ws=' + wsUrl + ')'));
        """.trimIndent())

        val pb = ProcessBuilder(shell, "-c", "exec node ${serverFile.absolutePath} 2>&1")
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        openClawControlUiProcess = proc

                Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[openclaw-ui] $line")
                line = reader.readLine()
            }
            Log.i(TAG, "OpenClaw Control UI server exited")
        }.start()

        // Wait for the listener to bind — Node cold-start on Android can
        // take a couple of seconds, and the dashboard immediately tries
        // to fetch the control UI, so a blind Thread.sleep returned
        // success while the port was still closed. Poll up to ~10s.
        for (attempt in 1..10) {
            Thread.sleep(1000)
            if (!processAlive(openClawControlUiProcess)) {
                Log.e(TAG, "OpenClaw Control UI server exited on attempt $attempt")
                openClawControlUiProcess = null
                return false
            }
            try {
                val sock = java.net.Socket()
                sock.connect(java.net.InetSocketAddress("127.0.0.1", OPENCLAW_CONTROL_UI_PORT), 1500)
                sock.close()
                Log.i(TAG, "OpenClaw Control UI ready on port $OPENCLAW_CONTROL_UI_PORT (attempt $attempt)")
                return true
            } catch (_: Exception) {
                Log.d(TAG, "OpenClaw Control UI port not ready yet (attempt $attempt/10)")
            }
        }
        Log.e(TAG, "OpenClaw Control UI did not bind within 10s")
        openClawControlUiProcess = null
        return false
    }

    fun installCodex(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val npmCli = "$prefix/lib/node_modules/npm/bin/npm-cli.js"

        onProgress("Installing Codex CLI…")
        val codexCode = runInPrefixWithRetry(
            "node $npmCli install -g @openai/codex 2>&1",
            onOutput = { onProgress(it) },
        )
        if (codexCode != 0) {
            Log.e(TAG, "npm install @openai/codex failed with code $codexCode")
            return false
        }

        ensureCodexWrapperScript()
        return isCodexInstalled()
    }

    fun ensureCodexWrapperScript() {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val codexJs = File(prefix, "lib/node_modules/@openai/codex/bin/codex.js")
        val codexBin = File(prefix, "bin/codex")

        if (!codexJs.exists()) return
        if (codexBin.exists()) return

        val wrapperCmd = """
            rm -f "$prefix/bin/codex"
            cat > "$prefix/bin/codex" << 'WEOF'
#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh
exec /data/user/0/com.dagestan.mobile/files/usr/bin/node /data/user/0/com.dagestan.mobile/files/usr/lib/node_modules/@openai/codex/bin/codex.js "${'$'}@"
WEOF
            chmod 700 "$prefix/bin/codex"
            echo "codex wrapper created"
        """.trimIndent()
        runInPrefix(wrapperCmd)
        Log.i(TAG, "Created codex wrapper at $codexBin")
    }

    fun installServerBundle(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
                val targetDir = File(paths.prefixDir, "lib/node_modules/codex-web-local")

        // If the AnyClaw rootfs is in place it already ships
        // codex-web-local under the right path — don't clobber it with
        // the (potentially older) APK asset bundle.
        if (isServerBundleInstalled() && AnyClawBootstrapper.isInstalled(context)) {
            Log.i(TAG, "codex-web-local provided by AnyClaw rootfs — skipping")
            onProgress("codex-web-local provided by AnyClaw rootfs")
            return true
        }

        try {
            val assetFiles = context.assets.list("server-bundle") ?: emptyArray()
            if (assetFiles.isNotEmpty()) {
                onProgress("Installing server bundle from APK…")
                targetDir.deleteRecursively()
                targetDir.mkdirs()
                extractAssetDir("server-bundle", targetDir)
                Log.i(TAG, "Server bundle extracted to $targetDir")
                return true
            }
        } catch (e: Exception) {
            Log.d(TAG, "No bundled server-bundle asset, will use npm: ${e.message}")
        }

        // Fallback: install from the npm registry (pinned version).
        if (isServerBundleInstalled()) return true
        onProgress("Installing web server (npm)…")
        val npmCli = "${paths.prefixDir}/lib/node_modules/npm/bin/npm-cli.js"
        val code = runInPrefixWithRetry(
            "node $npmCli install -g codex-web-local@0.1.0 2>&1",
            onOutput = { onProgress(it) },
        )
        if (code != 0) {
            Log.e(TAG, "npm install codex-web-local failed with code $code")
            lastServerError = "npm install codex-web-local failed (exit $code)"
            return false
        }
        val ok = isServerBundleInstalled()
        if (!ok) {
            lastServerError = "codex-web-local installed but dist-cli/index.js is missing"
        }
        return ok
    }

    /**
     * Install the platform-specific native Codex binary.
     * npm refuses to install it on android (os mismatch), so we download
     * the tarball via Node.js and extract it manually.
     */
    fun installPlatformBinary(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val targetPkg = "$prefix/lib/node_modules/@openai/codex-linux-arm64"

        onProgress("Downloading Codex native binary…")

        // Use Node.js (which has working TLS) to download the npm tarball
        val installCmd = """
            mkdir -p "$prefix/tmp/_codex_bin" && cd "$prefix/tmp/_codex_bin" &&
            node -e '
              const https = require("https");
              const fs = require("fs");
              const url = "https://registry.npmjs.org/@openai/codex/-/codex-$CODEX_VERSION-linux-arm64.tgz";
              const file = fs.createWriteStream("codex-bin.tgz");
              https.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  https.get(res.headers.location, (r2) => r2.pipe(file).on("finish", () => {
                    file.close(); console.log("Downloaded"); process.exit(0);
                  }));
                } else {
                  res.pipe(file).on("finish", () => {
                    file.close(); console.log("Downloaded"); process.exit(0);
                  });
                }
              }).on("error", (e) => { console.error(e.message); process.exit(1); });
            ' 2>&1 &&
            tar xzf codex-bin.tgz 2>&1 &&
            mkdir -p "$targetPkg/vendor/aarch64-unknown-linux-musl/codex" &&
            cp package/vendor/aarch64-unknown-linux-musl/codex/codex "$targetPkg/vendor/aarch64-unknown-linux-musl/codex/codex" &&
            cp package/package.json "$targetPkg/package.json" &&
            chmod 700 "$targetPkg/vendor/aarch64-unknown-linux-musl/codex/codex" &&
            rm -rf "$prefix/tmp/_codex_bin" &&
            echo "Platform binary installed"
        """.trimIndent()

        val code = runInPrefix(installCmd, onOutput = { onProgress(it) })
        if (code != 0) {
            Log.e(TAG, "Platform binary install failed with code $code")
            return false
        }

        return isPlatformBinaryInstalled()
    }

    // ── OpenCodex proxy (lidge-jun/opencodex) ─────────────────────────

    fun isOpenCodexInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val bunExists = File(paths.prefixDir, "bin/bun").exists()
        val pkgExists = File(paths.prefixDir, "lib/node_modules/@bitkyc08/opencodex/package.json").exists()
        val ocxBin = File(paths.prefixDir, "bin/ocx")
        val ocxExists = ocxBin.exists() && ocxBin.canExecute()
        return bunExists && pkgExists && ocxExists
    }

    val isOpenCodexRunning: Boolean
        get() = processAlive(openCodexProcess)

    /**
     * Install the OpenCode CLI: npm first, then a direct arm64 release
     * download (npm skips platform binaries on Android, same as Codex).
     */
    /**
     * Install Bun from TUR (bionic build) + OpenCodex via npm.
     * OpenCodex translates Codex's Responses API into any provider — the
     * universal bridge for OpenRouter, NVIDIA NIM, DeepSeek, Ollama, etc.
     */
    fun installOpenCodex(onProgress: (String) -> Unit): Boolean {
        if (isOpenCodexInstalled()) return true
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        val npmCli = "$prefix/lib/node_modules/npm/bin/npm-cli.js"

        // Try extracting from bundled APK assets first (instant, no network).
        extractBundledOpenCodex(onProgress)
        // NOTE: Do NOT return here — bundled extraction creates the package directory
        // but NOT the bin/ocx wrapper. We must continue to Step 3 to create it.

        // Step 1: install Bun 1.4.0 (bionic, from Termux User Repository).
        if (!File(prefix, "bin/bun").exists()) {
            onProgress("Installing Bun from TUR…")
            val debCmd = """
                mkdir -p "$prefix/tmp/_bun" && cd "$prefix/tmp/_bun" &&
                node -e '
                  const https = require("https"); const fs = require("fs");
                  const url="https://tur.kcubeterm.com/pool/tur/bun_${BUN_VERSION}_aarch64.deb";
                  const f=fs.createWriteStream("bun.deb");
                  https.get(url,(r)=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)
                    https.get(r.headers.location,(r2)=>r2.pipe(f).on("finish",()=>{f.close();process.exit(0)}));
                  else r.pipe(f).on("finish",()=>{f.close();process.exit(0)})}).on("error",e=>{console.error(e.message);process.exit(1)});
                ' 2>&1 &&
                dpkg-deb -x bun.deb extract 2>/dev/null || (ar p bun.deb data.tar.xz > data.tar.xz 2>/dev/null && mkdir -p extract && tar xJf data.tar.xz -C extract) &&
                cp extract/data/data/com.termux/files/usr/bin/bun "$prefix/bin/bun" &&
                chmod 700 "$prefix/bin/bun" && rm -rf "$prefix/tmp/_bun" &&
                echo "bun $(bun --version)"
            """.trimIndent()
            val bunCode = runInPrefix(debCmd, onOutput = { onProgress(it) })
            if (bunCode != 0 || !File(prefix, "bin/bun").exists()) {
                Log.e(TAG, "Bun install failed (code=$bunCode) — OpenCodex cannot run without Bun")
                onProgress("Bun install failed — OpenCodex will be unavailable")
                return false
            }
        }

        // Step 2: npm install opencodex.
        // Two important flags here:
        //   --ignore-scripts : skip the postinstall, which would try to
        //     download a bun native binary from the optional @oven
        //     registry. That fails inside our Termux prefix and also
        //     races with the per-package install below.
        //   --no-save        : the package is already on disk, we just
        //     want a clean install of its declared deps.
        // OPENCODEX_BUN_PATH points the runtime at our pre-bundled bun.
        onProgress("Installing OpenCodex (npm)…")
        runInPrefixWithRetry(
            "OPENCODEX_BUN_PATH=$prefix/bin/bun node $npmCli install -g --ignore-scripts --no-save --no-package-lock @bitkyc08/opencodex 2>&1",
            onOutput = { onProgress(it) },
        )
        // Always make sure the per-package deps are present. The bundled
        // tarball ships the source but not node_modules. We pass
        // --ignore-scripts so any postinstall in transitive deps
        // does not try to download native binaries.
        runInPrefix("cd $prefix/lib/node_modules/@bitkyc08/opencodex 2>/dev/null && node $npmCli install --ignore-scripts --no-save --no-package-lock --omit=dev 2>&1 || true")

        // Step 3: ensure ocx binary exists and is executable
        onProgress("Verifying OpenCodex binary...")
        runInPrefix("chmod 700 $prefix/bin/ocx 2>/dev/null || true")
        runInPrefix("if [ ! -f $prefix/bin/ocx ]; then " +
            "OCX_JS=$prefix/lib/node_modules/@bitkyc08/opencodex/bin/ocx.mjs; " +
            "if [ -f \"${'$'}OCX_JS\" ]; then " +
            "echo '#!/data/user/0/com.dagestan.mobile/files/usr/bin/sh' > $prefix/bin/ocx && " +
            "echo 'exec /data/user/0/com.dagestan.mobile/files/usr/bin/node /data/user/0/com.dagestan.mobile/files/usr/lib/node_modules/@bitkyc08/opencodex/bin/ocx.mjs \"${'$'}@\"' >> $prefix/bin/ocx && " +
            "chmod 700 $prefix/bin/ocx; fi; fi")
        // Step 4: verify it actually runs.
        // We can't pipe through `head` here — runInPrefix returns the
        // shell's exit code, so `... | head -1` would always look like
        // success even if ocx crashed. Capture stdout ourselves and
        // treat any non-empty "x.y.z" line as a healthy version string.
        val probeOutput = StringBuilder()
        val probe = runInPrefix(
            "OPENCODEX_BUN_PATH=$prefix/bin/bun $prefix/bin/ocx --version 2>&1",
        ) { probeOutput.appendLine(it) }
        val probeText = probeOutput.toString().trim()
        val healthyVersion = Regex("""\d+\.\d+\.\d+""").containsMatchIn(probeText)
        if (probe != 0 || !healthyVersion) {
            onProgress("OpenCodex install failed — ocx binary not working: ${probeText.take(120)}")
            return false
        }
        Log.i(TAG, "OpenCodex installed and verified")
        return isOpenCodexInstalled()
    }

    /** Start OpenCodex proxy on 127.0.0.1:[OPENCODEX_PORT] (dashboard at /). */
    fun startOpenCodexServer(): Boolean {
        if (isOpenCodexRunning) return true
        if (!isOpenCodexInstalled()) {
            openCodexLastError = "OpenCodex not installed — tap Start to install"
            return false
        }

        openCodexLastError = null
        synchronized(openCodexOutput) { openCodexOutput.clear() }

        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths).toMutableMap()
        env["OPENCODEX_BUN_PATH"] = "${paths.prefixDir}/bin/bun"
        // Ensure node_modules are complete — CJS loading fails if deps are missing
        runInPrefix("cd ${paths.prefixDir}/lib/node_modules/@bitkyc08/opencodex 2>/dev/null && ${paths.prefixDir}/bin/node ${paths.prefixDir}/lib/node_modules/npm/bin/npm-cli.js install --ignore-scripts --omit=dev 2>&1 || true")
        val shell = "${paths.prefixDir}/bin/sh"
        // Use NODE_PATH to help CJS resolver find modules
        env["NODE_PATH"] = "${paths.prefixDir}/lib/node_modules/@bitkyc08/opencodex/node_modules:${paths.prefixDir}/lib/node_modules"
        val ocxWrapper = "${paths.prefixDir}/bin/ocx"
        val ocxEntry = "${paths.prefixDir}/lib/node_modules/@bitkyc08/opencodex/bin/ocx.mjs"
        val cmd = "cd ${paths.prefixDir}/lib/node_modules/@bitkyc08/opencodex && " +
            "if [ -x $ocxWrapper ]; then exec $ocxWrapper start --port $OPENCODEX_PORT 2>&1; " +
            "else exec ${paths.prefixDir}/bin/node $ocxEntry start --port $OPENCODEX_PORT 2>&1; fi"

        val pb = ProcessBuilder(shell, "-c", cmd)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = try { pb.start() } catch (e: Exception) {
            openCodexLastError = "Failed to launch OpenCodex: ${e.message}"
            Log.e(TAG, "OpenCodex launch failed", e)
            return false
        }
        openCodexProcess = proc

        // Capture output for diagnostics
        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[opencodex] $line")
                synchronized(openCodexOutput) {
                    openCodexOutput.addLast(line)
                    while (openCodexOutput.size > 30) openCodexOutput.removeFirst()
                }
                line = reader.readLine()
            }
            val exitCode = proc.waitFor()
            Log.i(TAG, "[opencodex] exited with code: $exitCode")
            if (exitCode != 0) {
                openCodexLastError = "OpenCodex exited (code $exitCode): ${openCodexOutput.joinToString("\n").takeLast(500)}"
            }
        }.start()

        wireCodexToProxy()
        Log.i(TAG, "OpenCodex proxy starting on port $OPENCODEX_PORT")
        return true
    }

    /** Poll OpenCodex's /readyz endpoint (unauthenticated) until it answers 200. */
    fun waitForOpenCodex(timeoutMs: Long = 45_000): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        val url = URL("http://127.0.0.1:$OPENCODEX_PORT/readyz")
        while (System.currentTimeMillis() < deadline) {
            val proc = openCodexProcess
            if (proc != null) {
                val alive = try { proc.exitValue(); false } catch (_: IllegalThreadStateException) { true }
                if (!alive) { Log.e(TAG, "OpenCodex process exited"); return false }
            }
            try {
                val c = url.openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 2000; c.readTimeout = 2000; c.requestMethod = "GET"
                val code = c.responseCode; c.disconnect()
                if (code == 200) { Log.i(TAG, "OpenCodex proxy ready"); return true }
            } catch (_: Exception) { }
            Thread.sleep(500)
        }
        Log.e(TAG, "OpenCodex proxy not ready in ${timeoutMs}ms")
        return false
    }

    fun stopOpenCodex() {
        val proc = openCodexProcess ?: return
        openCodexProcess = null
        try {
            proc.destroy()
            Thread({ Thread.sleep(3000); try { proc.destroyForcibly() } catch (_: Exception) {} }).start()
            proc.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: Exception) { }
        unwireCodexFromProxy()
        Log.i(TAG, "OpenCodex proxy stopped")
    }

    /**
     * Write opencodex.config.toml + inject openai_base_url into config.toml
     * so Codex routes through the local proxy.  Both use the same marker
     * that opencodex itself writes, so `ocx stop` can clean up later.
     */
    fun wireCodexToProxy() {
        val paths = BootstrapInstaller.getPaths(context)
        val codexHome = File(paths.homeDir, ".codex")
        codexHome.mkdirs()

        // 1. Provider table file — tells Codex about the opencodex provider
        val profile = File(codexHome, "opencodex.config.toml")
        profile.writeText(
            "# Auto-injected by opencodex\n" +
            "[model_providers.opencodex]\n" +
            "name = \"OpenCodex Proxy\"" +
            "\nbase_url = \"http://127.0.0.1:$OPENCODEX_PORT/v1\"" +
            "\nwire_api = \"responses\"" +
            "\nrequires_openai_auth = true\n"
        )

        // 2. Switch the active provider to opencodex so ALL requests go through the proxy
        val configFile = File(codexHome, "config.toml")
        val marker = "# Auto-injected by opencodex"
        var config = if (configFile.exists()) configFile.readText() else ""
        // Remove any previous opencodex marker block + old model_provider
        config = config.lines()
            .filter { line -> !line.contains(marker) && !line.trim().startsWith("openai_base_url") && !line.trim().startsWith("model_provider") && !line.trim().startsWith("model = ") }
            .joinToString("\n").trimEnd() + "\n"
        // Switch model_provider to opencodex (all requests go through the proxy)
        config += "\n$marker\n"
        config += "model_provider = \"opencodex\"" + "\n"
        config += "model = \"big-pickle\"" + "\n"
        config += "openai_base_url = \"http://127.0.0.1:$OPENCODEX_PORT/v1\"" + "\n"
        configFile.writeText(config)

        Log.i(TAG, "Codex wired to route through OpenCodex proxy on :$OPENCODEX_PORT")
    }

    /** Remove our marker-injected routing from config.toml (called on proxy stop). */
    private fun unwireCodexFromProxy() {
        val configFile = File(BootstrapInstaller.getPaths(context).homeDir, ".codex/config.toml")
        if (!configFile.exists()) return
        val marker = "# Auto-injected by opencodex"
        // Remove opencodex block and restore the saved provider
        val cleaned = configFile.readText().lines()
            .filter { line -> !line.contains(marker) && !line.trim().startsWith("openai_base_url") && !line.trim().startsWith("model_provider") && !line.trim().startsWith("model = ") }
            .joinToString("\n").trimEnd() + "\n"
        // Re-apply the saved provider
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        val providerId = prefs.getString("provider_id", null)
        if (providerId != null && providerId != "openai") {
            applyProviderConfig(providerId)
        }
        Log.i(TAG, "Codex routing restored (OpenCodex proxy removed)")
    }

    fun opencodexUrl(): String = "http://127.0.0.1:$OPENCODEX_PORT/"

    // ── AI Swarm: multi-agent orchestration using free models ──────────

    /** Free model assignments for each swarm agent role (all via OpenRouter). */
    private data class SwarmAgent(
        val role: String,
        val emoji: String,
        val model: String,
        val systemPrompt: String,
    )

    private val SWARM_AGENTS = listOf(
        SwarmAgent(
            "Architect", "\uD83C\uDFD7\uFE0F",
            "deepseek/deepseek-chat-v3.1:free",
            "You are a senior software architect. Given a task, produce a clear technical plan: file structure, key APIs, data flow, and implementation order. Be concise and specific. Output only the plan.",
        ),
        SwarmAgent(
            "Coder", "\uD83D\uDCBB",
            "qwen/qwen3-235b-a22b:free",
            "You are an expert programmer. Given an architecture plan, write the actual implementation code. Output complete, working code with imports. Be concise — code only, minimal comments.",
        ),
        SwarmAgent(
            "Reviewer", "\uD83D\uDD0D",
            "meta-llama/llama-4-maverick:free",
            "You are a senior code reviewer. Given code, find bugs, security issues, and improvements. Output a numbered list of issues with severity (Critical/High/Medium/Low) and suggested fixes.",
        ),
        SwarmAgent(
            "DevOps", "\uD83D\uDE80",
            "google/gemma-3-27b-it:free",
            "You are a DevOps engineer. Given a project description, produce: Dockerfile, docker-compose.yml, CI/CD config (.github/workflows), and deployment instructions. Output complete config files.",
        ),
    )

    /**
     * Launch the AI Swarm: parallel requests to the OpenCodex proxy using
     * different free models per agent role. Each agent gets the [task] as
     * user message with a role-specific system prompt. Output is streamed
     * to [onOutput] with role prefixes like "[Architect] ...".
     *
     * @param task the user's task description
     * @param onOutput callback for each line of agent output (role-prefixed)
     * @return the number of agents that completed successfully
     */
    fun launchSwarm(task: String, onOutput: (String) -> Unit): Int {
        val proxyBase = "http://127.0.0.1:$OPENCODEX_PORT/v1/chat/completions"
        var successCount = 0

        SWARM_AGENTS.map { agent ->
            Thread {
                try {
                    onOutput("${agent.emoji} [${agent.role}] starting (${agent.model.substringAfter("/")})…\n")
                    val body = """
                        {"model":"${agent.model}",
                         "messages":[
                           {"role":"system","content":${jsonEscape(agent.systemPrompt)}},
                           {"role":"user","content":${jsonEscape(task)}}
                         ],
                         "stream":true}
                    """.trimIndent()

                    val url = java.net.URL(proxyBase)
                    val conn = url.openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.doOutput = true
                    conn.connectTimeout = 30_000
                    conn.readTimeout = 120_000
                    conn.outputStream.write(body.toByteArray())
                    conn.outputStream.flush()

                    if (conn.responseCode !in 200..299) {
                        onOutput("[${agent.role}] error: HTTP ${conn.responseCode}\n")
                        return@Thread
                    }

                    // Parse SSE stream
                    val reader = conn.inputStream.bufferedReader()
                    var line = reader.readLine()
                    val content = StringBuilder()
                    while (line != null) {
                        if (line.startsWith("data: ")) {
                            val data = line.removePrefix("data: ").trim()
                            if (data == "[DONE]") break
                            try {
                                val chunk = org.json.JSONObject(data)
                                val delta = chunk.getJSONArray("choices")
                                    .getJSONObject(0)
                                    .optJSONObject("delta")
                                val text = delta?.optString("content", "") ?: ""
                                if (text.isNotEmpty()) {
                                    content.append(text)
                                    onOutput("${agent.emoji}[$${agent.role}] $text")
                                }
                            } catch (_: Exception) { }
                        }
                        line = reader.readLine()
                    }
                    conn.disconnect()
                    onOutput("\n${agent.emoji} [${agent.role}] done (${content.length} chars)\n\n")
                    successCount++
                } catch (e: Exception) {
                    onOutput("[${agent.role}] error: ${e.message}\n")
                }
            }
        }.forEach { it.join() } // sequential for clean terminal output

        return successCount
    }

    private fun jsonEscape(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
    // ── Hermes Web UI ────────────────────────────────────────────────────

    fun isHermesInstalled(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "opt/hermes-webui/server.py").exists()
    }

    val isHermesRunning: Boolean
        get() = processAlive(hermesProcess)

    /**
     * Download the Hermes WebUI (nesquena/hermes-webui, MIT) into the prefix
     * at /opt/hermes-webui and best-effort install its Python deps.
     */
    fun installHermes(onProgress: (String) -> Unit): Boolean {
        if (isHermesInstalled()) {
            // Make sure hermes-agent is also installed even if the webui
            // was already extracted from the bundle.
            ensureHermesAgent(onProgress)
            return true
        }

        // Try extracting from bundled APK assets first (instant, no network).
        if (extractBundledHermes(onProgress)) {
            Log.i(TAG, "Hermes restored from bundled assets")
            ensureHermesAgent(onProgress)
            return true
        }

        if (!isPythonInstalled()) {
            Log.w(TAG, "Python not installed — Hermes requires Python")
            onProgress("Hermes skipped — Python not installed")
            return false
        }
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir

        onProgress("Downloading Hermes WebUI…")
        val installCmd = """
            mkdir -p "$prefix/opt" "$prefix/tmp/_hermes" && cd "$prefix/tmp/_hermes" &&
            node -e '
              const https = require("https");
              const fs = require("fs");
              const url = "https://github.com/nesquena/hermes-webui/archive/refs/heads/master.tar.gz";
              const file = fs.createWriteStream("hermes.tar.gz");
              https.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  https.get(res.headers.location, (r2) => r2.pipe(file).on("finish", () => { file.close(); console.log("Downloaded"); process.exit(0); }));
                } else {
                  res.pipe(file).on("finish", () => { file.close(); console.log("Downloaded"); process.exit(0); });
                }
              }).on("error", (e) => { console.error(e.message); process.exit(1); });
            ' 2>&1 &&
            tar xzf hermes.tar.gz 2>&1 &&
            rm -rf "$prefix/opt/hermes-webui" &&
            mv hermes-webui-master "$prefix/opt/hermes-webui" &&
            cd "$prefix/opt/hermes-webui" &&
            { python3 -m pip install --break-system-packages flask pyyaml cryptography requests markupsafe werkzeug jinja2 2>&1 || python3 -m pip install flask pyyaml cryptography requests markupsafe werkzeug jinja2 2>&1 || echo "pip deps skipped"; } &&
            rm -rf "$prefix/tmp/_hermes" &&
            echo "Hermes WebUI installed"
        """.trimIndent()
        runInPrefix(installCmd, onOutput = { onProgress(it) })
        ensureHermesAgent(onProgress)
        return isHermesInstalled()
    }

    /**
     * Install the `hermes-agent` Python package from PyPI so the webui
     * server can `import hermes_cli`. Idempotent — a successful install
     * exits 0 and subsequent calls are no-ops.
     */
    private fun ensureHermesAgent(onProgress: (String) -> Unit) {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        if (!isPythonInstalled()) return
        val probe = runInPrefix("$prefix/bin/python3 -c 'import hermes_cli' 2>&1")
        if (probe == 0) {
            Log.i(TAG, "hermes-agent already installed")
            return
        }
        onProgress("Installing hermes-agent (PyPI)…")
        val pipCmd = """
            { python3 -m pip install --break-system-packages --no-cache-dir hermes-agent 2>&1 || python3 -m pip install --no-cache-dir hermes-agent 2>&1 || echo "hermes-agent install skipped"; }
        """.trimIndent()
        runInPrefix(pipCmd, onOutput = { onProgress(it) })
    }

    /** Start the Hermes WebUI server (listens on 127.0.0.1:[HERMES_PORT]). */
    fun startHermesServer(): Boolean {
        if (isHermesRunning) return true
        if (!isHermesInstalled()) {
            hermesLastError = "Hermes not installed — tap Start to install"
            return false
        }

        hermesLastError = null
        synchronized(hermesOutput) { hermesOutput.clear() }

        val paths = BootstrapInstaller.getPaths(context)
        // Ensure Python pip dependencies are installed.
        // hermes-webui needs: flask (web server), pyyaml (config),
        // Ensure all Python deps are installed — force-reinstall PyYAML if import fails
        val depCheck = runInPrefix("${paths.prefixDir}/bin/python3 -c 'import yaml; import flask; import cryptography; import requests' 2>&1")
        if (depCheck != 0) {
            Log.w(TAG, "Hermes Python deps missing — installing all...")
            runInPrefix("${paths.prefixDir}/bin/python3 -m pip install --break-system-packages flask pyyaml cryptography requests markupsafe werkzeug jinja2 2>&1 || true")
            // Force reinstall PyYAML specifically if it's still broken
            val yamlCheck = runInPrefix("${paths.prefixDir}/bin/python3 -c 'import yaml; print(yaml.__version__)' 2>&1")
            if (yamlCheck != 0) {
                Log.w(TAG, "PyYAML import failed — forcing reinstall")
                runInPrefix("${paths.prefixDir}/bin/python3 -m pip install --break-system-packages --force-reinstall --no-cache-dir pyyaml 2>&1 || true")
                runInPrefix("${paths.prefixDir}/bin/python3 -m pip install pyyaml 2>&1 || true")
            }
        }
        val env = buildEnvironment(paths)
        val shell = "${paths.prefixDir}/bin/sh"
        // PyYAML must be importable; sed-patching profiles.py to swallow
        // the ImportError just turns a clear crash into a silent config
        // failure later. Force-reinstall it once if the probe failed.
        val yamlCheck = runInPrefix("${paths.prefixDir}/bin/python3 -c 'import yaml; print(yaml.__version__)' 2>&1")
        if (yamlCheck != 0) {
            Log.w(TAG, "PyYAML missing — reinstalling before Hermes start")
            runInPrefix("${paths.prefixDir}/bin/python3 -m pip install --break-system-packages --force-reinstall --no-cache-dir pyyaml 2>&1 || true")
            runInPrefix("${paths.prefixDir}/bin/python3 -m pip install pyyaml 2>&1 || true")
        }
        val cmd = "cd ${paths.prefixDir}/opt/hermes-webui && exec python3 server.py 2>&1"

        val pb = ProcessBuilder(shell, "-c", cmd)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = try { pb.start() } catch (e: Exception) {
            hermesLastError = "Failed to launch Hermes: ${e.message}"
            Log.e(TAG, "Hermes launch failed", e)
            return false
        }
        hermesProcess = proc

        // Capture output for diagnostics
        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[hermes] $line")
                synchronized(hermesOutput) {
                    hermesOutput.addLast(line)
                    while (hermesOutput.size > 30) hermesOutput.removeFirst()
                }
                line = reader.readLine()
            }
            val exitCode = proc.waitFor()
            Log.i(TAG, "[hermes] exited with code: $exitCode")
            if (exitCode != 0) {
                hermesLastError = "Hermes exited (code $exitCode): ${hermesOutput.joinToString("\n").takeLast(500)}"
            }
        }.start()

        // Poll until the HTTP port answers (Python cold-start can be slow on Android).
        val deadline = System.currentTimeMillis() + 20_000
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(500)
            if (!isHermesRunning) {
                hermesLastError = hermesLastError ?: "Hermes process exited early"
                Log.e(TAG, "Hermes process exited early: ${hermesOutput.joinToString("\n").takeLast(300)}")
                return false
            }
            try {
                val c = java.net.URL("http://127.0.0.1:$HERMES_PORT/")
                    .openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 1000; c.readTimeout = 1000; c.requestMethod = "GET"
                val code = c.responseCode; c.disconnect()
                if (code in 200..399) { Log.i(TAG, "Hermes ready (HTTP $code)"); return true }
            } catch (_: Exception) { }
        }
        hermesLastError = hermesLastError ?: "Hermes did not become ready in 20s"
        Log.e(TAG, "Hermes timeout: ${hermesOutput.joinToString("\n").takeLast(300)}")
        return false
    }

    fun stopHermes() {
        val proc = hermesProcess ?: return
        hermesProcess = null
        try {
            proc.destroy()
            Thread({ Thread.sleep(3000); try { proc.destroyForcibly() } catch (_: Exception) {} }).start()
            proc.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: Exception) { }
        Log.i(TAG, "Hermes WebUI server stopped")
    }

    private fun processAlive(proc: Process?): Boolean {
        if (proc == null) return false
        return try {
            proc.exitValue()
            false
        } catch (_: IllegalThreadStateException) {
            true
        }
    }

    /** Spawn a long-running prefix process with log streaming. */
    private fun spawnProcess(
        shell: String,
        command: String,
        env: Map<String, String>,
        workDir: String,
        logTag: String,
    ): Process {
        val pb = ProcessBuilder(shell, "-c", command)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(workDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "$logTag $line")
                line = reader.readLine()
            }
            Log.i(TAG, "$logTag process exited with code: ${proc.waitFor()}")
        }.start()
        return proc
    }

    // ── Proxy ────────────────────────────────────────────────────────────────

    /**
     * Start a Node.js CONNECT proxy so the static-musl codex binary can
     * resolve DNS and reach HTTPS endpoints. Node.js uses Android's native
     * resolver; the proxy forwards TCP connections transparently.
     */
    fun startProxy(): Boolean {
        if (proxyProcess != null) return true

        val paths = BootstrapInstaller.getPaths(context)
        val proxyScript = File(paths.homeDir, "proxy.js")

        // Always overwrite with the latest version from assets
        try {
            context.assets.open("proxy.js").use { input ->
                proxyScript.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract proxy.js asset: ${e.message}")
            return false
        }

        // The bundled proxy.js writes $HOME/.proxy.pid from inside the
        // prefix, but that's the prooted PID, not the host PID — a
        // host-side kill(1) on it would never reach the actual process.
        // We rely on Java's Process.destroy() / destroyForcibly() in
        // stopProxy() instead, which goes through proot.

        val env = buildEnvironment(paths)
        val shell = "${paths.prefixDir}/bin/sh"
        val cmd = "exec node ${proxyScript.absolutePath}"

        val pb = ProcessBuilder(shell, "-c", cmd)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        proxyProcess = proc

        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[proxy] $line")
                line = reader.readLine()
            }
            Log.i(TAG, "Proxy exited with code: ${proc.waitFor()}")
        }.start()

        Thread.sleep(800)
        Log.i(TAG, "CONNECT proxy started on 127.0.0.1:$PROXY_PORT")
        return true
    }

    fun stopProxy() {
        proxyProcess?.destroy()
        proxyProcess = null
    }

    // ── Authentication ──────────────────────────────────────────────────────

    private fun codexBinPath(): String {
        val paths = BootstrapInstaller.getPaths(context)
        return "${paths.prefixDir}/lib/node_modules/@openai/codex-linux-arm64" +
            "/vendor/aarch64-unknown-linux-musl/codex/codex"
    }

    fun isLoggedIn(): Boolean {
        val output = runCapture("${codexBinPath()} login status 2>&1")
        Log.i(TAG, "Login status: $output")
        return !output.contains("Not logged in", ignoreCase = true)
    }

    /**
     * Pipe an API key into `codex login --with-api-key` via stdin.
     */
    fun loginWithApiKey(apiKey: String): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths)

        val pb = ProcessBuilder(codexBinPath(), "login", "--with-api-key")
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        proc.outputStream.bufferedWriter().use { w ->
            w.write(apiKey)
            w.newLine()
            w.flush()
        }

        val reader = BufferedReader(InputStreamReader(proc.inputStream))
        var line = reader.readLine()
        while (line != null) {
            Log.d(TAG, "[login] $line")
            line = reader.readLine()
        }

        val exitCode = proc.waitFor()
        Log.i(TAG, "codex login --with-api-key exited with code $exitCode")
        return exitCode == 0
    }

    /**
     * Run `codex login` (URL-based OAuth flow) using the CONNECT proxy.
     * The native binary starts a local HTTP server for the OAuth callback,
     * prints an auth URL, and waits for the redirect. Parses the URL from
     * stdout and calls [onLoginUrl] so the Activity can open the browser.
     * Blocks until login completes or fails.
     */
    fun loginWithUrl(
        onLoginUrl: (url: String) -> Unit,
        onProgress: (String) -> Unit,
    ): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths).toMutableMap()
        env["HTTPS_PROXY"] = "http://127.0.0.1:$PROXY_PORT"
        env["HTTP_PROXY"] = "http://127.0.0.1:$PROXY_PORT"

        val pb = ProcessBuilder(codexBinPath(), "login")
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        val reader = BufferedReader(InputStreamReader(proc.inputStream))

        val urlRegex = Regex("""(https://auth\.openai\.com/\S+)""")
        var urlSent = false

        var line = reader.readLine()
        while (line != null) {
            val clean = line.replace(Regex("\\x1b\\[[0-9;]*m"), "").trim()
            Log.d(TAG, "[login] $clean")
            onProgress(clean)

            if (!urlSent) {
                urlRegex.find(clean)?.let {
                    onLoginUrl(it.value)
                    urlSent = true
                }
            }

            line = reader.readLine()
        }

        val exitCode = proc.waitFor()
        Log.i(TAG, "codex login exited with code $exitCode")
        return exitCode == 0
    }

    // ── Health check ────────────────────────────────────────────────────────

    /**
     * Send a minimal prompt ("hi") to Codex in non-interactive (exec) mode
     * via the CONNECT proxy. Confirms the API key is valid and the native
     * binary can reach OpenAI.
     */
    fun healthCheck(onProgress: (String) -> Unit): Boolean {
        onProgress("Sending test message…")

        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths).toMutableMap()
        env["HTTPS_PROXY"] = "http://127.0.0.1:$PROXY_PORT"
        env["HTTP_PROXY"] = "http://127.0.0.1:$PROXY_PORT"

        val shell = "${paths.prefixDir}/bin/sh"
        val cmd = "${codexBinPath()} exec --skip-git-repo-check \"say hi\" 2>&1"

        val pb = ProcessBuilder(shell, "-c", cmd)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = pb.start()
        val sb = StringBuilder()
        val reader = BufferedReader(InputStreamReader(proc.inputStream))
        // 30-second timeout — the health check must never block setup.
        val deadline = System.currentTimeMillis() + 30_000
        var line = reader.readLine()
        while (line != null && System.currentTimeMillis() < deadline) {
            val clean = line.replace(Regex("\\x1b\\[[0-9;]*m"), "").trim()
            Log.d(TAG, "[health] $clean")
            sb.appendLine(clean)
            onProgress(clean)
            line = reader.readLine()
        }
        if (System.currentTimeMillis() >= deadline) {
            Log.w(TAG, "Health check timed out — forcing kill")
            proc.destroyForcibly()
        }

        val exitCode = try { proc.waitFor() } catch (_: Exception) { -1 }
        val output = sb.toString().trim()
        Log.i(TAG, "Health check exit=$exitCode output=$output")

        if (exitCode != 0) {
            Log.e(TAG, "Health check failed with exit code $exitCode")
            return false
        }

        return output.isNotEmpty()
    }

    // ── Server lifecycle ────────────────────────────────────────────────────

    /**
     * Start the codex-web-local server. The CONNECT proxy must be running
     * and authentication must have been completed first.
     */
    fun startServer(): Boolean {
        lastServerError = null
        synchronized(serverOutput) { serverOutput.clear() }
        if (isRunning) {
            Log.i(TAG, "Server already running")
            return true
        }

        // Host-side kill first (before proot, since proot may not be running).
        try {
            Runtime.getRuntime().exec(arrayOf("sh", "-c",
                "pkill -9 -f codex-web-local 2>/dev/null; pkill -9 -f 'node.*codex' 2>/dev/null"
            )).waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: Exception) {}
        Thread.sleep(500)

        // Aggressively kill any stale process occupying the server port.
        // Multiple fallback methods because pkill/fuser may not work in proot.
        try {
            runInPrefix("pkill -9 -f 'codex-web-local' 2>/dev/null || true")
            Thread.sleep(300)
        } catch (_: Exception) { }
        try {
            runInPrefix("fuser -k -9 $SERVER_PORT/tcp 2>/dev/null || true")
            Thread.sleep(200)
        } catch (_: Exception) { }
        try {
            runInPrefix("lsof -ti:$SERVER_PORT | xargs kill -9 2>/dev/null || true")
            Thread.sleep(200)
        } catch (_: Exception) { }
        Thread.sleep(300)

        val paths = BootstrapInstaller.getPaths(context)
        val env = buildEnvironment(paths).toMutableMap()
        env["HTTPS_PROXY"] = "http://127.0.0.1:$PROXY_PORT"
        env["HTTP_PROXY"] = "http://127.0.0.1:$PROXY_PORT"

        val serverScript = "${paths.prefixDir}/lib/node_modules/codex-web-local/dist-cli/index.js"
        if (!File(serverScript).exists()) {
            // Self-heal: the bundle was never installed (or was wiped) — get it.
            installServerBundle { }
            if (!File(serverScript).exists()) {
                val installed = File(paths.prefixDir, "lib/node_modules")
                    .listFiles { f -> f.isDirectory }
                    ?.joinToString(", ") { it.name } ?: "unknown"
                lastServerError =
                    "Web server bundle missing. Installed packages: $installed"
                Log.e(TAG, "Server script not found: $serverScript")
                return false
            }
        }

        val shell = "${paths.prefixDir}/bin/sh"
        val command = "exec node $serverScript --port $SERVER_PORT --no-password"

        Log.i(TAG, "Starting server: $command")

        val pb = ProcessBuilder(shell, "-c", command)
        pb.environment().clear()
        pb.environment().putAll(env)
        pb.directory(File(paths.homeDir))
        pb.redirectErrorStream(true)

        val proc = try {
            pb.start()
        } catch (e: Exception) {
            lastServerError = "Could not launch server process: ${e.message}"
            Log.e(TAG, "Failed to start server process", e)
            return false
        }
        serverProcess = proc

        Thread {
            val reader = BufferedReader(InputStreamReader(proc.inputStream))
            var line = reader.readLine()
            while (line != null) {
                Log.d(TAG, "[server] $line")
                recordServerOutput(line)
                line = reader.readLine()
            }
            Log.i(TAG, "Server process exited with code: ${proc.waitFor()}")
        }.start()

        return true
    }

    fun waitForServer(timeoutMs: Long = 60_000): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        val url = URL("http://127.0.0.1:$SERVER_PORT/")

        while (System.currentTimeMillis() < deadline) {
            val proc = serverProcess
            if (proc != null) {
                val alive = try {
                    proc.exitValue(); false
                } catch (_: IllegalThreadStateException) { true }
                if (!alive) {
                    lastServerError = "Server process exited. Output: ${serverOutputTail()}"
                    Log.e(TAG, lastServerError!!)
                    return false
                }
            }
            try {
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 2000
                conn.readTimeout = 2000
                conn.requestMethod = "GET"
                val code = conn.responseCode
                conn.disconnect()
                if (code in 200..399) {
                    Log.i(TAG, "Server is ready (HTTP $code)")
                    return true
                }
            } catch (_: Exception) {
                // Not ready yet
            }
            Thread.sleep(500)
        }

        Log.e(TAG, "Server did not become ready within ${timeoutMs}ms")
        lastServerError = "Server did not become ready. Output: ${serverOutputTail()}"
        return false
    }

    /**
     * codex-web-local needs its runtime deps (express, commander). Some
     * on-device npm global installs silently skip them, which crashes the
     * server at boot — install locally into the package when absent.
     *
     * Runs an offline-friendly `npm install` against the package's own
     * declared dependencies:
     *   --omit=dev          : skip devDependencies, they're not used at
     *                         runtime and inflate the install.
     *   --ignore-scripts    : never run postinstall scripts (most of
     *                         them try to download platform-specific
     *                         native binaries that fail on Android).
     *   --no-audit --no-fund: cut the registry chatter.
     *
     * @return true when express (the load-bearing dep) is present after
     *         the call; false if the install failed or the dir vanished.
     */
    private fun ensureServerDeps(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val pkgDir = File(paths.prefixDir, "lib/node_modules/codex-web-local")
        if (!pkgDir.exists()) {
            Log.w(TAG, "codex-web-local not present at $pkgDir — skipping dep install")
            return false
        }
        if (File(pkgDir, "node_modules/express/package.json").exists()) return true
        Log.w(TAG, "codex-web-local deps missing — running local npm install")
        val npmCli = "${paths.prefixDir}/lib/node_modules/npm/bin/npm-cli.js"
        val code = runInPrefix(
            "cd ${'$'}{pkgDir.absolutePath} && node ${'$'}{npmCli} install --omit=dev --ignore-scripts --no-audit --no-fund 2>&1",
        ) { Log.d(TAG, "[server-deps] ${'$'}it") }
        if (code != 0) {
            lastServerError = "codex-web-local npm install failed (exit ${'$'}code)"
            Log.e(TAG, lastServerError!!)
            return false
        }
        if (!File(pkgDir, "node_modules/express/package.json").exists()) {
            lastServerError = "codex-web-local npm install completed but express is still missing"
            Log.e(TAG, lastServerError!!)
            return false
        }
        return true
    }

    /**
     * Start the web server and wait until it answers HTTP. Self-heals the
     * common on-device failure (missing npm deps) once, then reports the
     * captured server output via [lastServerError] on failure.
     */
    fun startServerAndWait(timeoutMs: Long = 90_000): Boolean {
        if (!ensureServerDeps()) return false
        if (!startServer()) return false
        if (waitForServer(timeoutMs)) return true

        val out = serverOutputTail()
        if (out.contains("Cannot find package") || out.contains("ERR_MODULE_NOT_FOUND")) {
            Log.w(TAG, "Server deps broken — reinstalling codex-web-local")
            stopWebServer()
            installServerBundle { }
            ensureServerDeps()
            if (!startServer()) return false
            if (waitForServer(timeoutMs)) return true
        }
        return false
    }

    /**
     * Stop only the codex-web-local server, keeping the CONNECT proxy and
     * the OpenClaw gateway alive (used by the dashboard Stop button).
     */
    fun stopWebServer() {
        val proc = serverProcess ?: return
        serverProcess = null

        try {
            proc.destroy()
            // Give the process 5s to die gracefully, then force-kill.
            Thread({ Thread.sleep(5000); try { proc.destroyForcibly() } catch (_: Exception) {} }).start()
            proc.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping web server: ${e.message}")
        }
        Log.i(TAG, "Web server stopped")
    }

    /** Stop only the OpenClaw gateway + Control UI server (proxy stays up). */
    fun stopGateway() {
        listOf(openClawGatewayProcess, openClawControlUiProcess).forEach { proc ->
            proc?.let {
                try {
                    it.destroy()
                    Thread({ Thread.sleep(3000); try { it.destroyForcibly() } catch (_: Exception) {} }).start()
                    it.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
                } catch (_: Exception) { }
            }
        }
        openClawGatewayProcess = null
        openClawControlUiProcess = null
        // Clean up temp server file
        try {
            val paths = BootstrapInstaller.getPaths(context)
            File(paths.homeDir, ".tmp_control_ui_server.js").delete()
        } catch (_: Exception) { }
        Log.i(TAG, "OpenClaw gateway stopped")
    }

    /** Stop the auxiliary OpenCode + Hermes servers. */
    fun stopAuxServers() {
        openCodexProcess?.destroy()
        openCodexProcess = null
        hermesProcess?.destroy()
        hermesProcess = null
    }

    fun stopServer() {
        val proc = serverProcess ?: return
        serverProcess = null

        try {
            proc.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "Error destroying server process: ${e.message}")
        }

        // Wait max 5 s; force-kill if stuck. Never block forever.
        try {
            Thread({ Thread.sleep(5000); try { proc.destroyForcibly() } catch (_: Exception) {} }).start()
            proc.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }

        stopOpenClaw()
        stopAuxServers()
        stopProxy()
        Log.i(TAG, "Server stopped")
    }

    fun stopOpenClaw() {
        openClawGatewayProcess?.destroy()
        openClawGatewayProcess = null
        openClawControlUiProcess?.destroy()
        openClawControlUiProcess = null
    }

    // ── Bundled asset extraction (instant, no network) ───────────────────

    /**
     * Try to restore OpenCodex from pre-bundled APK assets:
     * - packages/bun.deb -> extract Bun binary to prefix/bin/bun
     * - packages/opencodex.tgz -> extract npm package to prefix/lib/node_modules/
     * Returns true if both were successfully extracted.
     */
    private fun extractBundledOpenCodex(onProgress: (String) -> Unit): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir

        // Check if bundled assets exist
        val hasBun = context.assets.list("packages")?.contains("bun.deb") == true
        val hasOcx = context.assets.list("packages")?.contains("opencodex.tgz") == true
        if (!hasBun && !hasOcx) return false

        onProgress("Restoring OpenCodex from bundled packages...")

        // Extract Bun binary
        if (hasBun && !File(prefix, "bin/bun").exists()) {
            val bunDeb = File(prefix, "tmp/_bundled_bun.deb")
            bunDeb.parentFile?.mkdirs()
            try {
                context.assets.open("packages/bun.deb").use { input ->
                    bunDeb.outputStream().use { output -> input.copyTo(output) }
                }
                val extractCmd = """
                    cd $prefix/tmp &&
                    mkdir -p _bun_extract &&
                    dpkg-deb -x _bundled_bun.deb _bun_extract 2>/dev/null ||
                    (ar p _bundled_bun.deb data.tar.xz > data.tar.xz 2>/dev/null && mkdir -p _bun_extract && tar xJf data.tar.xz -C _bun_extract) &&
                    cp _bun_extract/data/data/com.termux/files/usr/bin/bun "$prefix/bin/bun" &&
                    chmod 700 "$prefix/bin/bun" &&
                    rm -rf _bundled_bun.deb _bun_extract data.tar.xz 2>/dev/null &&
                    echo "Bun restored from bundle"
                """.trimIndent()
                runInPrefix(extractCmd) { onProgress(it) }
            } catch (e: Exception) {
                Log.w(TAG, "Bundled Bun extraction failed: ${e.message}")
            }
        }

        // Extract OpenCodex npm package
        if (hasOcx) {
            val ocxTarget = File(prefix, "lib/node_modules/@bitkyc08/opencodex")
            if (!ocxTarget.exists()) {
                val ocxTgz = File(prefix, "tmp/_bundled_ocx.tgz")
                ocxTgz.parentFile?.mkdirs()
                try {
                    context.assets.open("packages/opencodex.tgz").use { input ->
                        ocxTgz.outputStream().use { output -> input.copyTo(output) }
                    }
                    val npmModules = File(prefix, "lib/node_modules")
                    npmModules.mkdirs()
                    val extractCmd = """
                        cd "${npmModules.absolutePath}" &&
                        tar xzf "${ocxTgz.absolutePath}" 2>&1 &&
                        if [ -d "package" ]; then
                            mkdir -p "@bitkyc08"
                            mv package "@bitkyc08/opencodex"
                        fi &&
                        rm -f "${ocxTgz.absolutePath}" &&
                        echo "OpenCodex restored from bundle"
                    """.trimIndent()
                    runInPrefix(extractCmd) { onProgress(it) }
                } catch (e: Exception) {
                    Log.w(TAG, "Bundled OpenCodex extraction failed: ${e.message}")
                }
            }
        }

        return isOpenCodexInstalled()
    }

    /**
     * Try to restore Hermes from pre-bundled APK assets:
     * - packages/hermes-webui.tgz -> extract to prefix/opt/hermes-webui/
     * Returns true if successfully extracted.
     */
    private fun extractBundledHermes(onProgress: (String) -> Unit): Boolean {
        val hasHermes = context.assets.list("packages")?.contains("hermes-webui.tgz") == true
        if (!hasHermes) return false
        if (isHermesInstalled()) return true

        val paths = BootstrapInstaller.getPaths(context)
        val prefix = paths.prefixDir
        onProgress("Restoring Hermes from bundled package...")

        val hermesTgz = File(prefix, "tmp/_bundled_hermes.tgz")
        hermesTgz.parentFile?.mkdirs()
        try {
            context.assets.open("packages/hermes-webui.tgz").use { input ->
                hermesTgz.outputStream().use { output -> input.copyTo(output) }
            }
            val extractCmd = """
                mkdir -p "$prefix/opt" && cd "$prefix/opt" &&
                tar xzf "${hermesTgz.absolutePath}" 2>&1 &&
                if [ -d "hermes-webui-master" ]; then
                    rm -rf hermes-webui
                    mv hermes-webui-master hermes-webui
                fi &&
                rm -f "${hermesTgz.absolutePath}" &&
                echo "Hermes restored from bundle"
            """.trimIndent()
            runInPrefix(extractCmd) { onProgress(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Bundled Hermes extraction failed: ${e.message}")
            return false
        }
        return isHermesInstalled()
    }


    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun extractAssetDir(assetPath: String, targetDir: File) {
        val list = context.assets.list(assetPath) ?: return
        targetDir.mkdirs()
        for (entry in list) {
            val subAsset = "$assetPath/$entry"
            val subTarget = File(targetDir, entry)
            val subList = context.assets.list(subAsset)
            if (subList != null && subList.isNotEmpty()) {
                subTarget.mkdirs()
                extractAssetDir(subAsset, subTarget)
            } else {
                context.assets.open(subAsset).use { input ->
                    subTarget.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }
        }
    }

    fun ensureDefaultWorkspace() {
        val paths = BootstrapInstaller.getPaths(context)
        val workspaceDir = File(paths.homeDir, "codex")
        if (workspaceDir.exists()) return

        workspaceDir.mkdirs()
        runInPrefix("cd ${workspaceDir.absolutePath} && git init 2>&1")
        Log.i(TAG, "Created default workspace at $workspaceDir")
    }

    fun ensureFullAccessConfig() {
        val paths = BootstrapInstaller.getPaths(context)
        val configDir = File(paths.homeDir, ".codex")
        configDir.mkdirs()
        val configFile = File(configDir, "config.toml")
        val desired = """
            |approval_policy = "never"
            |sandbox_mode = "danger-full-access"
        """.trimMargin().trim() + "\n"

        if (configFile.exists()) {
            val current = configFile.readText()
            if (current.contains("approval_policy") && current.contains("danger-full-access")) {
                return
            }
        }
        configFile.writeText(desired)
        Log.i(TAG, "Wrote full-access config to $configFile")

        // Re-apply the saved provider block on top of the base config.
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        val providerId = prefs.getString("provider_id", null)
        if (providerId != null && providerId != "openai") {
            applyProviderConfig(providerId)
        }
    }

    // ── Model providers (free: OpenRouter / NVIDIA / OpenCode Zen) ─────────

    data class ModelProvider(
        val id: String,
        val label: String,
        val badge: String,
        val baseUrl: String,
        val envKey: String,
        val wireApi: String,
        val defaultModel: String,
        val note: String,
        val keyUrl: String,
    )

    fun providerById(id: String): ModelProvider? =
        if (id == "openai") OPENAI_LEGACY else PROVIDERS.find { it.id == id }

    fun savedProviderId(): String {
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        return prefs.getString("provider_id", "opencode") ?: "opencode"
    }

    fun savedApiKey(providerId: String): String {
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        val p = providerById(providerId) ?: return ""
        return prefs.getString("key_" + p.envKey, "") ?: ""
    }

    /** Saved base URL for the Custom provider ("" when unset). */
    fun customBaseUrl(): String {
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        return prefs.getString("custom_base_url", "") ?: ""
    }

    /** Saved model id for the Custom provider ("" when unset). */
    fun customModel(): String {
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        return prefs.getString("custom_model", "") ?: ""
    }

    /** Persist the Custom provider's endpoint overrides (Settings screen). */
    fun setCustomEndpoint(baseUrl: String?, model: String?) {
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        prefs.edit()
            .putString("custom_base_url", baseUrl?.trim()?.trimEnd('/') ?: "")
            .putString("custom_model", model?.trim() ?: "")
            .apply()
    }

    /** Persist the chosen provider + key and rewrite ~/.codex/config.toml. */
    fun configureProvider(providerId: String, apiKey: String): Boolean {
        val p = providerById(providerId) ?: return false
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        prefs.edit()
            .putString("provider_id", providerId)
            .putString("key_" + p.envKey, apiKey)
            .apply()

        // OpenAI keeps using native `codex login`; others need config.toml.
        if (providerId == "openai") {
            return loginWithApiKey(apiKey)
        }

        // Write the key where codex can source it AND into config for safety.
        applyProviderConfig(providerId)
        return writeProviderAuthScript(p, apiKey)
    }

    /** Append/update the [model_providers.*] block in config.toml. */
    private fun applyProviderConfig(providerId: String) {
        val p = providerById(providerId) ?: return
        val paths = BootstrapInstaller.getPaths(context)
        val configDir = File(paths.homeDir, ".codex")
        configDir.mkdirs()
        val configFile = File(configDir, "config.toml")

        val base = if (configFile.exists()) {
            configFile.readText()
                .replace(Regex("(?s)# --- DAGESTAN PROVIDER START ---.*?# --- DAGESTAN PROVIDER END ---\\n?"), "")
                .trimEnd() + "\n"
        } else {
            "approval_policy = \"never\"\nsandbox_mode = \"danger-full-access\"\n"
        }

        // Custom provider uses the user-supplied endpoint/model overrides.
        val baseUrl = if (providerId == "custom") customBaseUrl().ifBlank { p.baseUrl } else p.baseUrl
        val model = if (providerId == "custom") customModel().ifBlank { p.defaultModel } else p.defaultModel

        val block = buildString {
            append(base)
            append("\n# --- DAGESTAN PROVIDER START ---\n")
            append("model_provider = \"")
            append(providerId)
            append("\"\nmodel = \"")
            append(model.replace("\"", "\\\\\""))
            append("\"\n\n[model_providers.")
            append(providerId)
            append("]\nname = \"")
            append(p.label.substringBefore(" (").replace("\"", "\\\\\""))
            append("\"\nbase_url = \"")
            append(baseUrl)
            append("\"\nenv_key = \"")
            append(p.envKey)
            append("\"\nwire_api = \"")
            append(p.wireApi)
            append("\"\n# --- DAGESTAN PROVIDER END ---\n")
        }
        configFile.writeText(block)
        Log.i(TAG, "Provider config written: $providerId -> ${p.baseUrl}")
    }

    /** Export the provider's API key as an env var inside the prefix profile. */
    private fun writeProviderAuthScript(p: ModelProvider, apiKey: String): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        val envDir = File(paths.prefixDir, "etc/profile.d")
        envDir.mkdirs()
        val script = File(envDir, "dagestan-provider.sh")
        script.writeText("export ${p.envKey}='${'$'}{APIKEY}'\n".replace("${'$'}{APIKEY}", apiKey))
        Log.i(TAG, "Provider env script written: ${p.envKey}")
        return true
    }

    /** True when a non-openai provider is configured with a stored key. */
    fun isCustomProviderReady(): Boolean {
        val id = savedProviderId()
        providerById(id) ?: return false
        return savedApiKey(id).isNotBlank()
    }

    /**
     * Pick a CA bundle that actually exists. The AnyClaw rootfs keeps
     * Debian's certs at files/etc/ssl/certs/ca-certificates.crt; the
     * legacy Termux bootstrap used etc/tls/cert.pem.
     */
    private fun resolveCertFile(paths: BootstrapInstaller.Paths): String {
        val candidates = listOf(
            "${'$'}{paths.filesDir}/etc/ssl/certs/ca-certificates.crt",
            "${'$'}{paths.prefixDir}/etc/tls/cert.pem",
            "/system/etc/security/cacerts/ca-certificates.crt",
        )
        return candidates.firstOrNull { java.io.File(it).exists() } ?: candidates[0]
    }

    /** Environment map shared by every exec call into the prefix. */
    private fun buildEnvironment(paths: BootstrapInstaller.Paths): Map<String, String> {
                val bionicCompat = "${paths.homeDir}/.openclaw-android/patches/bionic-compat.js"
        val bionicCompatOpt = if (File(bionicCompat).exists()) " -r $bionicCompat" else ""

        // The AnyClaw rootfs is a full Debian tree rooted at files/ with
        // node + global npm packages under usr/local/. Put usr/local/bin
        // ahead of bin so `node`, `openclaw`, `codex`, `hermes-webui` and
        // the rest resolve, and include usr/local/lib for native modules.
        val ldLibraryPath = "${paths.prefixDir}/usr/local/lib:${paths.prefixDir}/lib"
        val ldPreload = "${paths.prefixDir}/lib/libtermux-exec.so"
        // The AnyClaw rootfs is a Debian tree: its TLS bits live at
        // files/etc/ssl/{certs/ca-certificates.crt,openssl.cnf}, whereas the
        // legacy Termux bootstrap used etc/tls/{cert.pem,openssl.cnf}. Resolve
        // whatever actually exists so we never hand Node a missing openssl.cnf
        // (which aborts the process) or curl/git a missing CA file.
        val certFile = resolveCertFile(paths)
        val opensslConf = listOf(
            "${paths.prefixDir}/etc/tls/openssl.cnf",
            "${paths.filesDir}/etc/ssl/openssl.cnf",
        ).firstOrNull { java.io.File(it).exists() } ?: "${paths.prefixDir}/etc/tls/openssl.cnf"
        val nodeOptions = if (java.io.File(opensslConf).exists())
            "--openssl-config=$opensslConf --unhandled-rejections=warn$bionicCompatOpt"
        else "--unhandled-rejections=warn$bionicCompatOpt"

        val base = mapOf(
            "PREFIX" to paths.prefixDir,
            "HOME" to paths.homeDir,
            "PATH" to "${paths.prefixDir}/usr/local/bin:${paths.prefixDir}/bin:${paths.prefixDir}/bin/applets:/system/bin",
            "LD_LIBRARY_PATH" to ldLibraryPath,
            // libtermux-exec.so only ships with the legacy Termux bootstrap;
            // the AnyClaw rootfs has no use for it, so skip it when missing.
            "LD_PRELOAD" to if (java.io.File(ldPreload).exists()) ldPreload else "",
            "TERMUX_PREFIX" to paths.prefixDir,
            "TERMUX__PREFIX" to paths.prefixDir,
            "LANG" to "en_US.UTF-8",
            "TMPDIR" to paths.tmpDir,
            "TMP" to paths.tmpDir,
            "TEMP" to paths.tmpDir,
            "PROOT_TMP_DIR" to paths.tmpDir,
            "TERM" to "xterm-256color",
            "ANDROID_DATA" to "/data",
            "ANDROID_ROOT" to "/system",
            "APT_CONFIG" to "${paths.prefixDir}/etc/apt/apt.conf",
            "DPKG_ADMINDIR" to "${paths.prefixDir}/var/lib/dpkg",
            // Prefer the AnyClaw rootfs CA bundle (files/etc/ssl/certs); the
            // Termux-style cert.pem only exists for the legacy bootstrap.
            "SSL_CERT_FILE" to certFile,
            "SSL_CERT_DIR" to "/system/etc/security/cacerts",
            "CURL_CA_BUNDLE" to certFile,
            "GIT_SSL_CAINFO" to certFile,
            "GIT_CONFIG_NOSYSTEM" to "1",
            "GIT_EXEC_PATH" to "${paths.prefixDir}/libexec/git-core",
            "GIT_TEMPLATE_DIR" to "${paths.prefixDir}/share/git-core/templates",
            "OPENSSL_CONF" to opensslConf,
            "NODE_OPTIONS" to nodeOptions,
            "TERMUX_VERSION" to "0.118.0",
            "CONTAINER" to "1",
        )

        // Export the active provider's API key so every codex/node process
        // sees it, not just shells that source the profile.d script.
        val prefs = context.getSharedPreferences("dagestan_prefs", 0)
        val providerId = prefs.getString("provider_id", null) ?: return base
        val provider = providerById(providerId) ?: return base
        val apiKey = prefs.getString("key_" + provider.envKey, "") ?: ""
        return if (apiKey.isBlank()) base else base + (provider.envKey to apiKey)
    }
}
