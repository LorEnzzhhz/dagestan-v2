package com.dagestan.mobile.bus

/**
 * Dagestan OS — sealed event hierarchy published on [DagestanBus].
 *
 * Every service emits one of these. The UI subscribes and renders.
 * Keep events small, immutable, and side-effect-free.
 *
 * Alpha1: this hierarchy is the *contract* every service in alpha1+
 * agrees on. No runtime behavior depends on it yet — that lands in alpha2+.
 */
sealed interface BusEvent {

    // ── Codex service ──────────────────────────────────────────────────
    data class CodexStateChanged(
        val isRunning: Boolean,
        val port: Int = 18925,
    ) : BusEvent

    data class CodexLog(val line: String) : BusEvent
    data class CodexError(val reason: String) : BusEvent

    // ── OpenClaw ───────────────────────────────────────────────────────
    data class OpenClawStateChanged(
        val isRunning: Boolean,
        val port: Int = 18790,
    ) : BusEvent

    data class OpenClawLog(val line: String) : BusEvent
    data class OpenClawError(val reason: String) : BusEvent

    // ── Hermes ─────────────────────────────────────────────────────────
    data class HermesStateChanged(
        val isRunning: Boolean,
        val port: Int = 8788,
    ) : BusEvent

    data class HermesLog(val line: String) : BusEvent
    data class HermesError(val reason: String) : BusEvent

    // ── Skills + Marketplace ───────────────────────────────────────────
    data class SkillInstalled(val name: String, val version: String) : BusEvent
    data class SkillRemoved(val name: String) : BusEvent
    data class SkillUpdateAvailable(
        val name: String,
        val fromVersion: String,
        val toVersion: String,
    ) : BusEvent
    data class SkillRunStarted(val name: String, val sandboxId: String) : BusEvent
    data class SkillRunFinished(
        val name: String,
        val exitCode: Int,
        val sandboxId: String,
    ) : BusEvent

    // ── Tool calling (LLM → app control) ──────────────────────────────
    /** LLM requested a tool call. The Chat screen routes to the
     *  appropriate service (SkillsService, ServersAdapter, …) and
     *  feeds the result back as [ToolCallResult]. */
    data class ToolCallRequested(
        val callId: String,
        val toolName: String,
        val arguments: String,   // raw JSON object string
    ) : BusEvent

    data class ToolCallResult(
        val callId: String,
        val toolName: String,
        val success: Boolean,
        val output: String,      // plain text or JSON
    ) : BusEvent

    // ── Vault ──────────────────────────────────────────────────────────
    data class VaultLocked(val reason: String = "user") : BusEvent
    data class VaultUnlocked(val reason: String = "user") : BusEvent
    data class SecretStored(val key: String) : BusEvent
    data class SecretDeleted(val key: String) : BusEvent

    // ── Pulse ──────────────────────────────────────────────────────────
    data class PulseSample(
        val cpuPercent: Float,
        val memUsedMb: Long,
        val memTotalMb: Long,
        val batteryTempC: Float?,
        val netRxBps: Long,
        val netTxBps: Long,
    ) : BusEvent

    // ── Device Lab ─────────────────────────────────────────────────────
    data class DeviceFrameChanged(val preset: String) : BusEvent
    data class ScreenshotTaken(val path: String) : BusEvent
    data class RecordingSaved(val path: String) : BusEvent

    // ── Sandbox ────────────────────────────────────────────────────────
    data class SandboxCreated(
        val id: String,
        val imageRef: String,
    ) : BusEvent

    data class SandboxExited(
        val id: String,
        val exitCode: Int,
    ) : BusEvent

    data class SandboxPortForwarded(
        val id: String,
        val sandboxPort: Int,
        val hostPort: Int,
    ) : BusEvent

    data class SandboxKilled(val id: String, val reason: String) : BusEvent

    // ── Build Mode ─────────────────────────────────────────────────────
    data class BuildStarted(
        val id: String,
        val prompt: String,
    ) : BusEvent

    data class BuildLog(val line: String) : BusEvent
    data class BuildStepFinished(
        val step: String,
        val layerNumber: Int,
    ) : BusEvent

    data class BuildPreviewReady(val url: String) : BusEvent
    data class BuildFinished(
        val id: String,
        val success: Boolean,
    ) : BusEvent

    // ── Voice ──────────────────────────────────────────────────────────
    data class WakeWordDetected(val phrase: String) : BusEvent
    data class VoiceTranscript(val text: String, val isFinal: Boolean) : BusEvent
    data class VoiceCommandDispatched(
        val command: String,
        val args: List<String>,
    ) : BusEvent

    data class TtsSpoken(val text: String) : BusEvent
    data class TtsError(val reason: String) : BusEvent

    // ── Voice (beta2) ─────────────────────────────────────────────────
    data class VoiceListeningChanged(val isListening: Boolean) : BusEvent
    data class VoiceWakeWordDetected(val phrase: String) : BusEvent
    data class VoicePartialTranscript(val text: String) : BusEvent
    data class VoiceFinalTranscript(val text: String) : BusEvent
    data class VoiceError(val reason: String) : BusEvent
}
