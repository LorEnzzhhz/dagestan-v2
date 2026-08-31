package com.dagestan.mobile

import android.util.Log
import android.webkit.JavascriptInterface
import java.io.File

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
