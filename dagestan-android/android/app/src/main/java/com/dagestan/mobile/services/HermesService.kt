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
 * Hermes service — alpha1 stub.
 *
 * Mirrors [OpenClawService]. Real process control remains in
 * [com.dagestan.mobile.CodexServerManager] for the v2.8.1 build; this
 * class is the seam that beta1+ will use to publish state on the bus.
 */
class HermesService private constructor(
    @Suppress("UNUSED_PARAMETER") context: Context,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _state.asStateFlow()

    val port: Int get() = 8788

    init {
        DagestanBus.publishAsync(
            BusEvent.HermesStateChanged(isRunning = false, port = port)
        )
    }

    companion object {
        @Volatile
        private var instance: HermesService? = null

        fun getInstance(context: Context): HermesService =
            instance ?: synchronized(this) {
                instance ?: HermesService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
