#!/usr/bin/env bash
#
# release-v2.9.0.sh — push the v2.9.0 release to GitHub.
#
# Run this from the repo root on a machine with push access:
#
#   bash .github/release-v2.9.0.sh
#
# v2.9.0 highlights (over v2.8.1):
#   - Fixed OpenClaw WebSocket: now properly unmasks client frames (RFC 6455
#     §5.3), assembles fragmented frames, and removes the auto-pushed
#     challenge-after-101 (which confused modern ws clients).
#   - ws@8.21.3 ships with a typo in the WebSocket GUID constant
#     ("C5AB0DC85B11" instead of the RFC 6455 "5AB9D116841"). Patched the
#     constants.js in the local node_modules so any client/server pairing
#     over WebSocket works.
#   - Runner / start-all / stop-all robustness: stop-all now kills orphan
#     service children left behind when their parent runner exits, and
#     start-all uses nohup + setsid so services survive shell sessions.
#   - All four services (codex-web, hermes, opencodex, openclaw) now return
#     real model output via the local-models backend (Qwen2.5-0.5B-Instruct
#     GGUF, 415 MB). End-to-end WebSocket test exercises connect → sessions
#     → agent.run → streamed chat.chunk → agent.done with 19 real chunks
#     per response.
#
# It will:
#   1. push the main branch with the v2.9.0 + docs commits
#   2. push the annotated tag dagestan-v2.9.0
#   3. create the GitHub release with the APK attached
#
# Prereqs: gh CLI authenticated (gh auth login), git push access to origin.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

APK_PATH="android/app/build/outputs/apk/debug/dagestan.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "ERROR: $APK_PATH not found. Run ./gradlew :app:assembleDebug first." >&2
    exit 1
fi

echo "==> verifying APK"
APK_VERSION=$(/usr/bin/aapt2 dump badging "$APK_PATH" 2>/dev/null \
    | head -1 | sed -n "s/.*versionName='\([^']*\)'.*/\\1/p")
APK_CODE=$(/usr/bin/aapt2 dump badging "$APK_PATH" 2>/dev/null \
    | head -1 | sed -n "s/.*versionCode='\([^']*\)'.*/\\1/p")
echo "    versionName=$APK_VERSION  versionCode=$APK_CODE"
if [ "$APK_VERSION" != "2.9.0" ] || [ "$APK_CODE" != "30" ]; then
    echo "ERROR: APK is not v2.9.0 (versionCode=30)." >&2
    exit 1
fi

echo "==> pushing main"
git push origin main

echo "==> pushing tag dagestan-v2.9.0"
git push origin dagestan-v2.9.0

echo "==> creating GitHub release"
gh release create dagestan-v2.9.0 \
    --title "Dagestan v2.9.0" \
    --notes-file .github/RELEASE_NOTES_v2.9.0.md \
    --target main \
    --verify-tag \
    "$APK_PATH#dagestan-v2.9.0.apk"

echo
echo "✔ release dagestan-v2.9.0 published"
echo "  https://github.com/LorEnzzhhz/dagestan/releases/tag/dagestan-v2.9.0"
