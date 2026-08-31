package com.dagestan.mobile.services

import android.content.Context
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus

/**
 * Build Mode — alpha1 stub.
 *
 * The collapsible split-view: chat + build log on top, Device Lab
 * preview on the bottom. Auto-reloads as the model writes files.
 * Real implementation lands in beta4. Alpha1 only registers the
 * singleton so the bus contract has a publisher.
 */
class BuildService private constructor(
    @Suppress("UNUSED_PARAMETER") context: Context,
) {
    init {
        // No build started yet.
    }

    companion object {
        @Volatile
        private var instance: BuildService? = null

        fun getInstance(context: Context): BuildService =
            instance ?: synchronized(this) {
                instance ?: BuildService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
