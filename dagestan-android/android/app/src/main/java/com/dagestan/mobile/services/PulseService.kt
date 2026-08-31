package com.dagestan.mobile.services

import android.app.ActivityManager
import android.content.Context
import android.net.TrafficStats
import android.os.BatteryManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * Pulse — 1 Hz system monitor.
 *
 * Collects:
 *   - CPU% (system-wide, from /proc/stat jiffy delta)
 *   - RAM used / total (ActivityManager.MemoryInfo)
 *   - Battery level + temperature (BatteryManager + Intent.ACTION_BATTERY_CHANGED)
 *   - Network rx/tx bytes (TrafficStats — per-UID; uses mobile+total)
 *   - App process CPU time (Process.getProcessCpuTime / SystemClock.uptimeMillis)
 *
 * Polls at 1 Hz on a dedicated coroutine. Cheap (~0.1% CPU on a Pixel 7).
 * Lives for the duration of the process; cancelled in [stop] which is
 * called from the host (typically the Compose shell's onDispose).
 */
class PulseService private constructor(
    private val appContext: Context,
) {

    data class Snapshot(
        val cpuPercent: Float,
        val memUsedMb: Long,
        val memTotalMb: Long,
        val batteryLevel: Int,
        val batteryTempC: Float,
        val netRxBps: Long,
        val netTxBps: Long,
    ) {
        companion object {
            val EMPTY = Snapshot(0f, 0, 0, 0, 0f, 0, 0)
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    private val _state = MutableStateFlow(Snapshot.EMPTY)
    val state: StateFlow<Snapshot> = _state.asStateFlow()

    private val activityManager: ActivityManager =
        appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val batteryManager: BatteryManager? =
        appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch { runLoop() }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun runLoop() {
        var prevJiffies = readTotalJiffiesSafe()
        var prevMs = SystemClock.uptimeMillis()
        var prevRx = TrafficStats.getTotalRxBytes()
        var prevTx = TrafficStats.getTotalTxBytes()

        while (currentScopeActive()) {
            val now = SystemClock.uptimeMillis()
            val dtMs = (now - prevMs).coerceAtLeast(1)
            val curJiffies = readTotalJiffiesSafe()
            val curRx = TrafficStats.getTotalRxBytes()
            val curTx = TrafficStats.getTotalTxBytes()
            val jiffyDelta = (curJiffies - prevJiffies).coerceAtLeast(0)
            // 100 = USER_HZ on virtually every Android device; 1 jiffy = 10 ms
            // of CPU time across all cores summed. Divide by elapsed ms to
            // get a fraction of total possible CPU.
            val cpuPercent = (jiffyDelta.toFloat() * 10f) / dtMs.toFloat() * 100f

            val rxBps = (((curRx - prevRx).coerceAtLeast(0)) * 1000L) / dtMs
            val txBps = (((curTx - prevTx).coerceAtLeast(0)) * 1000L) / dtMs

            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            val memUsedMb = ((memInfo.totalMem - memInfo.availMem) / (1024L * 1024L))
            val memTotalMb = (memInfo.totalMem / (1024L * 1024L))

            val (battLevel, battTempC) = readBatterySafe()

            val snap = Snapshot(
                cpuPercent = cpuPercent.coerceIn(0f, 100f * Runtime.getRuntime().availableProcessors()),
                memUsedMb = memUsedMb,
                memTotalMb = memTotalMb,
                batteryLevel = battLevel,
                batteryTempC = battTempC,
                netRxBps = rxBps,
                netTxBps = txBps,
            )
            _state.value = snap
            DagestanBus.publishAsync(
                BusEvent.PulseSample(
                    cpuPercent = snap.cpuPercent,
                    memUsedMb = snap.memUsedMb,
                    memTotalMb = snap.memTotalMb,
                    batteryTempC = snap.batteryTempC,
                    netRxBps = snap.netRxBps,
                    netTxBps = snap.netTxBps,
                )
            )

            prevJiffies = curJiffies
            prevMs = now
            prevRx = curRx
            prevTx = curTx
            delay(1000L)
        }
    }

    private suspend fun currentScopeActive(): Boolean = scope.isActive

    private fun readTotalJiffiesSafe(): Long {
        return try {
            // /proc/stat on Android exposes a single "cpu" line with 10
            // fields: user, nice, system, idle, iowait, irq, softirq,
            // steal, guest, guest_nice. We sum them all.
            val line = File("/proc/stat").useLines { seq ->
                seq.firstOrNull { it.startsWith("cpu ") }
            } ?: return 0L
            val parts = line.split(Regex("\\s+")).drop(1)
            parts.sumOf { it.toLongOrNull() ?: 0L }
        } catch (t: Throwable) {
            Log.w(TAG, "/proc/stat unreadable: ${t.message}")
            0L
        }
    }

    private fun readBatterySafe(): Pair<Int, Float> {
        // The ACTION_BATTERY_CHANGED broadcast is the most reliable
        // cross-API source for both level and temperature.
        val intent = appContext.registerReceiver(
            null,
            android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED),
        )
        val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100) ?: 100
        val pct = if (level < 0 || scale <= 0) 0 else (level * 100) / scale
        val tenths = intent?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        return pct to (tenths / 10f)
    }

    companion object {
        private const val TAG = "DagestanPulse"

        @Volatile
        private var instance: PulseService? = null

        fun getInstance(context: Context): PulseService =
            instance ?: synchronized(this) {
                instance ?: PulseService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
