#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# dagestan-agent.sh — root-Linux command runner for Dagestan
#
# Runs on Termux (Android) or any Linux machine. Boots a FULL ROOT container
# (Debian or Alpine) via proot-distro, installs tooling + headless Chromium,
# then polls Dagestan for shell commands from the AI and executes them
# silently via /bin/bash -lc inside the container.
#
# The container shares the device network stack, so anything the AI serves on
# a port (e.g. `python3 -m http.server 8080`) is reachable in your phone's
# browser at http://localhost:8080 — perfect for previewing websites it builds.
#
# Usage:
#   pkg update -y && pkg install proot-distro tar curl jq -y   # Termux
#   curl -O $SITE_URL/dagestan-agent.sh
#   chmod +x dagestan-agent.sh
#   export DAGESTAN_SITE="https://<your-app-url>"
#   export DAGESTAN_TOKEN="<token from Skills → Device agent>"
#   ./dagestan-agent.sh debian    # or: ./dagestan-agent.sh alpine
# ---------------------------------------------------------------------------
set -u

# DAGESTAN_SITE/DAGESTAN_TOKEN are canonical; legacy PRISM_* names still work.
SITE_URL="${DAGESTAN_SITE:-${PRISM_SITE:-}}"
TOKEN="${DAGESTAN_TOKEN:-${PRISM_TOKEN:-}}"
[ -n "$SITE_URL" ] || { printf '\033[31m[dagestan] ERROR:\033[0m Set DAGESTAN_SITE to your app URL\n' >&2; exit 1; }
[ -n "$TOKEN" ] || { printf '\033[31m[dagestan] ERROR:\033[0m Set DAGESTAN_TOKEN to the token shown in Skills → Device agent\n' >&2; exit 1; }
DISTRO="${1:-debian}"

log() { printf '\033[36m[dagestan]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[dagestan] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required (Termux: pkg install curl)"
command -v jq >/dev/null 2>&1 || die "jq is required (Termux: pkg install jq)"

# --- container --------------------------------------------------------------
# NOTE: there is no `proot-distro installed` subcommand — the reliable way to
# detect an installed distro is checking its rootfs directory. Older versions
# of this script silently mis-detected Debian here.
ensure_distro() {
  local d="$1" attempt prefix rootfs
  prefix="$(dirname "$(dirname "$(command -v proot-distro)")")" # …/usr/bin → …/usr
  rootfs="$prefix/var/lib/proot-distro/installed-rootfs/$d"
  [ -d "$rootfs" ] && return 0

  for attempt in 1 2 3; do
    log "installing $d container (attempt $attempt/3)…"
    if proot-distro install "$d"; then return 0; fi
    log "install failed — removing any partial download, retrying…"
    proot-distro reset "$d" >/dev/null 2>&1 \
      || proot-distro remove "$d" >/dev/null 2>&1 \
      || true
    sleep 2
  done
  die "could not install the $d container. Check free storage & network, then re-run this script."
}

# --fix-low-ports only exists on newer proot-distro; detect instead of assume.
PROOT_FIX_LOW_PORTS=""
if proot-distro login --help 2>&1 | grep -q -- "--fix-low-ports"; then
  PROOT_FIX_LOW_PORTS="--fix-low-ports"
fi

if command -v proot-distro >/dev/null 2>&1; then
  log "ensuring $DISTRO container (full root filesystem)…"
  ensure_distro "$DISTRO"
  run_in_root() {
    # --shared-tmp shares sockets; networking is shared with the device so
    # localhost:PORT works in Chrome.
    proot-distro login "$DISTRO" $PROOT_FIX_LOW_PORTS --shared-tmp -- /bin/bash -lc "$1"
  }
else
  log "no proot-distro — running commands directly on this machine"
  run_in_root() { /bin/bash -lc "$1"; }
fi

# --- one-time tooling inside the container ----------------------------------
log "first-run provisioning: python, node, headless chromium…"
run_in_root '
  export DEBIAN_FRONTEND=noninteractive
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq -o Acquire::Retries=3
    apt-get install -yqq -o Acquire::Retries=3 python3 python3-pip nodejs npm curl jq git ca-certificates \
      chromium fonts-liberation >/dev/null 2>&1 || true
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache python3 py3-pip nodejs npm curl jq git \
      chromium nss freetype harfbuzz ttf-freefont >/dev/null 2>&1 || true
  fi
' || log "provisioning had warnings — continuing anyway"

# --- bundled Hermes WebUI ----------------------------------------------------
# Ships nesquena/hermes-webui (MIT) inside the container at /opt/hermes-webui,
# ready to run with the already-provisioned python3 — no user-facing install
# step. Unlike some distributions we strip the upstream .git folder after
# cloning so no repository metadata leaks into the container.
log "bundling Hermes WebUI → /opt/hermes-webui…"
run_in_root '
  if [ ! -x /opt/hermes-webui/server.py ]; then
    rm -rf /opt/hermes-webui
    git clone --depth 1 --quiet https://github.com/nesquena/hermes-webui.git \
      /opt/hermes-webui || { rm -rf /opt/hermes-webui; exit 1; }
    rm -rf /opt/hermes-webui/.git  # clean copy — no upstream repo metadata ships
    # WebUI server deps (PyYAML + passkey crypto); tolerate PEP-668 managed envs
    pip3 install --quiet pyyaml cryptography 2>/dev/null \
      || pip3 install --quiet --break-system-packages pyyaml cryptography 2>/dev/null \
      || true
  fi
' && log "Hermes WebUI bundled — say \"start hermes webui\" in chat, opens at http://localhost:8788" \
  || log "hermes-webui bundle skipped this run — ask the AI to retry when online"

CHROMIUM_BIN="$(run_in_root 'command -v chromium || command -v chromium-browser || true' | tr -d '\r')"
[ -n "$CHROMIUM_BIN" ] && log "headless Chromium available: $CHROMIUM_BIN" \
                        || log "Chromium not detected yet — the AI can install it on demand"

DEVICE="$(uname -o 2>/dev/null || uname -s) · $(uname -m)"

poll_once() {
  curl -sS -m 30 -X POST "$SITE_URL/api/agent/poll" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"device\":\"$DEVICE\",\"distro\":\"$DISTRO\"}"
}

report() { # id exit_code output_file
  local out
  out=$(jq -Rs . <"$3")
  curl -sS -m 60 -X POST "$SITE_URL/api/agent/result" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"id\":\"$1\",\"exitCode\":$2,\"output\":$out}" \
    >/dev/null
}

log "agent online ($DISTRO, root). Waiting for commands…"
while true; do
  RESP="$(poll_once)" || { sleep 5; continue; }

  ID="$(printf '%s' "$RESP" | jq -r '.command.id // empty')"
  [ -z "$ID" ] && { sleep 3; continue; }

  CMD="$(printf '%s' "$RESP" | jq -r '.command.command')"
  log "executing silently (${#CMD} chars): ${CMD:0:80}…"

  OUT_FILE="$(mktemp)"
  run_in_root "$CMD" >"$OUT_FILE" 2>&1
  RC=$?
  report "$ID" "$RC" "$OUT_FILE"
  rm -f "$OUT_FILE"
  log "done (exit $RC)"
done
