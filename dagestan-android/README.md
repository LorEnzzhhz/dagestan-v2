# 🏔 Dagestan

**Your own branded build of AnyClaw** — OpenClaw + OpenAI Codex CLI on Android,
in one installable APK. No root. No server. No PC.

Dagestan is a source-level rebrand of the open-source
[AnyClaw](https://github.com/OpenClawAndroid/openclaw-android-assistant) project
(MIT). Everything works exactly like upstream; only identity and looks changed.

## ✅ What was rebranded

| | Upstream (AnyClaw) | Dagestan |
|---|---|---|
| App name | AnyClaw | **Dagestan** |
| Package id | `com.codex.mobile` | `com.dagestan.mobile` |
| Launcher icon | Indigo checkmark | White Caucasus peak + green/red/blue flag bands |
| Notification | "AnyClaw is running" | "Dagestan is running" |
| Theme / version | `Theme.AnyClaw` 0.1.1 | `Theme.Dagestan` 1.6.0 |
| Dashboard skin | stock | **Dagestan skin** (see below) |

Engine internals (OpenClaw gateway, Codex CLI, Termux bootstrap) keep their real
names — they are functional npm package names, not branding, so they must stay.

## 🛠 v2.9.2 — the 4 servers actually start on-device

Root causes found and fixed for "servers won't run / port issues":

- **Hermes port bug** — upstream `hermes-webui` reads its HTTP port only
  from the `HERMES_WEBUI_PORT` env var (default **8787**), while the app
  probes and exposes **8788**. The server was actually running one port
  below while `startHermesServer()` reported "did not become ready in
  20s" forever. The manager now exports `HERMES_WEBUI_PORT=8788` before
  launch.
- **Stale port occupants** — starting OpenCodex/Hermes over an old
  instance died with "Address already in use" (or ocx refusing to hop
  ports). The manager now kills stale prefix processes before start via
  a proot-safe `/proc` cmdline+environ scan (no `fuser`/`lsof` needed).
- **Stop leaked aux servers** — `stopServer()` early-returned when the
  web server wasn't running, leaving OpenClaw/OpenCodex/Hermes/proxy
  alive and holding ports for the next start. Cleanup now always runs.
- **Services page was desktop-only** — it pinged dev-runner control
  ports (4000/19790/11101/9788), showed Codex on :3000 and offered a
  `scripts/services/runner.mjs` start command that doesn't exist on a
  phone. Inside the APK it now talks to the native manager through new
  `DagestanDroid` bridge methods (`serverState`/`startServer`/
  `stopServer`) using the real ports (18925/18790/10101/8788), with
  per-server error output surfaced on the cards.
- **Status probes hardened** — `lsof` is frequently missing in proot;
  Dashboard/DagestanShell/provider-status now fall back to a
  `/proc/net/tcp` socket-table scan (port in uppercase hex).

## ✨ v1.1.0 — improved dashboard

The in-app dashboard now ships a **Dagestan skin**, injected natively on every
page load (`MainActivity` → WebView) so it works no matter which frontend
version the engine installs:

- 🏔 **Full rebrand** — every visible "OpenClaw"/"AnyClaw" label reads
  *Dagestan* (safe text-node rewrite; scripts and styles untouched).
- ♾ **Unlimited context badge** — an always-visible pill confirms
  *"∞ Unlimited context · No paywall · No ads"* (tap to dismiss for a session).
- 🚫 **Paywall/ad banner suppression** — if any future upstream build ever
  renders upsell/paywall/sponsored surfaces, they're hidden automatically
  (deepest-element-first matching so functional panels are never blanked).
- 🎨 **Caucasus theme** — green/red/blue accent palette, themed scrollbars,
  slate-950 background, status-bar tint.
- 🔓 Engine side stays fully open: `approval_policy = "never"` +
  `sandbox_mode = "danger-full-access"` are written on every launch.

## ✨ v1.3.0 — free-model providers + animated setup

- 🔌 **Choose your AI provider on first launch** — a native picker lets you
  connect **OpenRouter**, **OpenCode Zen**, or **NVIDIA NIM** instead of paying
  for OpenAI. All three have free tiers; your key is stored only on-device.
- 🎬 **Animated setup checklist** — first run shows a live step list
  (extracting environment → proot → Node.js → Codex CLI → OpenClaw →
  connecting) with a Dagestan-flag gradient progress bar and pulsing logo,
  so long installs are no longer a black box.
- ♾ Still unlimited context, no paywall, no ads.

## ✨ v1.7.0 — providers actually work, stop no longer exits, Control UI connects

- 🔧 **All 4 providers fixed** — Codex 0.104+ removed `wire_api = "chat"`,
  which made every provider config fail to load (`Error loading
  configuration`). All providers now emit `wire_api = "responses"`.
- ⚙️ **Settings shows all providers inline** — tap OpenCode Zen /
  OpenRouter / NVIDIA NIM / Custom directly (radio rows, no hidden dialog).
- 🛑 **Stop/back no longer kicks you out** — the activity no longer kills
  the servers on destroy, Back minimizes instead of exiting, and the
  manager is a singleton so rotation keeps live server handles.
- 🖥 **OpenClaw Control UI auto-connects** — the gateway WebSocket
  (`ws://127.0.0.1:18789`) is now passed in the URL; previously the UI
  defaulted to its own port and showed a connect error.
- ❯_ **Codex card gains a Terminal button** (Browser | ❯_ | Stop).
- 🤖 **OpenCode: honest failure** — official builds are musl-linked and
  cannot run on Android's libc; the card now probes, installs the correct
  `opencode-linux-arm64-musl.tar.gz`, and reports "Not on Android" with an
  explanation instead of a broken install loop.

## ✨ v1.8.0 — OpenCodex: every LLM through Codex

**[OpenCodex](https://github.com/lidge-jun/opencodex)** replaces the
non-functional OpenCode card with a universal provider proxy that actually
works on Android:

- 🌐 **Route any LLM through Codex** — OpenRouter, NVIDIA NIM, DeepSeek,
  Ollama, Gemini, Grok, and 40+ built-in providers, all via the Responses
  API bridge that Codex 0.104+ now requires.
- 🎛 **Full dashboard at :10100** — add providers, pick models, view a
  live request log, manage account pools; opens inside the app's 🧭 button
  on the OpenCodex card.
- ⚡ **Bun from TUR** — installs a bionic-compiled Bun 1.4.0 from the
  Termux User Repository (no glibc/musl hacks), then `npm install -g
  @bitkyc08/opencodex --ignore-scripts` with the system bun via
  `OPENCODEX_BUN_PATH`.
- 🔄 **Start/Stop + auto-wait** — the proxy's `/readyz` endpoint is
  polled; if it doesn't come up in 45s, the card reports an honest error
  with Terminal details.
- 🖥 OpenCode's old card is gone (musl builds can't run on Android);
  this replaces it with something that actually delivers the promise.

## ✨ v1.8.1 — auto-wire Codex through OpenCodex

When the OpenCodex proxy starts, it now **automatically routes Codex**
through it — no manual `ocx init` needed:

- Writes `~/.codex/opencodex.config.toml` (provider table: `OpenCodex
  Proxy`, base_url `:10100/v1`, `wire_api = responses`)
- Injects `openai_base_url` into `~/.codex/config.toml` so Codex's
  built-in openai provider hits the proxy
- Cleans up the routing on Stop (removes the marker block)
- New `ocx status` terminal chip for diagnostics
- Toast confirms: "Codex now routes through OpenCodex at :10100"

## 🛠 v1.8.2 — robustness: dark theme, timeout kills, Hermes readiness, no-kick-out

- 🎨 **Dark theme CSS shim** — every web UI (Codex, OpenClaw Control UI,
  Hermes) now gets a dark-theme CSS injection so they match the app's
  `#020617` aesthetic instead of flashing white.
- 🔒 **Process kills can no longer hang or crash** — `stopWebServer`,
  `stopHermes`, `stopOpenCodex`, and `stopGateway` now use a 3–5s
  `waitFor(timeout)` with a background `destroyForcibly()` fallback, so a
  stuck process cannot wedge the stop button or kill the activity.
- ✅ **Hermes readiness probe** — instead of a blind 1.5s sleep, the
  server is polled until HTTP 200 or 15s timeout; the card reports honest
  success/failure instead of silently returning a dead server.
- 🔄 **OpenClaw Control UI + Hermes auto-start** — tapping their 🧭/
  ⧉ buttons now auto-starts the server (like Codex does) instead of
  loading a blank page when the server is down.
- ↩️ **WebView reload on return** — returning to an already-loaded URL
  refreshes it instead of showing stale content.
- 🛑 **Stop button wrapped in try-catch** — any server-stop exception
  is caught and logged instead of crashing the activity.

## 🛠 v1.9.1 — fix: foreground service, install retry, stop-kicks-out resolved

- 🔧 **Foreground service created** — `CodexForegroundService` was declared in
  the manifest but the class file didn't exist, so the service never started.
  Android could therefore kill the app when backgrounding or after Stop.
  The service now runs with `START_STICKY` and keeps all server processes
  alive across activity recreation, backgrounding, and configuration changes.
- 🔄 **npm install retry** — all npm installs (Codex, OpenClaw, OpenCodex,
  codex-web-local) now retry up to 3 times with exponential backoff on
  network errors (ECONNRESET, ETIMEDOUT, etc.). No more permanent failure
  on a single flaky connection.
- 🔔 **Notification permission** — requests `POST_NOTIFICATIONS` on Android
  13+ so the foreground service notification actually displays.
- 🏷 **`FOREGROUND_SERVICE_SPECIAL_USE`** type declared for Android 14+
  compliance.

## 🛠 v1.9.8 — fix: stop no longer kicks you out of the app

- 🛑 **Stop button safe** — `toggleCodex()`, `toggleGateway()`,
  `toggleOpenCodex()`, and `toggleHermes()` all run on background threads
  and never call `finish()` or `finishAffinity()`. Tapping Stop now
  only stops the targeted server — the activity stays alive.
- 🔧 **Foreground service resilient** — `startForegroundService()` is
  wrapped in try-catch so devices that reject the service start (Android
  12+ background restrictions) don't crash the app. The app still works
  without the service — servers survive via the activity process.
- 🛡 **finish() guard** — overriding `finish()` ensures no code path can
  accidentally close the activity during server stop.
- 📝 **onDestroy() safety** — added explicit comment that servers must
  never be stopped on activity destroy (rotation, back, backgrounding).

## 📦 v1.9.7 — OpenCodex + Hermes pre-installed in APK

- 📦 **OpenCodex + Hermes bundled in APK** — CI now downloads the OpenCodex
  npm package, Bun binary, and Hermes WebUI archive and bundles them as
  compressed assets in the APK. On first launch, setup extracts them
  instantly from the APK instead of downloading from the internet.
- ⚡ **Instant auxiliary setup** — OpenCodex and Hermes no longer require
  a network download on first tap. The bundled assets are extracted in
  under 5 seconds (vs 30-50s download previously).
- 🔄 **Fallback to npm/download** — if the bundled assets are missing
  (e.g. manual local build without running bundle-packages.sh), the
  install falls back to the original network download approach.
- 📜 **bundle-packages.sh** — CI script that pre-downloads all packages
  before APK build. Run `bash android/scripts/bundle-packages.sh` locally
  to test.

## 🛠 v1.9.6 — fix: setup reliability, OpenClaw/OpenCodex/Hermes pre-install

- ⚡ **Setup reordered for instant dashboard** — the web server now starts
  BEFORE OpenClaw gateway, OpenCodex proxy, and Hermes. Users see the
  dashboard immediately (~30s faster) instead of waiting for all services.
- 🚫 **Health check removed from setup** — the `codex exec "say hi"`
  verification could hang on non-OpenAI providers (big-pickle metadata
  not found). Setup now skips this step entirely — it's not needed for
  custom providers and was causing the "Verifying API access" freeze.
- 🔧 **OpenClaw gateway hardened** — cleanup uses `timeout 5` on token
  reset to prevent hangs, and gateway start is wrapped in try-catch so
  a gateway failure doesn't crash the entire setup.
- 📦 **OpenCodex/Hermes pre-install robust** — Bun install now checks
  for success before continuing; Hermes checks Python availability first.
  Both installs are non-fatal — if they fail, setup continues and the
  services can be installed on first tap from the dashboard.
- 🛡 **Setup is fault-tolerant** — each post-server step (OpenClaw,
  OpenCodex, Hermes) is wrapped in try-catch so one failure doesn't
  block the others.

## 🛠 v1.9.5 — fix: Codex sidebar + health check timeout

- 🖥 **Codex sidebar now renders** — the codex-web-local Vue SPA checks
  `window.innerWidth` at runtime to decide whether to show the sidebar.
  Injected JavaScript now overrides `innerWidth`, `outerWidth`, `matchMedia`,
  and the viewport meta tag before the app initializes, so the full desktop
  sidebar (Skills, Automations, Projects, Chats, Settings) renders on Android.
- ⏱ **Health check 30s timeout** — the setup's API verification step
  (`codex exec "say hi"`) could hang indefinitely when the model metadata
  wasn't found (e.g. `big-pickle`). Now kills the process after 30s and
  continues setup — a failed check is a warning, not a blocker.

## 🛠 v1.6.2 — fix: blank page when opening Codex

The web server can crash silently at boot when its npm dependencies
(`express`, `commander`) are missing from the on-device global install —
the WebView then shows a blank white page. Now: deps are verified (and
installed locally) before every start, a dead process is detected within
seconds with its **real output** in the error message, and **Open Codex**
auto-starts the server instead of loading nothing.

## 🛠 v1.6.1 — fix: "Failed to start server"

The web server (`codex-web-local`) was never actually installed — the APK
asset bundle it expected doesn't exist, so setup died at the last step.
Now the server installs from the **npm registry** (pinned `0.1.0`) during
setup, with a self-heal retry if it's ever missing. Failures now show the
**real reason** (missing package list / npm exit code) instead of a generic
"Failed to start server".

## ✨ v1.6.0 — no forced login, custom providers, visual overhaul

- 🔓 **No forced sign-in** — the OpenAI browser login is gone from the setup
  flow. First launch lets you pick a free provider, **or tap *Skip for now*
  and land straight on the dashboard**; add a key whenever you like in
  ⚙ Settings.
- 🩺 **The health check can no longer trap you** — a failed provider check
  is now a warning, not a dead end. Codex still starts; fix the key in
  Settings when convenient. (OpenAI login still exists for those who want
  it: run `codex login` from the built-in Terminal — the printed URL is
  tappable.)
- 🧩 **Custom provider (BRING YOUR OWN)** — point Dagestan at *any*
  OpenAI-compatible endpoint: base URL + model + key in ⚙ Settings.
- ⚙ **Rebuilt Settings screen** — tappable provider selector with badges
  (FREE TIERS / FREE CREDITS / BRING YOUR OWN), a direct *Get key ↗* link
  per provider, and inline validation.
- ❯_ **Terminal quick commands** — one-tap chips for `codex login`,
  `codex login status`, `openclaw gateway status`, and `df -h`.
- 🎨 **Visual overhaul** — slide-and-fade screen transitions, ripple +
  press-scale feedback on every button and card, animated layout changes on
  the dashboard, pulsing status dot, and a green Caucasus theme that replaces
  the old Material purple everywhere.

## ✨ v1.5.0 — full dashboard: Codex, Gateway, OpenCode, Hermes

After setup you land on a **native dashboard** instead of being dropped into a
web view. Every server on the device is one tap away:

- 🟢 **Codex** — live running/stopped status, **Open Codex** launches the
  full web UI inside the app, **Browser** opens it in Chrome, **Start/Stop**
  controls the server.
- 🕸 **OpenClaw Gateway** — start/stop the gateway and jump to its
  Control UI.
- 🤖 **OpenCode** — installs the OpenCode CLI on first Start (npm, with a
  direct arm64 release fallback) and serves it headlessly; the ❯_ button
  opens the terminal.
- 🧭 **Hermes Web UI ★** — downloads nesquena/hermes-webui (MIT) into the
  environment on first Start and serves it at `localhost:8787`; the ⧉
  button opens it in the app.
- ❯_ **Terminal** — a built-in proot shell for the embedded Linux
  environment, right from the dashboard.
- ⚙ **Settings** — switch model provider any time (OpenRouter /
  OpenCode Zen / NVIDIA NIM / Custom endpoint), update keys, and open either
  localhost web UI.

## 🎙 v3.0.0-beta2 — Voice + tool calling + app control

Three big new things in this drop: the AI now **hears you** ("Hey
Dagestan" wake word with always-on STT), **uses tools** (the LLM
can start servers, install skills, run skills), and the chat
shows the action as it happens.

- 🎙 **"Hey Dagestan" wake word** — `services/VoiceService.kt`
  keeps an always-on `SpeechRecognizer` session. When the partial
  or final transcript contains the phrase *"hey dagestan"*, the
  trailing text is auto-submitted to the chat. The AI replies via
  Android `TextToSpeech`. Saying just "Hey Dagestan" makes Dagestan
  reply *"How can I help you?"* and keep listening.
- 🛠 **Tool calling** — `services/ToolRegistry.kt` is the single
  source of truth for LLM-callable tools. The chat sends the
  tools manifest with every request, and the LLM can emit
  `tool_calls` that the chat dispatches:
  - `install_skill(name)`, `list_skills()`, `run_skill(name, args, stdin)`
    plus per-skill wrappers (`skill_git_commit`,
    `skill_explain_stacktrace`, `skill_summarize_url`).
  - `start_server(codex|openclaw|hermes)`,
    `stop_server(...)`, `server_status()`.
- 🧪 **Skills can run now** — `SkillsService.run()` executes an
  installed skill's `run.sh`, captures stdout+stderr, publishes
  `SkillRunStarted` / `SkillRunFinished` on the bus.
- 🪟 **Floating mic pill** — `ui/VoiceOverlay.kt` floats above
  the bottom nav on every tab while listening, showing a pulsing
  mic icon + live partial transcript. Tap × to stop.
- 🛡 **Multi-turn tool loop** — the chat keeps dispatching tool
  calls and feeding the results back as `function_call_output`
  items, up to 8 turns, so a single user prompt can chain
  *install → start → run*.

beta2 uses Android's system `SpeechRecognizer` (cloud on GMS,
on-device on AOSP). beta3 swaps in Vosk for a strict-local
guarantee. Try it: install → grant mic permission → "Hey
Dagestan, install git commit" → the AI installs the skill and
talks back. See `.github/RELEASE_NOTES_v3.0.0-beta2.md`.

