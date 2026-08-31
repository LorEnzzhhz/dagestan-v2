# Dagestan v3.0.0-alpha3 — Vault + Pulse + theming

> Third preview of the v3 architecture. Two real services and a real
> theming system ship in this drop. The legacy dashboard structure is
> still **frozen**; alpha3 is a vertical-slice upgrade of the Compose
> shell, opt-in via long-press on the splash logo.

## What's new

- 🔐 **Vault** (full implementation) — `services/VaultService.kt` backs
  the secret store with `EncryptedSharedPreferences` (AES-256-GCM, key
  in Android Keystore). The on-disk file at
  `/data/data/com.dagestan.mobile/shared_prefs/dagestan_vault.xml` is
  unreadable without the device-bound hardware key. The new
  `VaultScreen` lists keys, masks values, supports copy/lock/delete,
  and has a FAB to add new secrets. Bus events:
  `VaultLocked`, `VaultUnlocked`, `SecretStored`, `SecretDeleted`.
  Fallback: if the Keystore is unavailable (rare — factory-reset edge
  cases), the service drops to an in-memory no-op so the rest of the
  app keeps working. The user can opt into a user-passphrase variant
  in beta1.

- 📈 **Pulse** (full implementation) — `services/PulseService.kt`
  publishes a 1 Hz `StateFlow<Snapshot>` covering:
  - System-wide CPU% (jiffy delta from `/proc/stat`).
  - RAM used / total (`ActivityManager.MemoryInfo`).
  - Battery level + temperature (`ACTION_BATTERY_CHANGED` broadcast).
  - Network rx/tx bytes per second (`TrafficStats`).
  The new `PulseScreen` renders a card per metric, all live. The
  collector starts when the Compose shell is shown and stops on
  dispose — zero cost on the legacy path.

- 🎨 **Theming** (4 palettes × 3 modes) — `ui/theme/Theme.kt` ships:
  - **Caucasus** (the original; green/red/blue flag bands, slate bg)
  - **BlackSea** (cool teal/cyan, deep navy)
  - **SunsetRidge** (warm amber/ember, near-black)
  - **SnowPeak** (monochrome light)
  Plus `DagestanThemeMode.{SYSTEM, LIGHT, DARK}`. Pickers live on the
  Pulse screen for alpha3; a proper Settings sheet lands in beta1.
  Changing palette or mode re-skins the whole shell instantly because
  `DagestanApp` reads the prefs and re-emits.

- 🏗 **DagestanApplication** — first `Application` subclass; owns the
  Vault + Pulse singletons via the process lifecycle. `AndroidManifest.xml`
  registers it. This is the foundation for the rest of the v3 services
  to attach to a real process-wide owner.

- 🗑 **StubScreens.kt removed** — the alpha2 stub tab is gone; the
  Vault + Pulse tabs are real, Chat + Skills remain alpha2-style stubs
  in their own files (`ChatScreen.kt`, `SkillsScreen.kt`).

## What is *not* in this release

- No Skills / Marketplace / Sandbox / Device Lab / Build Mode / Voice
  UI. Chat + Skills are still stubs.
- No migration of existing API keys from `CodexServerManager`. The
  Vault is additive; the v2.8.1 provider picker still works.
- No user-passphrase Vault (device-bound only for alpha3).
- The shell is still **off by default**. Long-press the splash logo
  on the legacy shell to flip the flag.

## Try it

1. Install the alpha3 APK over v2.8.1 / alpha2
   (`adb install -r dagestan-v3.0.0-alpha3.apk`).
2. Open the app — same dashboard as v2.8.1.
3. Long-press the splash logo → Toast: *"Compose shell ON — relaunch"*.
4. Relaunch → bottom-nav shell opens.
5. Tap **Vault** → tap **+** → store a key/value → close → re-open
   the app → the key is still there, value is masked.
6. Tap **Pulse** → watch CPU/RAM/battery/net update once a second.
   Use the chips at the bottom to cycle palette and mode.

## v3.0 phase plan

| Phase | Scope | Status |
|---|---|---|
| 3.0.0-alpha1 | Bus + 11 service stubs | ✅ shipped |
| 3.0.0-alpha2 | Compose shell (opt-in) | ✅ shipped |
| 3.0.0-alpha3 | Vault + Pulse + theming | ✅ shipped |
| 3.0.0-beta1  | Skills marketplace + 3 seed skills + native chat | next |
| 3.0.0-beta2  | Device Lab | planned |
| 3.0.0-beta3  | SandboxManager | planned |
| 3.0.0-beta4  | Build Mode | planned |
| 3.0.0-beta5  | Voice AI (all local) | planned |
| 3.0.0-rc1    | Default flag on, drop legacy JS hacks | planned |
| 3.0.0        | Stable | planned |

## Hard invariants (still locked)

1. Legacy server dashboard structure is frozen forever. alpha2 proved
   this by embedding `dashboard_screen.xml` unchanged; alpha3 keeps it.
2. No local LLM in the chat / Codex sense.
3. Voice is 100% local / offline.
