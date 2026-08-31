#!/usr/bin/env bash
# Bring up the real upstream openclaw gateway (when available) on the
# default port. Like start-real-ocx.sh, this is opportunistic: it
# tries the vendored openclaw-real/ tree under the repo root and
# gracefully reports when its heavy monorepo deps haven't been
# installed yet.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="${LOGDIR:-/tmp/dagestan-services}"
PORT="${PORT:-18790}"
LOG="$LOGDIR/real-openclaw.log"
PIDFILE="$LOGDIR/real-openclaw.pid"
mkdir -p "$LOGDIR"

# Stop any previous instance
if [ -e "$PIDFILE" ]; then
  old=$(cat "$PIDFILE" 2>/dev/null)
  [ -n "$old" ] && kill "$old" 2>/dev/null
fi
pkill -f "openclaw/openclaw.mjs" 2>/dev/null
sleep 1

# If a real openclaw is already listening, we're done.
if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" 2>/dev/null | grep -q '"ok"'; then
  echo "real openclaw already on :$PORT — leaving it"
  exit 0
fi

OC_DIR="$ROOT/openclaw-real"
ENTRY="$OC_DIR/openclaw.mjs"
if [ ! -f "$ENTRY" ]; then
  echo "no vendored openclaw at $ENTRY — skipping real launch"
  exit 0
fi

# The upstream is a pnpm monorepo with hoisted nodeLinker and a
# required `dist/` build output. We require both before launching.
# If either is missing, point the operator at the install/build
# command and let the stub take over.
if [ ! -d "$OC_DIR/node_modules/@openclaw" ]; then
  echo "openclaw node_modules not installed at $OC_DIR/node_modules"
  echo "  install with: cd $OC_DIR && pnpm install"
  echo "real openclaw not launched; stub fallback will be used by start-all.sh"
  exit 0
fi
if [ ! -d "$OC_DIR/dist" ] || [ ! -f "$OC_DIR/dist/index.mjs" ] && [ ! -f "$OC_DIR/dist/index.js" ]; then
  echo "openclaw dist/ not built (need pnpm build)"
  echo "  build with: cd $OC_DIR && pnpm build"
  echo "real openclaw not launched; stub fallback will be used by start-all.sh"
  exit 0
fi

# Detect node-sqlite support. The real openclaw requires it; node 22.5+
# ships it (gated behind --experimental-sqlite on 22.x; enabled by
# default on 24.15+). The runtime also requires node >=22.22.3.
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
NODE_MINOR=$(node -e "process.stdout.write(process.versions.node.split('.')[1])")
# Real openclaw needs node 22.22.3+ or 24.15.0+ for the `--import`
# TypeScript loader to work. 22.16 is in-tree here, which is too old.
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 22 ]; }; then
  echo "node $NODE_MAJOR.$NODE_MINOR is too old for real openclaw (needs 22.22+ or 24.15+)"
  echo "  stub fallback (scripts/services/openclaw.cjs.src) will be used"
  exit 0
fi
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "node-sqlite not available in this node build — real openclaw needs node >= 24.15.0"
  echo "  stub fallback (scripts/services/openclaw.cjs.src) will be used"
  exit 0
fi

export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/tmp/openclaw-state}"
nohup setsid node "$ENTRY" gateway --port "$PORT" --allow-unconfigured --auth none --bind loopback \
  </dev/null >"$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo "started real openclaw pid=$! port=$PORT log=$LOG"

# Give it a moment to bind; if it fails, the stub will pick up the slack
sleep 3
if ! curl -fsS --max-time 1 "http://127.0.0.1:$PORT/healthz" 2>/dev/null | grep -q '"ok"'; then
  echo "real openclaw did not bind on :$PORT within 3s (see $LOG)"
  echo "stub fallback (scripts/services/openclaw.cjs.src) will be used by start-all.sh"
fi
