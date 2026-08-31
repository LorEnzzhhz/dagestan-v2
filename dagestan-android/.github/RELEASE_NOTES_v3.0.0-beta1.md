# Dagestan v3.0.0-beta1 — Skills marketplace + native chat

> First beta of the v3 architecture. The Skills marketplace and a
> native chat land in the Compose shell. The frozen-dashboard
> invariant from alpha2 is **dropped** per the v3 plan: the Home
> tab is now a real Compose screen with three animated server
> cards (Codex / OpenClaw / Hermes).

## What's new

- 🛒 **Skills marketplace (bundled)** — `services/SkillsService.kt`
  reads `assets/marketplace/index.json` on startup and copies the
  selected skill's folder from `assets/skills/<name>/` to
  `getExternalFilesDir()/skills/`. The marketplace in beta1 is
  bundled (no network); a network-backed index with version checks
  is a beta2 feature. Bus events:
  - `SkillInstalled(name, version)`
  - `SkillRemoved(name)`
  - `SkillUpdateAvailable(name, fromVersion, toVersion)`

- 🧩 **3 seed skills ship in the APK**
  - **explain-stacktrace** — read a stack trace, return a
    plain-English explanation of the most likely cause.
  - **git-commit** — read a git diff, emit a conventional-commit
    message.
  - **summarize-url** — fetch a URL, return a 3-bullet TL;DR.
  Each is a `run.sh` + `skill.json` pair; the JSON declares
  `name`, `version`, `permissions`, and `entry`. Future skills can
  be added by dropping a new folder into `assets/skills/`.

- 🖥 **Skills tab (real)** — search box (filters by name, title,
  description, tags), marketplace list with Install buttons, an
  Installed list with Uninstall buttons, animated row press-scale.
  Selecting install/uninstall hits the service and the lists
  recompose via `StateFlow`.

- 💬 **Native chat** — `ChatScreen` posts to
  `http://127.0.0.1:18923/v1/responses` (Codex's Responses API)
  with `stream: true` and parses the SSE `data:` lines into a
  rolling list of messages. The user message lands immediately;
  the assistant's reply streams in token-by-token. A banner
  appears if Codex isn't running with a hint to start it from the
  Home tab. The composer grows slightly when non-empty, and the
  send button enables/disables based on `busy` + blank-input
  state. No third-party JSON/SSE libs; the parser is ~30 lines
  of Kotlin using only `HttpURLConnection` + `BufferedReader`.

- 🏠 **Home tab (Compose native)** — replaces the frozen
  `dashboard_screen.xml` (alpha2) with three animated server
  cards. Each card has a status dot that *breathes* (alpha pulse)
  when the server is running, the port + URL beneath, and a
  single FAB-style Start/Stop button. A Welcome card and a
  Tip card frame the list. All animations come from
  `ui/animation/DagestanAnimations` (no magic numbers).

- 🧮 **`ServersAdapter`** — thin layer between
  `CodexServerManager` and the Compose shell. Exposes one
  `StateFlow<ServerState>` per server (Codex / OpenClaw / Hermes)
  and `startCodex()` / `stopCodex()` / `startOpenClaw()` /
  `stopOpenClaw()` / `startHermes()` / `stopHermes()` methods. The
  Home tab subscribes to the StateFlows; the manager is never
  touched directly from UI code.

- 🎬 **Animation tokens** — `ui/animation/DagestanAnimations.kt`
  centralizes durations (`FAST_MS` 120, `DEFAULT_MS` 240,
  `SLOW_MS` 360, `PAGE_MS` 300, `PULSE_MS` 1500), easings
  (`FastOutSlowInEasing` / `LinearOutSlowInEasing` / `EaseInOut`),
  spring specs (medium-bouncy press, no-bouncy default), and
  concrete `tweenFast/Default/Slow/Page*Float/IntSize/IntOffset`
  helpers. A `prefersReducedMotion()` reads
  `Settings.Global.ANIMATOR_DURATION_SCALE` and short-circuits
  custom animations when set to 0. `Modifier.pressScale()` and
  `rememberPulseAlpha()` are the two reusable composables.

- 🏗 **DagestanApplication** — touches the `SkillsService`
  singleton at process start so the bus receives its "alive"
  event alongside Vault + Pulse.

## Hard invariant change

- The alpha2 frozen-dashboard invariant is **dropped in beta1**.
  The Home tab now embeds a real Compose screen. The
  `dashboard_screen.xml` and the `MainActivity` legacy flow are
  still in the APK (the v2.8.1 path) and are reachable by
  toggling `DagestanPrefs.useComposeShell = false`; the long-press
  splash toggle still works.

## What is *not* in this release

- No network-backed marketplace or skill update check.
- No skills run from the Skills tab yet (the install/remove flow
  works, executing them is a beta2 feature).
- No Chat conversation history persistence (in-memory only).
- No migration of `CodexServerManager` provider keys into the
  Vault (still additive).
- The Compose shell is still **off by default**. Long-press the
  splash logo to enable.

## Try it

1. Install the beta1 APK over alpha3
   (`adb install -r dagestan-v3.0.0-beta1.apk`).
2. Long-press the splash logo → toast confirms Compose shell
   is ON → relaunch.
3. **Home** — tap Start on Codex → wait ~30s → the dot turns
   green and starts breathing → URL shows below the card.
4. **Chat** — the disabled banner is gone, type a message, send.
   Watch the assistant's reply stream in.
5. **Skills** — search "git", tap the install icon on
   `git-commit` → the Installed list at the bottom now has
   `git-commit`. Tap the trash icon to uninstall.
6. **Vault / Pulse** — still work as in alpha3.

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
| **3.0.0-beta1**  | **Skills marketplace + 3 seed skills + native chat** | ✅ **shipped** |
| 3.0.0-beta2  | Network marketplace + skill execution | planned |
| 3.0.0-beta3  | Device Lab | planned |
| 3.0.0-beta4  | SandboxManager | planned |
| 3.0.0-beta5  | Build Mode | planned |
| 3.0.0-rc1    | Voice AI (all local) | planned |
| 3.0.0        | Default flag on, drop legacy JS hacks | planned |

## Hard invariants (still locked)

1. No local LLM in the chat / Codex sense.
2. Voice is 100% local / offline.
3. The legacy `dashboard_screen.xml` flow is preserved as a
   fallback (toggle the shell off to use it).
