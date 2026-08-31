# Dagestan v3.0.0-beta2 — Voice + tool calling + app control

> Second beta. Three big new things land in this drop: the AI now
> **hears you** ("Hey Dagestan"), **uses tools** (the LLM can start
> servers, install skills, run skills), and the chat shows the
> action as it happens.

## What's new

### 🎙 Voice (always-on)

- **"Hey Dagestan" wake word.** A new `services/VoiceService.kt`
  keeps an always-on `SpeechRecognizer` session. When the partial
  or final transcript contains the phrase *"hey dagestan"*, the
  trailing text is published as `BusEvent.VoiceFinalTranscript`
  and the chat tab auto-submits it. The AI then **speaks back** the
  final assistant message via Android `TextToSpeech`.
- **Floating mic pill.** A new `ui/VoiceOverlay.kt` floats above
  the bottom nav on every tab while listening, showing a pulsing
  mic icon + live partial transcript. Tap × to stop the loop.
- **Greeting on bare wake word.** Saying just "Hey Dagestan" (no
  command) makes Dagestan reply *"How can I help you?"* and keep
  listening.
- **STT engine.** Beta2 uses Android's system `SpeechRecognizer`
  (on most GMS devices this is Google's cloud STT; on AOSP it
  falls back to the on-device engine). A future beta3 swap-in is
  **Vosk** for a strict-local guarantee. TTS is Android's
  `TextToSpeech`.
- **Permissions.** Adds `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`
  to the manifest. `MainActivity` requests `RECORD_AUDIO` once
  when the Compose shell is opened; if denied, the chat still
  works via the keyboard — only the wake-word loop is disabled.

### 🛠 Tool calling (LLM → app control)

- **`services/ToolRegistry.kt`** is the single source of truth for
  LLM-callable tools. It returns the JSON `tools` array that goes
  into `/v1/responses` and dispatches a tool call by name to the
  right service.
- **Three skills tools.**
  - `install_skill(name)` — install a bundled skill
  - `list_skills()` — list marketplace + installed
  - `run_skill(name, args, stdin)` — run any installed skill
  - plus a per-skill wrapper (`skill_git_commit`, `skill_explain_stacktrace`,
    `skill_summarize_url`) so the model can call them by their
    natural name with a single `input` field.
- **Three server tools.**
  - `start_server(name)` — start `codex` / `openclaw` / `hermes`
  - `stop_server(name)` — stop any of the three
  - `server_status()` — return the live running/stopped state
- **Skills can run now.** `SkillsService.run(name, args, stdin)`
  executes an installed skill's `run.sh` (or whatever the
  `skill.json` `entry` says) via `sh`, captures stdout+stderr,
  publishes `SkillRunStarted` / `SkillRunFinished` on the bus.
- **Chat bubble shows the action.** When the model emits a tool
  call, the chat renders a small "🔧 <tool name>" line in the
  assistant bubble so the user sees exactly what was invoked.
- **Multi-turn tool loop.** The chat runs the conversation in a
  loop: send user → if model returns tool_calls, dispatch each,
  feed the results back as `function_call_output` items, ask the
  model to continue, until either the model produces a final
  message or the loop hits a 8-turn cap (safety).

### 🎛 Bus events (new)

- `ToolCallRequested(callId, toolName, arguments)`
- `ToolCallResult(callId, toolName, success, output)`
- `VoiceListeningChanged(isListening)`
- `VoiceWakeWordDetected(phrase)`
- `VoicePartialTranscript(text)`
- `VoiceFinalTranscript(text)`
- `VoiceError(reason)`

## Try it

1. Install the beta2 APK over beta1
   (`adb install -r dagestan-v3.0.0-beta2.apk`).
2. Grant the **microphone** permission when the system dialog
   appears on first open.
3. Long-press the splash logo → Compose shell opens. The
   `VoiceOverlay` pill appears at the bottom of every tab.
4. Say *"Hey Dagestan, install git commit"*. The wake word fires,
   the chat auto-submits the rest, the AI calls `install_skill`
   on its own, the skill lands in the Skills tab's Installed list,
   the AI replies with "Installed git-commit…".
5. Say *"Hey Dagestan, start codex"*. The AI calls
   `start_server("codex")`. Watch the Home tab's Codex card
   pulse green within ~30s.
6. Say *"Hey Dagestan, list skills"*. The AI calls `list_skills`
   and reads the result back to you via TTS.

## Build

```bash
cd android
./gradlew :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## v3.0 phase plan

| Phase | Scope | Status |
|---|---|---|
| 3.0.0-alpha1 | Bus + 11 service stubs | ✅ shipped |
| 3.0.0-alpha2 | Compose shell (opt-in) | ✅ shipped |
| 3.0.0-alpha3 | Vault + Pulse + theming | ✅ shipped |
| 3.0.0-beta1  | Skills marketplace + 3 seed skills + native chat | ✅ shipped |
| **3.0.0-beta2**  | **Voice + tool calling + app control** | ✅ **shipped** |
| 3.0.0-beta3  | Vosk on-device STT (drop Google) | planned |
| 3.0.0-beta4  | Network marketplace + signed skills | planned |
| 3.0.0-beta5  | Device Lab + Sandbox | planned |
| 3.0.0-rc1    | Build Mode + Voice polish | planned |
| 3.0.0        | Default flag on, drop legacy JS hacks | planned |

## Hard invariants (still locked)

1. No local LLM in the chat / Codex sense.
2. Voice is on-device only. (beta2 uses Android's system
   recognizer; beta3 swaps in Vosk for the strict-local
   guarantee.)
3. The legacy `dashboard_screen.xml` flow is preserved as a
   fallback.
