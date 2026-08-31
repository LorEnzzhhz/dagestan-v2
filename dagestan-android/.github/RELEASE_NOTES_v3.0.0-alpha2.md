# Dagestan v3.0.0-alpha2 — Compose shell (opt-in)

> Second preview of the v3 architecture. The legacy dashboard is
> **embedded unchanged** as the Home tab of a new Jetpack Compose shell
> with a bottom nav. The shell is **off by default** — existing v2.8.1
> users see no change. Power users can flip the flag with a long-press
> on the splash logo.

## What's new

- 🏗 **Jetpack Compose** runtime + Material 3 added to `app/build.gradle.kts`
  via the Compose BOM (`2024.06.00`). Kotlin 2.0+ Compose Compiler plugin
  declared in the root build (`org.jetbrains.kotlin.plugin.compose:2.1.0`).
- 🧭 **Bottom nav with 5 tabs**: Home (legacy dashboard) | Chat | Skills |
  Vault | Pulse. Tabs 2-5 are stubs showing the phase each ships in.
- 🏠 **Home tab is the frozen `dashboard_screen.xml`**, embedded via
  `AndroidView { LayoutInflater.from(ctx).inflate(R.layout.dashboard_screen) }`.
  Same buttons, same order, same labels, forever.
- 🚦 **Feature flag** `DagestanPrefs.useComposeShell` (default **off**).
  - Toggle: **long-press the splash logo** on the legacy shell. A Toast
    confirms the new state; the user relaunches to see the new shell.
  - When **on**: `setContent { DagestanApp() }` takes over. Legacy
    WebView / overlay / server wiring is intentionally skipped on this
    path (the shell is a preview; restore by flipping the flag off).
  - When **off**: the existing `setContentView(R.layout.activity_main)`
    path runs unchanged, exactly as in v2.8.1.
- 🎨 **Caucasus palette** (`ui/theme/Theme.kt`) — the same green / red /
  blue flag bands as the v2.x skin, exposed as a Material 3 `ColorScheme`.
  alpha2 only ships dark mode; light/auto + theme picker land in alpha3.
- 📦 APK size delta: **+~3 MB** (Compose runtime + Material 3 + icons).
  This is the only one-shot size cost of the v3 shell; further phases
  add features inside the existing shell.

## What is *not* in this release

- No new bus subscribers (the bus is still publish-only).
- No Vault, Pulse, Skills, Device Lab, Sandbox, Build Mode, or Voice UI.
  The stubs are placeholders so the nav is navigable.
- No APK rebuild recommended in this announcement. The Compose shell is
  opt-in; users who flip the flag see the new shell on next launch.
- **The legacy server dashboard is unchanged.** `dashboard_screen.xml`
  is byte-for-byte the same as in v2.8.1.

## Try it

1. Install the alpha2 APK over your existing v2.8.1 install
   (`adb install -r dagestan-v3.0.0-alpha2.apk`).
2. Open the app — same dashboard as v2.8.1.
3. **Long-press the splash logo** → Toast says
   *"Compose shell ON — relaunch"*.
4. Relaunch → the new bottom-nav shell opens with the same dashboard
   in the Home tab and four stub tabs.
5. To go back: long-press the logo (or use the old launcher icon and
   long-press from a fresh install) → *"Legacy shell ON — relaunch"*.

## v3.0 phase plan (unchanged from alpha1)

| Phase | Scope | Status |
|---|---|---|
| 3.0.0-alpha1 | Bus + 11 service stubs | ✅ shipped |
| 3.0.0-alpha2 | Compose shell (this release) | ✅ shipped |
| 3.0.0-alpha3 | Vault + Pulse + themes | next |
| 3.0.0-beta1  | Skills marketplace + 3 seed skills | planned |
| 3.0.0-beta2  | Device Lab | planned |
| 3.0.0-beta3  | SandboxManager | planned |
| 3.0.0-beta4  | Build Mode (collapsible split + auto-reload) | planned |
| 3.0.0-beta5  | Voice AI (all local) | planned |
| 3.0.0-rc1    | Default flag on, drop legacy JS hacks | planned |
| 3.0.0        | Stable | planned |

## Hard invariants (still locked)

1. Legacy server dashboard structure is frozen forever. alpha2 proves
   this by embedding the existing `dashboard_screen.xml` unchanged.
2. No local LLM in the chat / Codex sense. Voice uses small offline
   STT/TTS models (whisper.cpp + Piper), not a coding model.
3. Voice is 100% local / offline (no cloud STT, no API key).
