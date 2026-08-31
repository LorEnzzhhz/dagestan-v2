#!/usr/bin/env bash
# Bring up the real upstream opencodex proxy (when available) on the
# default port. This script is opportunistic: it tries the vendored
# opencodex/ tree under the repo root, and gracefully falls back to a
# note when the bun runtime can't load it (the upstream is Bun-native
# and has known ESM bugs in some versions of @bufbuild/protobuf).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="${LOGDIR:-/tmp/dagestan-services}"
PORT="${PORT:-10101}"
LOG="$LOGDIR/real-ocx.log"
PIDFILE="$LOGDIR/real-ocx.pid"
mkdir -p "$LOGDIR"

# Stop any previous instance
if [ -e "$PIDFILE" ]; then
  old=$(cat "$PIDFILE" 2>/dev/null)
  [ -n "$old" ] && kill "$old" 2>/dev/null
fi
pkill -f "ocx.mjs start" 2>/dev/null
pkill -f "opencodex-real/src/cli/index.ts start" 2>/dev/null
sleep 1

# If a real opencodex is already listening, we're done. The real
# upstream /healthz returns JSON (Content-Type: application/json); the
# stub returns HTML. Use the content-type to distinguish.
if curl -fsS --max-time 1 -o /dev/null -w "%{content_type}" "http://127.0.0.1:$PORT/healthz" 2>/dev/null | grep -qi "application/json"; then
  echo "real opencodex already on :$PORT — leaving it"
  exit 0
fi

# Try the vendored tree at <repo>/opencodex/
OCX_DIR="$ROOT/opencodex"
if [ ! -d "$OCX_DIR/src/cli" ]; then
  echo "no vendored opencodex at $OCX_DIR/src/cli — skipping real launch"
  exit 0
fi

# Locate a bun runtime (required by upstream).
BUN_BIN="$(command -v bun || true)"
if [ -z "$BUN_BIN" ]; then
  echo "bun runtime not found on PATH — install with: npm i -g bun"
  echo "real opencodex not launched; stub fallback will be used by start-all.sh"
  exit 0
fi

# Pick a usable entry. The upstream ships src/cli/index.ts; we wrap it
# in a tiny launcher so the start script can run it via `bun run`.
ENTRY="$OCX_DIR/src/cli/index.ts"
if [ ! -f "$ENTRY" ]; then
  echo "opencodex entry not found at $ENTRY"
  exit 0
fi

# Push OPENROUTER_API_KEY through if we have a secrets.local.json with
# it. Operators can also set it in the environment directly.
if [ -z "${OPENROUTER_API_KEY:-}" ] && [ -f "$ROOT/secrets.local.json" ]; then
  export OPENROUTER_API_KEY=$(python3 -c "import json; d=json.load(open('$ROOT/secrets.local.json')); k=d.get('providers',{}).get('openrouter',[]); print(k[0]['key'] if k else '')" 2>/dev/null || echo "")
fi

# Sanity-check the install before trying to launch. Bun 1.3/1.4 has
# a known ESM cache bug with @bufbuild/protobuf — it cannot resolve
# `protoInt64` from the virtual `l2s` path — so on most installs the
# CLI explodes with a SyntaxError on the first import. The fastest
# way to detect that is to look for the missing transitive dep.
if [ ! -f "$OCX_DIR/node_modules/@bufbuild/protobuf/package.json" ]; then
  echo "opencodex install looks incomplete (no @bufbuild/protobuf/package.json)"
  echo "  try: cd $OCX_DIR && rm -rf node_modules && bun install"
  echo "  stub fallback (scripts/services/opencodex.cjs.src) will be used"
  exit 0
fi

# Launch fully detached
cd "$OCX_DIR" || exit 1
nohup setsid "$BUN_BIN" run "$ENTRY" start --port "$PORT" </dev/null >"$LOG" 2>&1 &
echo $! > "$PIDFILE"
PID=$!
echo "started real opencodex pid=$PID port=$PORT log=$LOG"

# Give it a moment to bind; if it fails, the stub will pick up the slack
sleep 3
if ! curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "real opencodex did not bind on :$PORT within 3s (see $LOG)"
  echo "stub fallback (scripts/services/opencodex.cjs.src) will be used by start-all.sh"
fi
