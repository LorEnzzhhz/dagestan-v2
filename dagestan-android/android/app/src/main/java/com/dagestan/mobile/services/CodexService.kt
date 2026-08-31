package com.dagestan.mobile.services

import android.content.Context
import com.dagestan.mobile.CodexServerManager
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Codex service — alpha1 façade.
 *
 * Alpha1 deliberately does **not** replace [CodexServerManager]. The
 * v2.8.1 wiring through [MainActivity] keeps working unchanged. What
 * alpha1 adds:
 *
 *   1. A [StateFlow] exposing the current Codex server state.
 *   2. A bus publisher that announces state changes.
 *
 * Beta1+ will progressively move process control into this class
 * (start/stop routing, log streaming, etc.) so the UI can subscribe to
 * the bus instead of polling [CodexServerManager].
 */
class CodexService private constructor(
    private val appContext: Context,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _state.asStateFlow()

    /** Bus port of the Codex server (matches [CodexServerManager.SERVER_PORT]). */
    val port: Int get() = 18925

    private val manager: CodexServerManager = CodexServerManager.getInstance(appContext)

    init {
        // Publish a single "service alive" pulse on startup so the UI
        // can show the service as available in beta1+.
        DagestanBus.publishAsync(
            BusEvent.CodexStateChanged(
                isRunning = manager.isRunning,
                port = port,
            )
        )
    }

    /** Re-read the current state from the manager and publish. */
    fun refresh() {
        scope.launch {
            val running = manager.isRunning
            _state.value = running
            DagestanBus.publish(
                BusEvent.CodexStateChanged(isRunning = running, port = port)
            )
        }
    }

    companion object {
        @Volatile
        private var instance: CodexService? = null

        fun getInstance(context: Context): CodexService =
            instance ?: synchronized(this) {
                instance ?: CodexService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