## 🛒 v3.0.0-beta1 — Skills marketplace + native chat

First beta of the v3 architecture. The Skills marketplace and a
native chat land in the Compose shell. The frozen-dashboard
invariant from alpha2 is **dropped** in beta1: the Home tab is
now a real Compose screen with three animated server cards
(Codex / OpenClaw / Hermes) and a Start/Stop button per server.

- 🛒 **Skills marketplace (bundled)** — `services/SkillsService.kt`
  reads `assets/marketplace/index.json` and installs a skill by
  copying its folder from `assets/skills/<name>/` to the app's
  external files dir. No network in beta1; a network-backed index
  with version checks is beta2. Bus events:
  `SkillInstalled`, `SkillRemoved`, `SkillUpdateAvailable`.
- 🧩 **3 seed skills ship in the APK** — `explain-stacktrace`,
  `git-commit`, `summarize-url`. Each is a `run.sh` + `skill.json`
  pair (`name`, `version`, `permissions`, `entry`).
- 🖥 **Skills tab (real)** — search box, marketplace list with
  Install buttons, an Installed list with Uninstall buttons,
  animated row press-scale. Selecting install/uninstall hits the
  service and the lists recompose via `StateFlow`.
- 💬 **Native chat** — `ChatScreen` posts to Codex's
  `/v1/responses` with `stream: true` and parses the SSE
  `data:` lines into a rolling list of messages. The user message
  lands immediately; the assistant's reply streams in token-by-
  token. No third-party JSON/SSE libs — the parser is ~30 lines
  of Kotlin using only `HttpURLConnection` + `BufferedReader`.
