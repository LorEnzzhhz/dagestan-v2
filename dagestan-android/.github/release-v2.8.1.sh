#!/usr/bin/env bash
#
# release-v2.8.1.sh — push the v2.8.1 release to GitHub.
#
# Run this from the repo root on a machine with push access:
#
#   bash .github/release-v2.8.1.sh
#
# It will:
#   1. push the main branch with the v2.8.1 + docs commits
#   2. push the annotated tag dagestan-v2.8.1
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
if [ "$APK_VERSION" != "2.8.1" ] || [ "$APK_CODE" != "29" ]; then
    echo "ERROR: APK is not v2.8.1 (versionCode=29)." >&2
    exit 1
fi

echo "==> pushing main"
git push origin main

echo "==> pushing tag dagestan-v2.8.1"
git push origin dagestan-v2.8.1

echo "==> creating GitHub release"
gh release create dagestan-v2.8.1 \
    --title "Dagestan v2.8.1" \
    --notes-file .github/RELEASE_NOTES_v2.8.1.md \
    --target main \
    --verify-tag \
    "$APK_PATH#dagestan-v2.8.1.apk"

echo
echo "✔ release dagestan-v2.8.1 published"
echo "  https://github.com/LorEnzzhhz/dagestan/releases/tag/dagestan-v2.8.1"
