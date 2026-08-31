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
 * Thin adapter that gives the Compose shell (and the LLM via tool
 * calling) a *clean* view of the three servers (Codex / OpenClaw /
 * Hermes) without coupling to [CodexServerManager] internals.
 *
 * The adapter is the only place in the v3 shell that calls
 * `startServer()` / `stopServer()` etc. directly. The
 * [com.dagestan.mobile.services.CodexService] / `OpenClawService` /
 * `HermesService` singletons (alpha1) remain the source of *state*;
 * the adapter is the source of *commands* + coarse state.
 *
 * The native Home tab binds to this adapter for live state. The
 * ChatScreen also calls into it when the LLM invokes one of the
 * server-control tools (`start_server`, `stop_server`,
 * `server_status`).
 */
class ServersAdapter private constructor(
    private val appContext: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val manager: CodexServerManager = CodexServerManager.getInstance(appContext)

    data class ServerState(
        val key: String,
        val label: String,
        val port: Int,
        val isRunning: Boolean,
        val url: String,
    )

    val codexState: StateFlow<ServerState> = MutableStateFlow(
        ServerState("codex", "Codex", 18925, manager.isRunning, manager.serverUrl())
    ).also { state ->
        scope.launch { refreshCodex(state) }
    }.asStateFlow()

    val openClawState: StateFlow<ServerState> = MutableStateFlow(
        ServerState("openclaw", "OpenClaw", 18790, manager.isGatewayRunning, "http://127.0.0.1:19002/")
    ).also { state ->
        scope.launch { refreshOpenClaw(state) }
    }.asStateFlow()

    val hermesState: StateFlow<ServerState> = MutableStateFlow(
        ServerState("hermes", "Hermes", 8788, false, manager.hermesUrl())
    ).also { state ->
        scope.launch { refreshHermes(state) }
    }.asStateFlow()

    fun startCodex() = scope.launch {
        val ok = manager.startServer()
        if (ok) {
            DagestanBus.publish(BusEvent.CodexStateChanged(isRunning = true, port = 18925))
        } else {
            DagestanBus.publish(BusEvent.CodexError(manager.lastServerError ?: "unknown"))
        }
        refreshCodex(codexState as MutableStateFlow)
    }

    fun stopCodex() = scope.launch {
        manager.stopServer()
        refreshCodex(codexState as MutableStateFlow)
        DagestanBus.publish(BusEvent.CodexStateChanged(isRunning = false, port = 18925))
    }

    fun startOpenClaw() = scope.launch {
        val ok = manager.startOpenClawGateway()
        if (ok) {
            DagestanBus.publish(BusEvent.OpenClawStateChanged(isRunning = true, port = 18790))
        }
        refreshOpenClaw(openClawState as MutableStateFlow)
    }

    fun stopOpenClaw() = scope.launch {
        manager.stopOpenClaw()
        refreshOpenClaw(openClawState as MutableStateFlow)
        DagestanBus.publish(BusEvent.OpenClawStateChanged(isRunning = false, port = 18790))
    }

    fun startHermes() = scope.launch {
        val ok = manager.startHermesServer()
        if (ok) {
            DagestanBus.publish(BusEvent.HermesStateChanged(isRunning = true, port = 8788))
        }
        refreshHermes(hermesState as MutableStateFlow)
    }

    fun stopHermes() = scope.launch {
        manager.stopHermes()
        refreshHermes(hermesState as MutableStateFlow)
        DagestanBus.publish(BusEvent.HermesStateChanged(isRunning = false, port = 8788))
    }

    private suspend fun refreshCodex(flow: MutableStateFlow<ServerState>) {
        flow.value = flow.value.copy(
            isRunning = manager.isRunning,
            url = manager.serverUrl(),
        )
    }

    private suspend fun refreshOpenClaw(flow: MutableStateFlow<ServerState>) {
        flow.value = flow.value.copy(
            isRunning = manager.isGatewayRunning,
            url = manager.controlUiLaunchUrl(),
        )
    }

    private suspend fun refreshHermes(flow: MutableStateFlow<ServerState>) {
        // Hermes doesn't expose a clean "is running" predicate; we read
        // process liveness by trying a TCP connect on the port.
        flow.value = flow.value.copy(
            isRunning = try {
                val sock = java.net.Socket()
                sock.connect(java.net.InetSocketAddress("127.0.0.1", 8788), 200)
                sock.close()
                true
            } catch (_: Throwable) { false },
            url = manager.hermesUrl(),
        )
    }

    /**
     * Synchronous status snapshot, used by the LLM tool handler to
     * answer `server_status` calls without waiting on a StateFlow.
     */
    fun statusSnapshot(): String {
        val hermesRunning = try {
            val sock = java.net.Socket()
            sock.connect(java.net.InetSocketAddress("127.0.0.1", 8788), 200)
            sock.close()
            true
        } catch (_: Throwable) { false }
        return buildString {
            append("codex:").append(if (manager.isRunning) "running" else "stopped").append('\n')
            append("openclaw:").append(if (manager.isGatewayRunning) "running" else "stopped").append('\n')
            append("hermes:").append(if (hermesRunning) "running" else "stopped")
        }
    }

    companion object {
        @Volatile
        private var instance: ServersAdapter? = null

        fun getInstance(context: Context): ServersAdapter =
            instance ?: synchronized(this) {
                instance ?: ServersAdapter(context.applicationContext)
                    .also { instance = it }
            }
    }
}
