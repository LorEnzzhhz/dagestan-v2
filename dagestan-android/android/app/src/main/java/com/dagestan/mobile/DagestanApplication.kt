package com.dagestan.mobile

import android.app.Application
import com.dagestan.mobile.services.PulseService
import com.dagestan.mobile.services.ServersAdapter
import com.dagestan.mobile.services.SkillsService
import com.dagestan.mobile.services.ToolRegistry
import com.dagestan.mobile.services.VaultService
import com.dagestan.mobile.services.VoiceService

/**
 * Application subclass — owns the long-lived service singletons.
 *
 * beta2 touches every service the v3 shell exposes (so the bus gets
 * their "alive" events at process start) and the [ToolRegistry] that
 * the ChatScreen queries for the LLM's `tools` manifest.
 */
class DagestanApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Touch the singletons so the bus gets their "alive" events.
        VaultService.getInstance(this)
        PulseService.getInstance(this)
        SkillsService.getInstance(this)
        ServersAdapter.getInstance(this)
        ToolRegistry.getInstance(this)
        VoiceService.getInstance(this)
    }
}