- 🏠 **Home tab (Compose native)** — three animated server cards
  with breathing status dots, port + URL, FAB-style Start/Stop.
  All animations come from `ui/animation/DagestanAnimations` (no
  magic numbers). Honors `Settings.Global.ANIMATOR_DURATION_SCALE`
  for reduced motion.
- 🧮 **`ServersAdapter`** — thin layer between
  `CodexServerManager` and the Compose shell. Exposes one
  `StateFlow<ServerState>` per server plus start/stop methods.
  The Home tab subscribes to the StateFlows; the manager is never
  touched directly from UI code.
- 🎬 **Animation tokens** — durations (`FAST_MS` 120, `DEFAULT_MS`
  240, `SLOW_MS` 360, `PAGE_MS` 300, `PULSE_MS` 1500), easings,
  spring specs, and concrete `tween*Float/IntSize/IntOffset`
  helpers in one place. `Modifier.pressScale()` and
  `rememberPulseAlpha()` are the two reusable composables.
- 🏗 **DagestanApplication** — touches the `SkillsService`
  singleton at process start.

The legacy `dashboard_screen.xml` and the `MainActivity` legacy
flow are still in the APK as a fallback. Toggle the Compose shell
off via long-press on the splash logo to use the v2.8.1 path.
Try it: install → long-press splash → relaunch → Home (3 server
cards) → Start Codex → Chat tab (stream a message) → Skills tab
(install/uninstall `git-commit`). See
`.github/RELEASE_NOTES_v3.0.0-beta1.md` for the full release notes.

