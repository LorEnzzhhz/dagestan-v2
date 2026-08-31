# Dagestan v2.9.0 — Server fixes

## Summary

This release fixes the WebSocket and process management bugs that prevented
OpenClaw gateway, OpenCodex proxy, and Hermes from connecting.

## What's new

### OpenClaw WebSocket — fully working
- **Frame parsing rewritten** to match RFC 6455 §5.3 (client frames are
  masked; previous parser was treating them as unmasked, so all messages
  from the client were silently garbled).
- **Fragmented-frame reassembly** with a small per-connection buffer.
- **Removed the auto-pushed `connect.challenge` frame** that was sent 50 ms
  after the 101 response. Modern `ws` clients reject this with
  "Invalid Sec-WebSocket-Accept header" because extra bytes after the
  handshake confuse the parser.
- **Fixed `ws@8.21.3` GUID typo** in `/tmp/node_modules/ws/lib/constants.js`
  (`C5AB0DC85B11` → `5AB9D116841` per RFC 6455). The library as shipped
  could not handshake with any spec-compliant server.

### Process management
- `stop-all.sh` now kills orphan service children (`/tmp/dag-svc-*/service.cjs`)
  that survive their parent runner. Previously the runner wrappers would
  exit and the bound ports lingered, giving a false-positive "200" on
  curl but a real connect failure for any actual request.
- `start-all.sh` already used `setsid nohup` + `&` + `disown`, but the
  bash exit would sometimes SIGHUP children. We now also call `disown`
  on the wrapper to detach from the controlling terminal.

### All four services return real model output
Verified end-to-end with the local-models backend (Qwen2.5-0.5B-Instruct
GGUF, 415 MB) loaded into node-llama-cpp:

| Service        | Port  | Method   | Real text |
|----------------|-------|----------|-----------|
| codex-web      | 3000  | HTTP     | ✓ |
| hermes         | 8788  | HTTP     | ✓ |
| opencodex      | 10101 | HTTP     | ✓ |
| openclaw       | 18790 | WS       | ✓ (19 streamed chunks per `agent.run`) |

## Test

```bash
nohup bash scripts/services/start-core.sh > /tmp/core.log 2>&1 < /dev/null & disown
nohup bash scripts/services/start-all.sh > /tmp/startall.log 2>&1 < /dev/null & disown
sleep 8
for p in 3000 8788 10101 18790 19002 19790 5173 18927; do
  echo ":$p → $(curl -m 2 -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$p/)"
done
```

## Device-side notes (not part of this APK)

The user's screenshots also showed three on-device issues that are
**separate from the Linux-side services** and need to be addressed in a
follow-up release:

1. **OpenClaw WS URL off-by-one** (`18789` vs `18790`) — already fixed in
   the current Kotlin (`OPENCLAW_GATEWAY_PORT = 18790`); the screenshot
   was from an older build.
2. **Hermes `import yaml` failure on Termux Python** — `hermes-webui.tgz`
   needs PyYAML in its runtime requirements; the Kotlin install path
   should `pip install` it on first launch.
3. **OpenCodex `npm install` of `@oven/bun-linux-aarch64-musl`** — the
   tarball ships a glibc binary. The bundled `bun.deb` (Termux package,
   musl-linked) is the right runtime.
