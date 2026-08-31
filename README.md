<div align="center">

<img src="public/logo.svg" width="96" height="96" alt="Dagestan" />

# 🏔 Dagestan

**Every powerful free AI model — in one beautiful chat, on your phone.**

[![Release](https://img.shields.io/github/v/release/LorEnzzhhz/dagestan?label=Latest&style=for-the-badge&color=22d3ee)](https://github.com/LorEnzzhhz/dagestan/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)
[![CI: Build APK](https://img.shields.io/github/actions/workflow/status/LorEnzzhhz/dagestan/build-dagestan.yml?style=for-the-badge&label=APK+Build)](https://github.com/LorEnzzhhz/dagestan/actions)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?style=for-the-badge&logo=vite)](https://vite.dev)
[![Tailwind v4](https://img.shields.io/badge/Tailwind-4-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)
[![Android 7+](https://img.shields.io/badge/Android-7%2B-3ddc84?style=for-the-badge&logo=android)](https://developer.android.com)

[**📥 Download APK**](https://github.com/LorEnzzhhz/dagestan/releases/latest) · [**📱 Features**](#-features) · [**🛠 Install web dev**](#-run-the-web-app) · [**🤖 Build the APK**](#-build-the-android-apk)

</div>

---

## What is Dagestan?

Dagestan is a **self-hosted AI chat shell** for Android and the web. It bundles
four real servers — **Codex CLI**, **OpenClaw Gateway**, **OpenCodex proxy**,
and **Hermes WebUI** — directly on your phone, and ships a React 19 / Vite
front-end that talks to all of them.

**No paywall. No ads. No usage limits. API keys stay in your browser's
localStorage and never touch a server.**

| | |
|---|---|
| 🆓 **Free models only** | 18+ curated free models across OpenCode Zen, OpenRouter, NVIDIA NIM, DeepSeek, and more. |
| 📱 **Real Android app** | One-click APK install. Foreground service keeps servers alive while the screen is off. |
| 🖥 **Real servers, on-device** | The APK boots a full Termux + Node.js environment via proot — no remote relay. |
| 🔌 **Bring your own key** | Stored locally, never logged. Use any OpenAI-compatible provider via the "Custom" tab. |
| 🧠 **Smart Model Picker** | Auto-categorises models by profession (coding, writing, math, reasoning, creative, translation). |
| 🤖 **Multi-model voting** | Send the same prompt to 3 models, compare side-by-side, pick the best. |
| 📲 **Device agent** | The AI can run shell commands in a sandboxed root-Linux container on your phone and preview websites in Chrome. |
| 🪶 **~91 MB APK** | Self-contained — no Play Services, no Google account, no telemetry. |

---

## 🖥 The four on-device servers

The Android app boots a full **Termux + proot-distro** environment and starts
these four servers. Each has its own dedicated port and dashboard inside the
shell:

| Server | Port | What it does |
|---|---:|---|
| 🤖 **Codex CLI** (`codex-web-local`) | `18923` | AI coding shell + web dashboard — streams model output, edits files, runs commands. |
| 🕸 **OpenClaw Gateway** | `18789` | WebSocket relay for device control. Drives 14 native commands (camera, sensors, screen, haptics, …). |
| 🌐 **OpenCodex proxy** | `10100` | Universal LLM API bridge — translates the Responses API to any OpenAI-compatible provider. |
| 🧭 **Hermes WebUI** | `8787` | Self-hosted Hermes-agent web UI bundled into the container, ready at `localhost:8787`. |

All four are **bundled inside the APK** (no network install required on first
launch) and start via the on-screen "Start" buttons. They are also exposed to
the Vite dashboard through `window.DagestanDroid.run()`.

---

## ✨ Features

<details open>
<summary><strong>💬 Chat</strong></summary>

- ♾ **Unlimited context** — no message quotas, no paywall
- 🔍 **Live web search** (Exa) — target YouTube, GitHub, TikTok, news, scholar
- ∑ **Math solver** — step-by-step solutions with KaTeX
- 💻 **Code runner** — sandboxed Python + JS execution
- 🌍 **Universal translator** — auto-detect language, translate with context
- 🧠 **Deep reasoning** — chain-of-thought mode
- 📥 **Import** ChatGPT / Claude export files
- 📤 **Export** any chat to Markdown
- 😀 **Emoji reactions** — 8 reactions on any message
- 🎤 **Voice input** (Web Speech API)
</details>

<details>
<summary><strong>🧰 Productivity</strong></summary>

- 📝 **System prompts** — 6 templates per chat + custom editor
- 🗳 **Multi-model voting** — 3 models side-by-side, you pick the best
- 💰 **Cost tracker** — shows $0.00 for free models, real cost for paid
- 🔢 **Token counter** — per message
- 📌 **Pin / rename / search** chats
</details>

<details>
<summary><strong>🎨 Personalisation</strong></summary>

- 🌓 Dark / light theme
- 🎨 8 accent colours (emerald · sky · violet · rose · amber · cyan · indigo · teal)
- 📐 Compact mode toggle
- 🔔 Per-category notification preferences
</details>

<details>
<summary><strong>🏔 Dagestan Shell</strong> — the Android side</summary>

- 📊 **Process Monitor** — live CPU / memory bars + per-service status
- 🔮 **Orb HUD** — floating AI orb, tap for quick actions
- 🔨 **App Forge** — describe what you want → AI builds it → live preview in a WebView
- 🖥 **Proot Terminal** — full root Linux shell with syntax highlighting, history, autocomplete
- 📲 **Device agent** — AI runs `bash -lc` inside a Debian container via `proot-distro`
</details>

---

## 🚀 Run the web app

```bash
# 1. Clone
git clone https://github.com/LorEnzzhhz/dagestan.git
cd dagestan

# 2. Install (npm 10+ or bun)
npm ci --include=optional
# or: bun install --frozen-lockfile

# 3. Run
npm run dev          # http://localhost:5173
```

Add API keys in **Settings → Providers** or set them in `.env.local`:

| Key | Provider | Cost | Where to get it |
|---|---|---|---|
| `OPENCODE_ZEN_API_KEY` | OpenCode Zen | **100% free** | [opencode.ai/auth](https://opencode.ai/auth) |
| `OPENROUTER_API_KEY` | OpenRouter | free tier | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `NVIDIA_API_KEY` | NVIDIA NIM | free credits | [build.nvidia.com](https://build.nvidia.com) |
| `EXA_API_KEY` | Live web search | free tier | [exa.ai](https://exa.ai) |

---

## 📦 Build the Android APK

The APK is built automatically by GitHub Actions on every push to `main`. To
build it yourself:

```bash
# 1. Build the Vite front-end and bundle it into the Android assets
npm run build
cp -r dist/* dagestan-android/android/app/src/main/assets/web/

# 2. Build the APK
cd dagestan-android/android
./gradlew assembleDebug

# 3. Install on a connected device
adb install app/build/outputs/apk/debug/app-debug.apk
```

The first time the app launches it extracts a 30 MB Termux bootstrap and
boots the proot environment — this takes 30-60 s and only happens once.

---

## 🗂 Project layout

```
.
├── src/                      # React 19 + Vite front-end
│   ├── pages/                # Landing, Chat, Dashboard, Forge, Skills, Settings
│   ├── components/
│   │   ├── chat/             # SmartModelPicker, MessageBubble, ChatSidebar
│   │   ├── features/         # ProviderMonitor, MultiModelVoting, CostTracker, …
│   │   ├── shell/            # OrbHUD, AppForge, TerminalEmulator
│   │   └── ui/               # shadcn/ui primitives
│   ├── hooks/                # use-skills, use-theme, use-chat-stream, use-auth
│   ├── lib/                  # db (localStorage), smart-models, ai-client, models
│   └── stores/               # zustand stores + tests
├── public/                   # PWA assets (icons, manifest, sw, agent script)
├── dagestan-android/         # Native Android app (Kotlin + Termux)
│   ├── app/src/main/assets/  # Bundled web + Termux bootstrap + bundled packages
│   └── scripts/              # download-bootstrap.sh, bundle-packages.sh
└── .github/workflows/        # CI: lint, type-check, test, build APK, release
```

---

## 🔒 Privacy

- 🔑 **API keys** are stored in your browser's `localStorage` only. The web app
  talks to model providers directly — there is no Dagestan server in the loop.
- 📊 **No telemetry.** The Vite front-end does not phone home.
- 🛡 **On-device agent** runs only on hardware you register. Tokens are unique
  per device and can be revoked from **Settings → Device agent**.
- 📤 **Data export** is one click in **Settings → Advanced → Export JSON**.

---

## 🤝 Contributing

```bash
git checkout -b feat/amazing-thing
git commit -m "feat: add amazing thing"
git push origin feat/amazing-thing
# → open a PR
```

The CI runs `npm run lint`, `tsc -b`, `vitest run`, then the full Gradle build.
All four must pass before merge.

---

## 📝 License

[MIT](LICENSE) © Lorenzo Meme ([@LorEnzzhhz](https://github.com/LorEnzzhhz))

<div align="center">

**[📥 Download Latest APK](https://github.com/LorEnzzhhz/dagestan/releases/latest)** · **[🐛 Report Bug](https://github.com/LorEnzzhhz/dagestan/issues)** · **[✨ Request Feature](https://github.com/LorEnzzhhz/dagestan/issues)**

</div>
