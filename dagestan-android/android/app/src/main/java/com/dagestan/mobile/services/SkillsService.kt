package com.dagestan.mobile.services

import android.content.Context
import android.content.res.AssetManager
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

/**
 * Skills + marketplace — beta1 implementation.
 *
 * Reads a bundled marketplace index from
 * `assets/marketplace/index.json` (a small JSON document listing
 * available skills + their asset paths). Installs a skill by copying
 * its folder from `assets/skills/<name>/` to
 * `$PREFIX/opt/dagestan/skills/<name>/`. Uninstall is a directory
 * delete.
 *
 * This is the *device-side* part. The "marketplace" itself is a
 * list of available skills; it does not fetch from the network. A
 * network-backed marketplace (with update checks, signatures, etc.)
 * is a beta2 feature.
 *
 * Bus events:
 *   - [BusEvent.SkillInstalled]  — on successful install
 *   - [BusEvent.SkillRemoved]    — on successful uninstall
 *   - [BusEvent.SkillUpdateAvailable] — emitted at startup if any
 *     installed skill's bundled version differs from the on-disk version
 */
class SkillsService private constructor(
    private val appContext: Context,
) {

    data class Skill(
        val name: String,
        val version: String,
        val title: String,
        val description: String,
        val tags: List<String>,
        val author: String,
        val bundledAsset: String,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val assets: AssetManager = appContext.assets

    private val _installed = MutableStateFlow<List<String>>(emptyList())
    val installed: StateFlow<List<String>> = _installed.asStateFlow()

    private val _marketplace = MutableStateFlow<List<Skill>>(emptyList())
    val marketplace: StateFlow<List<Skill>> = _marketplace.asStateFlow()

    init {
        scope.launch {
            loadMarketplace()
            refreshInstalled()
            emitUpdateEvents()
        }
    }

    private fun loadMarketplace() {
        _marketplace.value = try {
            val text = assets.open("marketplace/index.json").bufferedReader().use { it.readText() }
            parseMarketplace(text)
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "loadMarketplace failed: ${t.message}")
            emptyList()
        }
    }

    private fun parseMarketplace(text: String): List<Skill> {
        val root = JSONObject(text)
        val arr = root.optJSONArray("skills") ?: return emptyList()
        val out = mutableListOf<Skill>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val tagsArr = obj.optJSONArray("tags")
            val tags = (0 until (tagsArr?.length() ?: 0)).map { tagsArr!!.getString(it) }
            out.add(
                Skill(
                    name = obj.getString("name"),
                    version = obj.optString("version", "0.0.0"),
                    title = obj.optString("title", obj.getString("name")),
                    description = obj.optString("description", ""),
                    tags = tags,
                    author = obj.optString("author", "anonymous"),
                    bundledAsset = obj.getString("asset"),
                )
            )
        }
        return out
    }

    private fun skillsRoot(): File {
        // In beta1 the "prefix" is the app's external files dir. Real
        // proot-prefix path resolution lives in CodexServerManager.
        val external = appContext.getExternalFilesDir(null) ?: appContext.filesDir
        return File(external, "skills").apply { mkdirs() }
    }

    private fun refreshInstalled() {
        val root = skillsRoot()
        _installed.value = root.listFiles { f -> f.isDirectory }?.map { it.name }?.sorted() ?: emptyList()
    }

    private fun emitUpdateEvents() {
        val installed = _installed.value
        val byName = _marketplace.value.associateBy { it.name }
        for (name in installed) {
            val meta = byName[name] ?: continue
            val manifestFile = File(skillsRoot(), "$name/skill.json")
            val onDiskVersion = if (manifestFile.exists()) {
                runCatching { JSONObject(manifestFile.readText()).optString("version", "0.0.0") }
                    .getOrDefault("0.0.0")
            } else "0.0.0"
            if (onDiskVersion != meta.version) {
                DagestanBus.publishAsync(
                    BusEvent.SkillUpdateAvailable(
                        name = name,
                        fromVersion = onDiskVersion,
                        toVersion = meta.version,
                    )
                )
            }
        }
    }

    fun install(name: String): Boolean {
        val meta = _marketplace.value.firstOrNull { it.name == name } ?: return false
        val target = File(skillsRoot(), name).apply {
            if (exists()) deleteRecursively()
            mkdirs()
        }
        return try {
            copyAssetFolder(meta.bundledAsset, target)
            refreshInstalled()
            DagestanBus.publishAsync(BusEvent.SkillInstalled(name, meta.version))
            true
        } catch (t: Throwable) {
            android.util.Log.e(TAG, "install($name) failed: ${t.message}")
            false
        }
    }

    fun uninstall(name: String): Boolean {
        val target = File(skillsRoot(), name)
        if (!target.exists()) return false
        return try {
            target.deleteRecursively()
            refreshInstalled()
            DagestanBus.publishAsync(BusEvent.SkillRemoved(name))
            true
        } catch (t: Throwable) {
            android.util.Log.e(TAG, "uninstall($name) failed: ${t.message}")
            false
        }
    }

    /**
     * Run an installed skill. The skill is a `run.sh` (or whatever the
     * `entry` in skill.json says) executed with `sh`. The first argument
     * is the skill name; further positional arguments are passed through.
     * If [stdin] is non-null, it is piped on stdin.
     *
     * The skills live in $EXTERNAL/skills/<name>/; we cd into that
     * directory so relative paths in the run.sh work as expected.
     *
     * Returns [RunResult] with combined output, exit code, and a synthetic
     * sandbox id (we don't actually sandbox; the "sandbox id" is a
     * short token for traceability through [BusEvent.SkillRunStarted] /
     * [BusEvent.SkillRunFinished]).
     */
    fun run(
        name: String,
        args: List<String> = emptyList(),
        stdin: String? = null,
    ): RunResult {
        val dir = File(skillsRoot(), name)
        if (!dir.isDirectory) {
            return RunResult(false, -1, "skill '" + name + "' is not installed", sandboxId = "")
        }
        val manifest = File(dir, "skill.json")
        val entryName = if (manifest.exists()) {
            runCatching { JSONObject(manifest.readText()).optString("entry", "run.sh") }
                .getOrDefault("run.sh")
        } else "run.sh"
        val entry = File(dir, entryName)
        if (!entry.exists()) {
            return RunResult(false, -1, "entry '" + entryName + "' not found in " + name + "/", sandboxId = "")
        }
        if (!entry.canExecute()) entry.setExecutable(true)

        val sandboxId = java.util.UUID.randomUUID().toString().take(8)
        DagestanBus.publishAsync(BusEvent.SkillRunStarted(name, sandboxId))

        return try {
            val pb = ProcessBuilder(listOf("sh", entry.absolutePath) + args)
            pb.directory(dir)
            pb.redirectErrorStream(true)
            val proc = pb.start()
            if (stdin != null) {
                proc.outputStream.bufferedWriter().use { it.write(stdin); it.flush() }
                proc.outputStream.close()
            }
            val out = proc.inputStream.bufferedReader().readText()
            val exit = proc.waitFor()
            DagestanBus.publishAsync(
                BusEvent.SkillRunFinished(name, exit, sandboxId)
            )
            RunResult(exit == 0, exit, out, sandboxId)
        } catch (t: Throwable) {
            DagestanBus.publishAsync(
                BusEvent.SkillRunFinished(name, -1, sandboxId)
            )
            RunResult(false, -1, "exec failed: ${t.message}", sandboxId)
        }
    }

    data class RunResult(
        val success: Boolean,
        val exitCode: Int,
        val output: String,
        val sandboxId: String,
    )

    /**
     * Tool manifest — the LLM (Codex) reads this from the `tools` field
     * of the /v1/responses request body. Each installed or marketplace
     * skill becomes a callable function, plus synthetic
     * `install_skill(name)`, `list_skills()`, and `run_skill(name, args, stdin)`.
     *
     * Returned as a JSON array string so the chat layer can splice it
     * straight into the request body without an extra dep.
     */
    fun toolManifestJson(): String {
        val sb = StringBuilder("[")
        sb.append("{\"type\":\"function\",\"name\":\"install_skill\",\"description\":\"Install a skill from the bundled Dagestan marketplace. Returns the installed version.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Skill name, e.g. git-commit or explain-stacktrace.\"}},\"required\":[\"name\"]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"list_skills\",\"description\":\"List all skills in the bundled marketplace and which are already installed.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{},\"required\":[]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"run_skill\",\"description\":\"Run an installed skill. The stdin field, if provided, is piped to the skill. The args field is passed as positional command-line arguments.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"args\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"stdin\":{\"type\":\"string\"}},\"required\":[\"name\"]}}")
        for (skill in _marketplace.value) {
            sb.append(",{\"type\":\"function\",\"name\":\"skill_" + skill.name.replace("-", "_") + "\",\"description\":\"" + escapeJson(skill.description) + "\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"input\":{\"type\":\"string\",\"description\":\"Free-form input passed to the skill (stdin or first arg).\"}},\"required\":[]}}")
        }
        sb.append("]")
        return sb.toString()
    }

    private fun escapeJson(s: String): String {
        val sb = StringBuilder()
        for (c in s) when (c) {
            '"'  -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> sb.append(c)
        }
        return sb.toString()
    }

    private fun copyAssetFolder(assetPath: String, dest: File) {
        val list = assets.list(assetPath) ?: return
        if (list.isEmpty()) {
            // It's a file. Copy bytes.
            assets.open(assetPath).use { input ->
                File(dest, assetPath.substringAfterLast('/')).outputStream().use { input.copyTo(it) }
            }
            return
        }
        dest.mkdirs()
        for (child in list) {
            copyAssetFolder("$assetPath/$child", dest)
        }
    }

    companion object {
        private const val TAG = "DagestanSkills"

        @Volatile
        private var instance: SkillsService? = null

        fun getInstance(context: Context): SkillsService =
            instance ?: synchronized(this) {
                instance ?: SkillsService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
