package com.dagestan.mobile

import android.util.Log
import android.webkit.JavascriptInterface
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * JavaScript bridge exposed to the embedded Vite web app as
 * `window.DagestanDroid` and (for back-compat) `window.PrismDroid`.
 *
 * The dashboard's Terminal + start buttons call `droid.run(cmd)` to
 * execute shell commands inside the Termux prefix. The server.js files
 * embedded in `Dashboard.tsx` are pure Node.js — no Python, no proot —
 * so this bridge only needs to exec through `${prefixDir}/bin/sh -c`.
 *
 * Long-running commands (e.g. `nohup node server.js &`) are dispatched on
 * a background thread and return immediately so the WebView never blocks.
 */
class DroidBridge(private val context: android.content.Context) {

    companion object {
        private const val TAG = "DroidBridge"
        const val NAME = "DagestanDroid"
        /** Legacy alias — older builds of the web app still probe PrismDroid first. */
        const val LEGACY_NAME = "PrismDroid"

        /** Server ids accepted by [serverState]/[startServer]/[stopServer]. */
        val SERVER_IDS = listOf("codex", "openclaw", "opencodex", "hermes")
    }

    // ── Server control (used by the Services page inside the WebView) ────
    //
    // The manager's start methods block for up to ~90 s (installs, port
    // polls), so they must never run on the JavascriptInterface thread —
    // everything here is dispatched to a worker thread and reported as a
    // small JSON state object the web app can poll.

    private val serverStates = ConcurrentHashMap<String, String>()

    private fun manager(): CodexServerManager = CodexServerManager.getInstance(context)

    private fun portFor(id: String): Int = when (id) {
        "codex" -> CodexServerManager.SERVER_PORT
        "openclaw" -> CodexServerManager.OPENCLAW_GATEWAY_PORT
        "opencodex" -> CodexServerManager.OPENCODEX_PORT
        "hermes" -> CodexServerManager.HERMES_PORT
        else -> -1
    }

    private fun liveRunning(id: String): Boolean = try {
        when (id) {
            "codex" -> manager().isRunning
            "openclaw" -> manager().isGatewayRunning
            "opencodex" -> manager().isOpenCodexRunning
            "hermes" -> manager().isHermesRunning
            else -> false
        }
    } catch (_: Exception) {
        false
    }

    private fun stateJson(id: String): String {
        val running = liveRunning(id)
        if (running) serverStates[id] = "running"
        val state = serverStates[id] ?: "idle"
        val error = when (id) {
            "codex" -> manager().lastServerError
            "opencodex" -> manager().openCodexLastError
            "hermes" -> manager().hermesLastError
            else -> null
        }
        val errJson = error?.let { "\"" + it.replace("\\", "\\\\").replace("\"", "\\\"").take(300) + "\"" } ?: "null"
        return "{\"id\":\"$id\",\"state\":\"$state\",\"running\":$running,\"port\":${portFor(id)},\"error\":$errJson}"
    }

    /** JSON state for one of [SERVER_IDS] — `{"state","running","port","error"}`. */
    @JavascriptInterface
    fun serverState(id: String): String = try {
        stateJson(id)
    } catch (e: Exception) {
        "{\"id\":\"$id\",\"state\":\"unknown\",\"error\":\"${e.message ?: e.javaClass.simpleName}\"}"
    }

    /** Start a managed server asynchronously; returns its state immediately. */
    @JavascriptInterface
    fun startServer(id: String): String {
        if (id !in SERVER_IDS) return "{\"id\":\"$id\",\"state\":\"error\",\"error\":\"unknown server\"}"
        if (serverStates[id] == "starting") return stateJson(id)
        serverStates[id] = "starting"
        Thread({
            val ok = try {
                when (id) {
                    "codex" -> manager().startServerAndWait()
                    "openclaw" -> manager().startOpenClawGateway() &&
                        manager().startOpenClawControlUiServer()
                    "opencodex" -> manager().startOpenCodexServer() && manager().waitForOpenCodex()
                    "hermes" -> manager().startHermesServer()
                    else -> false
                }
            } catch (e: Exception) {
                Log.e(TAG, "startServer($id) failed", e)
                false
            }
            serverStates[id] = if (ok) "running" else "error"
        }, "droid-start-$id").start()
        return stateJson(id)
    }

    /** Stop a managed server asynchronously; returns its state immediately. */
    @JavascriptInterface
    fun stopServer(id: String): String {
        if (id !in SERVER_IDS) return "{\"id\":\"$id\",\"state\":\"error\",\"error\":\"unknown server\"}"
        if (serverStates[id] == "stopping") return stateJson(id)
        serverStates[id] = "stopping"
        Thread({
            try {
                when (id) {
                    "codex" -> manager().stopWebServer()
                    "openclaw" -> manager().stopGateway()
                    "opencodex" -> manager().stopOpenCodex()
                    "hermes" -> manager().stopHermes()
                }
            } catch (e: Exception) {
                Log.e(TAG, "stopServer($id) failed", e)
            }
            serverStates[id] = "idle"
        }, "droid-stop-$id").start()
        return stateJson(id)
    }

    /** Run a single shell command inside the Termux prefix and return its stdout. */
    @JavascriptInterface
    fun run(cmd: String): String {
        return try {
            val sm = CodexServerManager.getInstance(context)
            val sb = StringBuilder()
            val code = sm.runInPrefix(cmd) { line -> sb.appendLine(line) }
            val out = sb.toString().trimEnd()
            Log.d(TAG, "[run] (exit=$code) ${cmd.take(120)} → ${out.length} bytes")
            if (out.isNotEmpty()) out else "exit=$code"
        } catch (e: Exception) {
            Log.e(TAG, "run() failed: ${e.message}", e)
            "error: ${e.message ?: e.javaClass.simpleName}"
        }
    }

    /** Submit a background job. Returns the job id immediately. */
    @JavascriptInterface
    fun submit(cmd: String): String {
        val id = "job-${System.currentTimeMillis()}-${(0..0xffff).random()}"
        Thread({
            try { run(cmd) } catch (_: Exception) {}
        }, "droid-submit-$id").start()
        return id
    }

    /** Inspect a job by id (kept for API parity — current jobs run fire-and-forget). */
    @JavascriptInterface
    fun job(id: String): String = "running"

    /** Best-effort kill of a job by id. */
    @JavascriptInterface
    fun killJob(id: String) {
        Log.w(TAG, "killJob($id) is a no-op; use pkill from the terminal")
    }

    /** Resolve a single env var from the prefix. */
    @JavascriptInterface
    fun env(name: String): String {
        val paths = BootstrapInstaller.getPaths(context)
        return when (name) {
            "PREFIX" -> paths.prefixDir
            "HOME" -> paths.homeDir
            "PATH" -> "${paths.prefixDir}/bin:/system/bin"
            else -> System.getenv(name) ?: ""
        }
    }

    /** True when the Termux bootstrap has been extracted. */
    @JavascriptInterface
    fun isReady(): Boolean {
        val paths = BootstrapInstaller.getPaths(context)
        return File(paths.prefixDir, "bin/sh").exists() &&
            File(paths.prefixDir, "bin/node").exists()
    }
}
