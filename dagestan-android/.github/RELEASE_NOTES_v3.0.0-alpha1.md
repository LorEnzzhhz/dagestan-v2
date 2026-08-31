# Dagestan v3.0.0-alpha1 — "Dagestan OS" foundation

> First preview of the v3 architecture. **No behavior change** for users —
> this release only lands the event bus and 11 service stubs so beta1+
> can build on top of them without touching the working v2.8.1 wiring.

## What's new

- 🚌 **DagestanBus** — process-wide event bus (`MutableSharedFlow<BusEvent>`)
  in `com.dagestan.mobile.bus`. The single seam every service in v3
  publishes on, and the UI subscribes to.
- 📐 **BusEvent** — a sealed interface with **41 event types** spanning
  Codex / OpenClaw / Hermes state, Skills + Marketplace, Vault, Pulse,
  Device Lab, Sandbox, Build Mode, and Voice. This is the contract
  alpha1+ services agree on.
- 🧩 **11 service stubs** under `com.dagestan.mobile.services/`. Each
  registers as a process singleton and publishes a single "alive" event
  on construction so the bus contract has a publisher:
  - `CodexService` (alpha1 façade over the v2.8.1 `CodexServerManager`;
    `StateFlow<Boolean>` for `isRunning`)
  - `OpenClawService`, `HermesService`
  - `SkillsService` (full marketplace lands in beta1)
  - `VaultService` (Keystore-backed AES-GCM lands in alpha3)
  - `PulseService` (live CPU/RAM/battery/net lands in alpha3)
  - `DeviceLabService` (phone-frame preview lands in beta2)
  - `SandboxManager` (bubblewrap-backed sandboxes land in beta3)
  - `BuildService` (collapsible Build Mode lands in beta4)
  - `VoiceService` (100% local: openWakeWord + whisper.cpp + Piper TTS,
    lands in beta5)
- 📦 **kotlinx-coroutines-android 1.7.3** added to `app/build.gradle.kts`
  (was already in the Gradle cache transitively; now declared explicitly).

## What is *not* in this release

- No UI change. The legacy dashboard is **untouched**.
- No APK rebuild needed for this drop. The stub services don't run
  anything; they only exist as the architecture seam for beta1+.

## v3.0 phase plan (locked)

| Phase | Scope | Ships as |
|---|---|---|
| 3.0.0-alpha1 | Bus + 11 service stubs (this release) | alpha1 |
| 3.0.0-alpha2 | Compose UI shell (Home = legacy dashboard) | alpha2 |
| 3.0.0-alpha3 | Vault + Pulse + themes | alpha3 |
| 3.0.0-beta1  | Skills marketplace + 3 seed skills | beta1 |
| 3.0.0-beta2  | Device Lab | beta2 |
| 3.0.0-beta3  | SandboxManager | beta3 |
| 3.0.0-beta4  | Build Mode (collapsible split + auto-reload) | beta4 |
| 3.0.0-beta5  | Voice AI (all local) | beta5 |
| 3.0.0-rc1    | Default flag on, drop legacy JS hacks | rc1 |
| 3.0.0        | Stable | stable |

## Hard invariants (will not change)

1. The legacy server dashboard structure is frozen — same buttons, same
   order, same labels, forever. The new Home tab embeds the existing
   `dashboard_screen.xml` unchanged.
2. No local LLM in the chat / Codex sense. Voice uses small offline
   STT/TTS models (whisper.cpp + Piper), not a coding model.
3. Voice is 100% local / offline (no cloud STT, no API key).
4. No APK rebuild on alpha1; behavior is identical to v2.8.1.
