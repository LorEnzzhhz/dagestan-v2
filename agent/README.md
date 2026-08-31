# Dagestan device agent

Give the AI a **real, full-root Linux environment** on your Android phone (or
any Linux machine), so it can install tools, run commands, and even **serve
websites to your phone's browser** — silently.

## What you get

| Capability | How |
|---|---|
| Full root Debian **or** Alpine container | `proot-distro` (rooted *container*, no real Android rooting needed) |
| Headless Chromium pre-installed | `chromium` package inside the container |
| Any tools on demand | Model emits `run` blocks → executed as `/bin/bash -lc …` as root |
| **Localhost web preview** | Container shares the device network — `python3 -m http.server 8080` inside it is reachable at `http://localhost:8080` in Chrome |
| 🧭 **Bundled Hermes WebUI** | [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui) auto-provisioned at `/opt/hermes-webui` — full web front-end for Hermes Agent, no manual clone |
| Silent execution | Results collapse into a small chip in chat |
| Long sessions | Model keeps working until you press stop |

## Bundled Hermes WebUI

First-run provisioning drops a clean copy of **Hermes WebUI** into the container
at `/opt/hermes-webui` — a self-hosted, dark-themed web front-end for
[Hermes Agent](https://github.com/nesquena/hermes-webui) (sessions, workspace
file browser, profiles, voice input, tool-call cards). It's fetched straight
from upstream on provision day, so it's current; the upstream `.git` folder is
stripped so no repository metadata ships inside your device.

Start it from chat — just ask:

> "start hermes webui"

which runs `python3 /opt/hermes-webui/server.py` (or `/opt/hermes-webui/start.sh`
for the full bootstrap, which can also install the Hermes Agent engine itself).
Like anything served inside the container, it's reachable in your phone's
browser at **http://localhost:8787**.

- Server deps (`pyyaml`, `cryptography`) are pre-installed during provisioning.
- Re-running the agent script never re-downloads if `/opt/hermes-webui/server.py`
  already exists; delete that folder to force a refresh.
- If provisioning ran offline, ask the AI to retry later — it will re-attempt.

> Hermes WebUI is © its authors, MIT licensed — we bundle it unmodified apart
> from removing `.git`. Nothing is patched or forked.

## Setup (Android / Termux)

The runner ships inside the app and is served straight from your deployment at
`/dagestan-agent.sh` (source: [`public/dagestan-agent.sh`](../public/dagestan-agent.sh)).

```bash
pkg update -y && pkg install proot-distro tar curl jq -y
curl -O $SITE_URL/dagestan-agent.sh
chmod +x dagestan-agent.sh

export DAGESTAN_SITE="https://<your-app-url>"   # your deployed Dagestan URL
export DAGESTAN_TOKEN="<token from Skills → Device agent>"

./dagestan-agent.sh debian     # or alpine
```

First run provisions the container (~2–5 min). Then open **Chat** — the ⚡
badge shows the device online. Try:

> "Build me a small portfolio website on my device and serve it on port 8080"

The model writes the files, starts the server inside the container, and you
open **http://localhost:8080** in Chrome. Same device, real files, real server.

## Setup (desktop Linux)

```bash
sudo apt install curl jq
export DAGESTAN_SITE=... DAGESTAN_TOKEN=...
./dagestan-agent.sh debian
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `invalid token` | Token was re-created — make a new one in Skills → Device agent |
| Badge stays grey | Check `DAGESTAN_SITE` matches your deployed app URL |
| `proot-distro: command not found` | Termux: `pkg install proot-distro` |
| Chromium missing | Ask: *"install headless chromium on my device"* |
| Command timed out | Commands cap at ~3 min; split big jobs into steps |
| localhost not loading | Server must keep running: end commands with `&` or `nohup … &` |

## Safety notes

- Commands run **only** in containers/devices you register, under your token.
- No jailbreak/"do anything" mode: providers cut off keys that try to bypass
  their usage policies.
- Dagestan links only to legal, public-domain or ad-supported media — it
  doesn't index pirated streams.
