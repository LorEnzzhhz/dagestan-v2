package com.dagestan.mobile.services

import android.content.Context
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus

/**
 * Device Lab — alpha1 stub.
 *
 * In-app phone-frame preview pane (Module 8). Real screen capture +
 * MediaProjection land in beta2. Alpha1 establishes the singleton so
 * bus events have a publisher.
 */
class DeviceLabService private constructor(
    @Suppress("UNUSED_PARAMETER") context: Context,
) {
    init {
        DagestanBus.publishAsync(
            BusEvent.DeviceFrameChanged(preset = "pixel-7")
        )
    }

    companion object {
        @Volatile
        private var instance: DeviceLabService? = null

        fun getInstance(context: Context): DeviceLabService =
            instance ?: synchronized(this) {
                instance ?: DeviceLabService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
