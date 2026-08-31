package com.dagestan.mobile.services

import android.content.Context
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus

/**
 * SandboxManager — alpha1 stub.
 *
 * bubblewrap-backed per-skill / per-tool-call sandboxes. Real
 * implementation lands in beta3. Alpha1 only registers the
 * singleton and reserves the bus event names.
 */
class SandboxManager private constructor(
    @Suppress("UNUSED_PARAMETER") context: Context,
) {
    init {
        // No sandbox created yet.
    }

    companion object {
        @Volatile
        private var instance: SandboxManager? = null

        fun getInstance(context: Context): SandboxManager =
            instance ?: synchronized(this) {
                instance ?: SandboxManager(context.applicationContext)
                    .also { instance = it }
            }
    }
}
