# Dagestan v2.8.1

> Mobile viewport, sidebar features, OpenClaw/OpenCodex/Hermes start fixes.

This release fixes the three "red dot" server failures users were seeing on the
dashboard (OpenClaw, OpenCodex, Hermes), makes codex-web render at a real
**phone-standard** viewport instead of a spoofed 1280-pixel desktop one, and
surfaces the CLI features the bare web build was hiding (Skills, Settings,
Projects, Automations, Device agent) through a mobile sidebar overlay.

- 📱 **Mobile-first viewport** — `MainActivity.onPageStarted` no longer overrides
  `innerWidth` / `outerWidth` / `matchMedia`. The bundled codex-web now
  renders in its native phone layout, with the real device width flowing
  through CSS media queries. Composer is padded for safe-area, horizontal
  scroll is locked to viewport.
- 🍔 **Floating sidebar overlay** — A `dagestan-fab` button (bottom-right)
  opens a side panel with the CLI features the bare "Let's build" page used
  to hide:
  - **Skills** — runs `codex --help` so you can see what skills ship
  - **Settings** — opens the native Settings overlay
  - **Projects** — lists the on-device workspace
  - **Automations** — shows installed codex version
  - **Device agent** — copies `dagestan-agent.sh` to the clipboard so you
    can paste it on any server and pair it with the app
  - **Terminal** — opens the native terminal overlay
  - **OpenClaw / OpenCodex / Hermes** — quick-launch each server's UI
  Items dispatch either `route:URL` (open in WebView) or `droid:<cmd>` (run
  via the existing `DagestanDroid` bridge) or `native:<which>` (open the
  native overlay via the new `DagestanNative` JS interface).
- 🦀 **OpenCodex install hardened** — the post-install hook was trying to
  download `@oven/bun-linux-aarch64-musl` from the optional `@oven`
  registry, which fails inside our prefix and produced the
  *"Failed to find package @oven/bun-linux-aarch64-musl"* trace in Terminal.
  The npm install now runs with `--ignore-scripts --no-save --no-package-lock`
  and `OPENCODEX_BUN_PATH` points the runtime at the pre-bundled Bun
  binary. Same flag set is also applied to the per-package `npm install`
  we run before starting the proxy.
- 🕸️ **OpenClaw npm install — no more `ENOTEMPTY`** — the global
  `npm install openclaw@latest` was racing with itself and emitting
  `npm warn cleanup … ENOTEMPTY: directory not empty, rmdir` for `zod`,
  `ajv`, `@modelcontextprotocol`, `@bufbuild/protobuf`, … Adding
  `--no-save --no-package-lock --no-audit --no-fund` keeps the install
  single-writer and never re-touches a package dir another install just
  populated.
- 🧪 **Hermes root cause** — `nesquena/hermes-webui` imports `hermes_cli.*`
  (the actual Hermes agent) at startup, but we only extracted the WebUI
  tarball. The new `ensureHermesAgent()` installs `hermes-agent` from PyPI
  (`pip install hermes-agent`) before the first start, and again on every
  subsequent start (idempotent — exits 0 immediately if the import probe
  succeeds). The `Traceback ... /opt/hermes-.../api/*.py` failure is now
  pre-empted.
- 🧰 **New `NativeUiBridge`** — exposed as `window.DagestanNative` with
  `openSettings()` / `openTerminal()` / `copyDeviceAgent()` / `copyText(...)`
  so the sidebar overlay can drive the native Settings/Terminal screens
  without leaving the WebView. `MainActivity` made the previously-private
  `showSettings()` and `showTerminal()` `internal` to make the bridge
  callable.

## Install

```bash
# 1. download the APK from this release
adb install -r dagestan-v2.8.1.apk

# 2. or copy it to your phone and tap it
```

## Verify

1. Open **Dagestan** — the welcome page should render at full phone width.
2. Tap the floating hamburger (bottom-right) — the sidebar should slide
   in with **Skills**, **Settings**, **Projects**, **Automations**,
   **Device agent**, **Terminal**, **OpenClaw**, **OpenCodex**, **Hermes**.
3. Tap **Start** on each of the 4 servers in turn — they should all turn
   green within ~30 s.
4. Tap **Device agent** in the sidebar — a toast confirms the agent
   installer was copied to the clipboard.

## Compatibility

- No DB migration, no schema change, no data loss.
- If you already had an older Dagestan installed and Android says
  *"App not installed"* on update, uninstall first (your on-device
  `~/.codex` workspace goes with it).

## Files changed

```
README.md                                                                |  63 ++++++
android/app/build.gradle.kts                                              |   4 +-
android/app/src/main/java/com/dagestan/mobile/CodexServerManager.kt       |  55 +++++-
android/app/src/main/java/com/dagestan/mobile/MainActivity.kt            | 220 +++++++++++++++++----
android/app/src/main/java/com/dagestan/mobile/NativeUiBridge.kt (new)    |  84 ++++++
```

`versionCode = 29`, `versionName = "2.8.1"`.