## 🔐 v3.0.0-alpha3 — Vault + Pulse + theming

Two real services and a real theming system ship in alpha3. The
legacy dashboard structure is still frozen; this is a vertical-slice
upgrade of the Compose shell.

- 🔐 **Vault** — `EncryptedSharedPreferences` (AES-256-GCM, key in
  Android Keystore). New `VaultScreen` lists keys, masks values,
  supports copy / lock / delete + an Add FAB. Bus events:
  `VaultLocked`, `VaultUnlocked`, `SecretStored`, `SecretDeleted`.
- 📈 **Pulse** — 1 Hz `StateFlow<Snapshot>` of system CPU, RAM, battery
  (level + °C), and network rx/tx bps. New `PulseScreen` renders a card
  per metric, all live. Auto-start when the shell opens, auto-stop on
  dispose.
- 🎨 **Theming** — 4 palettes (Caucasus / BlackSea / SunsetRidge /
  SnowPeak) × 3 modes (System / Light / Dark). Pickers live on the
  Pulse screen for alpha3; a proper Settings sheet lands in beta1.
  Re-skin is instant.
- 🏗 **DagestanApplication** — first `Application` subclass; owns the
  Vault + Pulse singletons via the process lifecycle.

Try it: install the APK → long-press the splash logo → relaunch →
tap Vault to store a secret, tap Pulse to watch live metrics and try
the palette/mode chips. See
`.github/RELEASE_NOTES_v3.0.0-alpha3.md` for the full release notes.

