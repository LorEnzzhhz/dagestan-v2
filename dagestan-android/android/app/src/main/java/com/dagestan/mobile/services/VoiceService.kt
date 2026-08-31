package com.dagestan.mobile.services

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.core.content.ContextCompat
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Voice service (beta2).
 *
 *  - **STT** uses Android's [SpeechRecognizer] (online by default on
 *    GMS devices; on AOSP builds it falls back to the on-device
 *    engine). A future beta3 swap-in is Vosk for a strict-local
 *    guarantee.
 *  - **TTS** uses Android's [TextToSpeech].
 *  - **Wake word** is matched inside the recognizer's partial
 *    results. When a transcript starts with (or contains) "hey
 *    dagestan" (case-insensitive), the trailing text is published as
 *    [BusEvent.VoiceFinalTranscript]. Other audio is silently
 *    discarded.
 *
 * The service exposes:
 *   - [isListening] StateFlow (drives the mic pill in the UI)
 *   - [partial]    StateFlow (live partial transcript for the bubble)
 *   - [start]      start the always-on listening loop
 *   - [stop]       stop the loop and release resources
 *   - [speak]      TTS the given text
 */
class VoiceService private constructor(
    private val appContext: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var running = false

    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private val _partial = MutableStateFlow("")
    val partial: StateFlow<String> = _partial.asStateFlow()

    init {
        // Lazy-init TTS (it needs a Looper; ok to do from any thread).
        scope.launch {
            tts = TextToSpeech(appContext) { status ->
                ttsReady = (status == TextToSpeech.SUCCESS)
                if (ttsReady) {
                    tts?.language = Locale.US
                }
            }
        }
    }

    fun hasRecordPermission(): Boolean = ContextCompat.checkSelfPermission(
        appContext, Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED

    fun start() {
        if (running) return
        if (!hasRecordPermission()) {
            DagestanBus.publishAsync(
                BusEvent.VoiceError("RECORD_AUDIO permission not granted")
            )
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(appContext)) {
            DagestanBus.publishAsync(
                BusEvent.VoiceError("Speech recognition not available on this device")
            )
            return
        }
        running = true
        beginOneSession()
    }

    fun stop() {
        running = false
        _isListening.value = false
        _partial.value = ""
        try { recognizer?.stopListening() } catch (_: Throwable) {}
        try { recognizer?.destroy() } catch (_: Throwable) {}
        recognizer = null
    }

    fun speak(text: String) {
        if (!ttsReady) return
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dagestan-utterance")
        DagestanBus.publishAsync(BusEvent.TtsSpoken(text))
    }

    private fun beginOneSession() {
        if (!running) return
        val r = SpeechRecognizer.createSpeechRecognizer(appContext)
        recognizer = r
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _isListening.value = true
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                _isListening.value = false
                _partial.value = ""
                // Common transient errors: 6 (no match), 7 (timeout),
                // 8 (busy), 9 (insufficient permission). Auto-restart.
                if (running) {
                    scope.launch { beginOneSession() }
                } else {
                    DagestanBus.publishAsync(BusEvent.VoiceError("recognizer error $error"))
                }
            }
            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull().orEmpty()
                handleFinal(text)
            }
            override fun onPartialResults(partials: Bundle?) {
                val text = partials
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull().orEmpty()
                if (text.isNotEmpty()) {
                    _partial.value = text
                    DagestanBus.publishAsync(BusEvent.VoicePartialTranscript(text))
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        try {
            r.startListening(intent)
        } catch (t: Throwable) {
            DagestanBus.publishAsync(BusEvent.VoiceError("startListening failed: ${t.message}"))
            running = false
            _isListening.value = false
        }
    }

    private fun handleFinal(text: String) {
        _isListening.value = false
        _partial.value = ""
        val lower = text.lowercase(Locale.US)
        val idx = lower.indexOf("hey dagestan")
        if (idx < 0) {
            // Not a wake word — restart silently. (A real product
            // would run an on-device wake-word model first; this
            // simple version does it server-side in the cloud STT.)
            if (running) scope.launch { beginOneSession() }
            return
        }
        DagestanBus.publishAsync(BusEvent.VoiceWakeWordDetected("hey dagestan"))
        val rest = text.substring(idx + "hey dagestan".length).trim(',', ' ', '.', '!', '?', '\n')
        if (rest.isEmpty()) {
            // Greet and continue listening.
            speak("How can I help you?")
            if (running) scope.launch { beginOneSession() }
            return
        }
        DagestanBus.publishAsync(BusEvent.VoiceFinalTranscript(rest))
        if (running) scope.launch { beginOneSession() }
    }

    companion object {
        @Volatile
        private var instance: VoiceService? = null

        fun getInstance(context: Context): VoiceService =
            instance ?: synchronized(this) {
                instance ?: VoiceService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
