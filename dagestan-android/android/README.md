# Dagestan (Android)

Android APK that embeds a Termux-style Linux bootstrap environment, installs
OpenClaw + Codex on first run, and presents the Dagestan UI inside a WebView.

## Project structure

```
android/
├── app/src/main/
│   ├── AndroidManifest.xml
│   ├── assets/
│   │   ├── proxy.js              # CONNECT proxy (DNS/TLS bridge)
│   │   ├── bionic-compat.js      # Android platform shim
│   │   └── setup-codex.sh        # first-run installer script
│   └── java/com/dagestan/mobile/
│       ├── BootstrapInstaller.kt  # Linux environment setup
│       ├── CodexForegroundService.kt # background persistence
│       ├── CodexServerManager.kt  # install, auth, proxy, gateway, server
│       └── MainActivity.kt        # WebView + setup orchestration
├── scripts/
│   ├── download-bootstrap.sh     # Fetch Termux bootstrap (run at build time)
│   └── build-server-bundle.sh    # optional: bundle prebuilt frontend
```

App identity:

| | |
|---|---|
| App name | Dagestan |
| Package id | `com.dagestan.mobile` |
| Data dir | `/data/user/0/com.dagestan.mobile/files/usr` |

## Build (CI)

The repository's GitHub Actions workflow (`.github/workflows/build-dagestan.yml`)
does everything: downloads the Termux bootstrap, installs JDK 17 + Gradle,
runs `gradle assembleDebug`, signs with the CI debug keystore and publishes
the APK as an artifact / GitHub Release.

## Bundled agent CLIs

Besides the four servers (Codex Web UI, OpenClaw, OpenCodex, Hermes), the APK
bundles two native agent CLIs via `scripts/bundle-packages.sh`:

| Asset | Contents | Runs in |
|---|---|---|
| `packages/claude-code.tgz` | Claude Code linux-arm64 binary (`@anthropic-ai/claude-code`) | proot Debian container (glibc) |
| `packages/cursor-agent.tgz` | Cursor `agent` CLI, best-effort from Cursor's CDN | proot Debian container (glibc) |

On first launch `CodexServerManager.extractBundledAgents()` stages them under
`$PREFIX/opt/claude-code` and `$PREFIX/opt/cursor` (Termux is bionic and cannot
execute glibc binaries directly) and installs `bin/claude` / `bin/cursor-agent`
wrappers that jump into the container. `public/dagestan-agent.sh` copies them
into the proot Debian container (`/opt/...` + `/usr/local/bin` symlinks) the
first time the device agent runs.

## Build locally

Requirements: JDK 17, Android SDK (API 35), Gradle 8.11.1.

```bash
bash android/scripts/download-bootstrap.sh
cd android
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Attribution

Dagestan is a rebrand of the open-source **AnyClaw** project
(OpenClawAndroid/openclaw-android-assistant, MIT), which builds on OpenClaw,
OpenAI Codex CLI, AidanPark's Android patches and the Termux bootstrap.
Embedded engine names (OpenClaw, Codex) are kept intact — they are functional
npm package names, not branding.