## 🏗 v3.0.0-alpha2 — Compose shell (opt-in)

The v3 architecture gets its first UI. A Jetpack Compose shell with a
5-tab bottom nav (Home / Chat / Skills / Vault / Pulse) renders the
**legacy `dashboard_screen.xml` unchanged** as the Home tab, so the
frozen-dashboard invariant is preserved by construction.

- 🏠 Home = legacy dashboard, embedded via `AndroidView`. Same buttons,
  same order, same labels.
- 🧭 Bottom nav (Material 3, Caucasus palette). Tabs 2-5 are stubs
  showing the phase each ships in.
- 🚦 Feature flag `DagestanPrefs.useComposeShell`, **off by default**.
  Toggle with a long-press on the splash logo. Compose is the only
  one-shot size cost (~+3 MB).
- ✅ `compileDebugKotlin` verified clean.

Try it: install the APK → long-press the splash logo → relaunch. See
`.github/RELEASE_NOTES_v3.0.0-alpha2.md` for the full release notes.

## 🏔 v3.0.0-alpha1 — "Dagestan OS" foundation (no behavior change)

First preview of the v3 architecture. The user-facing app is identical to
v2.8.1; this release only lands the new event bus and 11 service stubs so
beta1+ can build on top of them without touching the working v2.8.1 wiring.

