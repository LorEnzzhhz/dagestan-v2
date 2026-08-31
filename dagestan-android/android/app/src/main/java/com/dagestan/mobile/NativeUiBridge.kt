package com.dagestan.mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * Native UI bridge exposed to the codex-web WebView as `window.DagestanNative`.
 *
 * Lets the injected mobile sidebar (see `MainActivity.buildDagestanOverlayJs`)
 * open the native Settings / Terminal overlays and copy the on-device agent
 * installer without leaving the WebView.
 */
class NativeUiBridge(private val activity: MainActivity) {

    companion object {
        private const val TAG = "NativeUiBridge"
    }

    private val main = Handler(Looper.getMainLooper())

    /** Open the native Settings overlay (provider + API key). */
    @JavascriptInterface
    fun openSettings(): Boolean {
        return runOnMain {
            try {
                activity.showSettings()
                true
            } catch (e: Exception) {
                Log.e(TAG, "openSettings failed", e); false
            }
        }
    }

    /** Open the native Terminal overlay. */
    @JavascriptInterface
    fun openTerminal(): Boolean {
        return runOnMain {
            try {
                activity.showTerminal()
                true
            } catch (e: Exception) {
                Log.e(TAG, "openTerminal failed", e); false
            }
        }
    }

    /** Copy the on-device agent installer to the clipboard and toast a hint. */
    @JavascriptInterface
    fun copyDeviceAgent(): Boolean {
        val ctx = activity.applicationContext
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val script = activity.assets.open("web/dagestan-agent.sh").bufferedReader().use { it.readText() }
        cm.setPrimaryClip(ClipData.newPlainText("dagestan-agent.sh", script))
        return runOnMain {
            Toast.makeText(activity, "Agent installer copied — paste on your server", Toast.LENGTH_LONG).show()
            true
        }
    }

    /** Copy a literal command to the clipboard (for power users). */
    @JavascriptInterface
    fun copyText(text: String): Boolean {
        val ctx = activity.applicationContext
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Dagestan", text))
        return true
    }

    private fun runOnMain(block: () -> Boolean): Boolean = try {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else {
            val out = arrayOf<Boolean?>(null)
            main.post { out[0] = block() }
            out[0] ?: false
        }
    } catch (e: Exception) {
        Log.e(TAG, "main dispatch failed", e); false
    }
}
