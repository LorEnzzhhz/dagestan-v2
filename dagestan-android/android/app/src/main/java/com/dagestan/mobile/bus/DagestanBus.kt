package com.dagestan.mobile.bus

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

/**
 * Dagestan OS — process-wide event bus.
 *
 * Every service publishes [BusEvent]s here; every UI / service subscribes.
 * One [MutableSharedFlow] with replay = 0 so new subscribers don't get
 * stale state — services that need current state should expose their own
 * [kotlinx.coroutines.flow.StateFlow].
 *
 * Alpha1: the bus is wired up; no service consumes it yet. The point of
 * alpha1 is to land the bus and the service stubs so beta1+ can build on
 * top without touching the existing (working) v2.8.1 wiring.
 */
object DagestanBus {

    private val scope = CoroutineScope(SupervisorJob())

    private val _events = MutableSharedFlow<BusEvent>(
        replay = 0,
        extraBufferCapacity = 64,
    )

    val events: SharedFlow<BusEvent> = _events.asSharedFlow()

    /** Suspending publish — waits for a subscriber slot if the buffer is full. */
    suspend fun publish(event: BusEvent) {
        _events.emit(event)
    }

    /** Fire-and-forget publish. Drops the event if the bus is busy. */
    fun publishAsync(event: BusEvent) {
        scope.launch { _events.emit(event) }
    }
}