- 🚌 **DagestanBus** — process-wide event bus in `com.dagestan.mobile.bus`.
- 📐 **BusEvent** — sealed interface with 41 event types (Codex / OpenClaw /
  Hermes / Skills / Vault / Pulse / Device Lab / Sandbox / Build / Voice).
- 🧩 **11 service stubs** under `com.dagestan.mobile.services/`. Each
  publishes a single "alive" event on construction so the bus contract
  has a publisher from day one.
- 📦 `kotlinx-coroutines-android:1.7.3` declared in `app/build.gradle.kts`.
- 🔒 The legacy server dashboard is **frozen**; the new Home tab in alpha2+
  embeds the existing `dashboard_screen.xml` unchanged.

See `.github/RELEASE_NOTES_v3.0.0-alpha1.md` for the full plan and the
locked v3.0 phase schedule (alpha1 → alpha3 → beta1 → beta5 → rc1 → stable).

## 🛠 v2.8.1 — fix: mobile viewport, sidebar features, OpenClaw/OpenCodex/Hermes start failures

The bundled codex-web used to render in a *desktop* layout on the phone
because the WebView spoofed `window.innerWidth = 1280` on every page load —
this hid the SPA's mobile stylesheet and made the dashboard unusable. We
also wired up the missing CLI features (Skills, Settings, Projects,
Automations, Device agent) and fixed three install/start failures that
left the dashboard's start buttons on a permanent red dot.

