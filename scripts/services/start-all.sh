#!/usr/bin/env bash
# Bring up every Dagestan dev service with port-fallback.
# Writes pidfiles to /tmp/dagestan-services/. Idempotent — running services
# are detected and left alone.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="${LOGDIR:-/tmp/dagestan-services}"
mkdir -p "$LOGDIR"

# 1. Ensure core stack is up (vite + local-models). These are not owned by
#    the start/stop-all dance — they're started by start-core.sh.
if ! curl -fsS --max-time 1 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "core stack (vite) is not running — starting it via start-core.sh"
  bash "$ROOT/scripts/services/start-core.sh"
  sleep 4
fi
if ! curl -fsS --max-time 1 http://127.0.0.1:18927/healthz >/dev/null 2>&1; then
  echo "local-models server is not running — starting it via start-core.sh"
  bash "$ROOT/scripts/services/start-core.sh"
  sleep 3
fi

try_port() {
  node -e "require('net').createServer().once('error',()=>process.exit(1)).once('listening',function(){this.close(()=>process.exit(0))}).listen($1,'127.0.0.1')" 2>/dev/null
}

is_up() {
  local port=$1
  curl -fsS --max-time 1 "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 \
    || curl -fsS --max-time 1 "http://127.0.0.1:$port/" >/dev/null 2>&1
}

find_free_port() {
  local from=$1 to=$2
  for ((p=from; p<=to; p++)); do
    if try_port $p; then echo $p; return; fi
  done
  echo ""
}

start_svc() {
  local name=$1 blob=$2 default_port=$3
  local port control log pidfile
  pidfile="$LOGDIR/$name.pid"

  # If a runner pidfile exists and the process is alive, skip.
  if [ -e "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      port=$(find_free_port $default_port $((default_port+50)) || echo "")
      if [ -z "$port" ]; then
        # Service may be on a remapped port. Probe /healthz from $default_port+1000.
        control=$((default_port+1000))
        if is_up "$default_port" || is_up "$control"; then
          echo "$name already running (PID=$pid)  on port $default_port"
          return
        fi
        echo "$name PID file present but service unreachable — leaving alone"
        return
      fi
      echo "$name already running (PID=$pid) — skipping"
      return
    fi
  fi

  port=$(find_free_port $default_port $((default_port+50)))
  if [ -z "$port" ]; then
    echo "ERROR: no free port near $default_port for $name — skipping"
    return
  fi
  control=$((port+1000))
  log="$LOGDIR/$name.log"
  pidfile="$LOGDIR/$name.pid"
  cd "$ROOT" || exit 1

  # For openclaw, remap both gateway + ctrl UI ports via env
  local extra_env=""
  if [ "$name" = "openclaw" ] && [ "$port" -ne "$default_port" ]; then
    local ctrl_ui=$((port+212))
    ctrl_ui=$(find_free_port $ctrl_ui $((ctrl_ui+20)))
    if [ -z "$ctrl_ui" ]; then ctrl_ui=$((port+212)); fi
    extra_env="PORT_18790=${port} PORT_19002=${ctrl_ui}"
  fi

  if [ -n "$extra_env" ]; then
    env $extra_env setsid nohup node scripts/services/runner.mjs "$blob" "$port" "$name" \
      >"$log" 2>&1 &
  else
    setsid nohup node scripts/services/runner.mjs "$blob" "$port" "$name" \
      >"$log" 2>&1 &
  fi
  local pid=$!
  echo $pid > "$pidfile"
  disown 2>/dev/null || true
  if [ "$port" -ne "$default_port" ]; then
    echo "$name PID=$pid  PRIMARY=http://127.0.0.1:$port  CONTROL=http://127.0.0.1:$control  (remapped from $default_port)  LOG=$log"
  else
    echo "$name PID=$pid  PRIMARY=http://127.0.0.1:$port  CONTROL=http://127.0.0.1:$control  LOG=$log"
  fi
}

# Ensure real upstream services are running (opencodex, openclaw)
if ! curl -fsS --max-time 1 "http://127.0.0.1:10101/v1/models" >/dev/null 2>&1 || ! curl -s --max-time 1 "http://127.0.0.1:10101/healthz" | grep -q opencodex; then
  bash "$ROOT/scripts/services/start-real-ocx.sh" 2>/dev/null || echo "(real opencodex already running or unavailable)"
fi
if ! curl -fsS --max-time 1 "http://127.0.0.1:18790/healthz" 2>/dev/null | grep -q "\"ok\""; then
  bash "$ROOT/scripts/services/start-real-openclaw.sh" 2>/dev/null || echo "(real openclaw already running or unavailable)"
fi
start_svc codex-web  scripts/services/codex.cjs.src    3000
start_svc hermes     scripts/services/hermes.cjs.src   8788

# For opencodex and openclaw, prefer the REAL upstream services if they are
# already running. The real binaries are launched by start-real-openclaw.sh /
# start-real-ocx.sh. The stub services exist as a fallback when the real ones
# are not available.
if curl -fsS --max-time 1 "http://127.0.0.1:10101/v1/models" >/dev/null 2>&1 && \
   curl -s --max-time 1 "http://127.0.0.1:10101/healthz" | grep -q opencodex; then
  echo "real opencodex already on :10101 — skipping stub"
else
  start_svc opencodex  scripts/services/opencodex.cjs.src 10101
fi
if curl -fsS --max-time 1 "http://127.0.0.1:18790/healthz" 2>/dev/null | grep -q '"ok"'; then
  echo "real openclaw already on :18790 — skipping stub"
else
  start_svc openclaw   scripts/services/openclaw.cjs.src 18790
fi

echo "--- waiting for services to come up ---"
sleep 4
for f in "$LOGDIR"/*.log; do
  [ -e "$f" ] || continue
  echo "== $f =="
  tail -5 "$f"
  echo ""
done
