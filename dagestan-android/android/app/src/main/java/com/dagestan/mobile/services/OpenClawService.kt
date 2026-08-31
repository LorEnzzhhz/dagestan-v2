package com.dagestan.mobile.services

import android.content.Context
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * OpenClaw service — alpha1 stub.
 *
 * Real start/stop logic is still inside [com.dagestan.mobile.CodexServerManager]
 * for the v2.8.1 build. This stub is here so:
 *
 *   - The bus contract is exercised in alpha1+ tests.
 *   - The Home tab in alpha2+ can subscribe uniformly.
 *
 * Beta1+ will fold the [CodexServerManager] process ownership for the
 * OpenClaw gateway into this class.
 */
class OpenClawService private constructor(
    @Suppress("UNUSED_PARAMETER") context: Context,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _state.asStateFlow()

    val port: Int get() = 18790

    init {
        DagestanBus.publishAsync(
            BusEvent.OpenClawStateChanged(isRunning = false, port = port)
        )
    }

    companion object {
        @Volatile
        private var instance: OpenClawService? = null

        fun getInstance(context: Context): OpenClawService =
            instance ?: synchronized(this) {
                instance ?: OpenClawService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