- 📱 **Mobile-first viewport** — `onPageStarted` no longer overrides
  `innerWidth` / `outerWidth` / `matchMedia`. The bundled codex-web
  now renders in its native phone layout, with the real device width
  flowing through CSS media queries. Composer is padded for safe-area,
  horizontal scroll is locked to viewport.
- 🍔 **Floating sidebar overlay** — a `dagestan-fab` button (bottom-right)
  opens a side panel with the missing CLI features that the bare
  "Let's build" page used to hide:
  * **Skills** — runs `codex --help` so you can see what skills ship
  * **Settings** — opens the native Settings overlay
  * **Projects** — lists the on-device workspace
  * **Automations** — shows installed codex version
  * **Device agent** — copies `dagestan-agent.sh` to the clipboard
    so you can paste it on any server and pair it with the app
  * **Terminal** — opens the native terminal overlay
  * **OpenClaw / OpenCodex / Hermes** — quick-launch each server's UI
  Items dispatch either `route:URL` (open in WebView) or
  `droid:command` (run via the existing `DagestanDroid` bridge and
  show the output) or `native:settings` (open the native overlay via
  the new `DagestanNative` JS interface).
- 🦀 **OpenCodex install hardened** — the post-install hook was trying
  to download `@oven/bun-linux-aarch64-musl` from the optional `@oven`
  registry, which fails inside our prefix and produced the
  *"Failed to find package @oven/bun-linux-aarch64-musl"* trace in
  Terminal. The npm install now runs with `--ignore-scripts
  --no-save --no-package-lock` and `OPENCODEX_BUN_PATH` points the
  runtime at the pre-bundled Bun binary. Same flag set is also
  applied to the per-package `npm install` we run before starting
  the proxy.
