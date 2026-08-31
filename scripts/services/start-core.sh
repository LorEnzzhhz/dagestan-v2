#!/usr/bin/env bash
# Bring up the core dev stack: vite (5173) + local-models (18927).
# Idempotent — running services are detected and left alone.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="${LOGDIR:-/tmp/dagestan-services}"
mkdir -p "$LOGDIR"
cd "$ROOT" || exit 1

is_up() {
  curl -fsS --max-time 1 "http://127.0.0.1:$1/healthz" >/dev/null 2>&1
}

start_bg() {
  local name=$1 cmd=$2 logfile=$3
  local pidfile="$LOGDIR/$name.pid"
  # If a pidfile exists and the pid is alive AND the service answers, skip.
  if [ -e "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "$name already running (PID=$pid)"
      return
    fi
    rm -f "$pidfile"
  fi
  setsid nohup bash -c "$cmd" </dev/null >"$logfile" 2>&1 &
  local pid=$!
  echo $pid > "$pidfile"
  disown 2>/dev/null || true
  echo "started $name (PID=$pid, log=$logfile)"
}

# local-models
if is_up 18927; then
  echo "local-models already online on :18927"
else
  start_bg local-models "node scripts/local-models/local-models-server.mjs" /tmp/lms.log
fi

# vite — call the direct entry point, not the .bin wrapper, which can crash
# with a native assertion on aarch64 when forked from setsid.
if curl -fsS --max-time 1 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "vite already online on :5173"
else
  start_bg vite "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173" /tmp/vite.log
fi

echo "core stack ready — give it 5s, then check 127.0.0.1:5173 / 18927"
