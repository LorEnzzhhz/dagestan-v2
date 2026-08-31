#!/usr/bin/env bash
# Tear down every service we started with start-all.sh + start-core.sh.
# Removes pidfiles and waits for ports to free up before exiting.
set -u
LOGDIR="${LOGDIR:-/tmp/dagestan-services}"

# 1. Stop the runners for the auxiliary services (they each spawn a child).
for name in codex-web hermes opencodex openclaw; do
  pidfile="$LOGDIR/$name.pid"
  if [ -e "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 0.2
      kill -9 "$pid" 2>/dev/null
      echo "stopped $name runner (pid $pid)"
    fi
    rm -f "$pidfile"
  fi
done

# 2. Kill any orphan service children — they live in /tmp/dag-svc-*/service.cjs.
#    These survive their parent runner because Node orphans them when the
#    parent exits.
for pid in $(ls /proc/ 2>/dev/null | grep -E "^[0-9]+$"); do
  if [ -r "/proc/$pid/cmdline" ]; then
    cmd=$(cat "/proc/$pid/cmdline" 2>/dev/null | tr "\0" " ")
    case "$cmd" in
      *dag-svc-*service.cjs*)
        kill -9 "$pid" 2>/dev/null && echo "killed orphan child pid=$pid"
        ;;
    esac
  fi
done

# 3. Stop the core stack: local-models + vite.
for name in local-models vite; do
  pidfile="$LOGDIR/$name.pid"
  if [ -e "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 0.2
      kill -9 "$pid" 2>/dev/null
      echo "stopped $name (pid $pid)"
    fi
    rm -f "$pidfile"
  fi
done

sleep 0.6