- 🕸️ **OpenClaw npm install — no more `ENOTEMPTY`** — the global
  `npm install openclaw@latest` was racing with itself and emitting
  `npm warn cleanup … ENOTEMPTY: directory not empty, rmdir` for
  `zod`, `ajv`, `@modelcontextprotocol`, `@bufbuild/protobuf`, …
  Adding `--no-save --no-package-lock --no-audit --no-fund` keeps
  the install single-writer and never re-touches a package dir
  another install just populated.
- 🧪 **Hermes root cause** — `nesquena/hermes-webui` imports
  `hermes_cli.*` (the actual Hermes agent) at startup, but we only
  extracted the WebUI tarball. The new `ensureHermesAgent()` installs
  `hermes-agent` from PyPI (`pip install hermes-agent`) before the
  first start, and again on every subsequent start (idempotent —
  exits 0 immediately if the import probe succeeds). The
  `Traceback ... /opt/hermes-.../api/*.py` failure is now
  pre-empted.
- 🧰 **New `NativeUiBridge`** — exposed as `window.DagestanNative`
  with `openSettings()` / `openTerminal()` / `copyDeviceAgent()` /
  `copyText(...)` so the sidebar overlay can drive the native
  Settings/Terminal screens without leaving the WebView. `MainActivity`
  made the previously-private `showSettings()` and `showTerminal()`
  `internal` to make the bridge callable.

The whole patch is a pure UI/runtime fix; the engine internals
(OpenClaw gateway, Codex CLI, Termux bootstrap) are unchanged.

## 📱 Get the APK (recommended way — GitHub Actions builds it for you)

1. **Save/push this repo to GitHub** (Freebuff's Changes panel handles commit &
   push).
2. On GitHub open **Actions → Build Dagestan APK**. It runs automatically when
   `dagestan-android/**` changes — or trigger it manually via **Run workflow**.
3. After ~5–8 minutes grab your APK from either:
   - **Releases** → latest `Dagestan vNNN` release → `dagestan.apk`, or
   - the run page → **Artifacts → dagestan-apk**.
4. Copy it to your phone, tap it, allow *"Install unknown apps"* once.
   Done — **Dagestan** appears in your launcher.

> Updating later? CI signs each build with an ephemeral debug key. If Android
> says *"App not installed"* when updating, uninstall the previous Dagestan
> first (your OpenClaw/Codex data inside app storage goes with it).

## 🚀 First launch

- Grants battery-optimization exemption, extracts the embedded Linux
  environment (~500 MB), then installs Node.js + Codex + OpenClaw over the
  network. Subsequent launches are fast and work offline after setup.
- Pick your **model provider** when prompted: OpenCode Zen / OpenRouter /
  NVIDIA NIM all work with **free keys** (OpenAI also supported). Keys stay on
  your device; a browser-login fallback exists for OpenAI.
- Requires an ARM64 phone on Android 7.0+.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `503 … zen-proxy … Endpoint is unavailable` in chat | The free OpenCode Zen endpoint was briefly unreachable — pick another free model (e.g. `big-pickle`) or switch provider in **⚙ Settings** and resend |
| OpenCode / Hermes Start does nothing the first time | They download on first Start (~1–2 min) — watch progress in the **❯_ Terminal** |

## 🛠 Build locally instead

JDK 17 + Android SDK (API 35) required:

```bash
bash android/scripts/download-bootstrap.sh aarch64
cd android
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 📄 License & attribution

Upstream AnyClaw is MIT. Dagestan keeps that license and credits its stack:
OpenClaw (Peter Steinberger & community), OpenAI Codex CLI, Claw Code /
OpenClaude, AidanPark's Android patches, and the Termux bootstrap. See
[`android/README.md`](android/README.md).
