#!/usr/bin/env bash
#
# Download the AnyClaw rootfs from the rolling GitHub release and
# extract it into a local directory that mirrors the on-device layout
# (files/usr/). This is useful for:
#
#   1. Testing the AnyClawBootstrapper.kt extraction logic on a build
#      machine without an Android device.
#   2. Inspecting the rootfs contents to debug "Start <server>" issues.
#   3. Running the four Dagestan servers directly from the rootfs
#      (e.g. `proot -r files/usr /bin/sh -c 'node /usr/local/lib/...'`).
#
# Usage:
#   ./scripts/download-anyclaw-rootfs.sh [DEST_DIR] [RELEASE]
#
# Defaults:
#   DEST_DIR = ./files
#   RELEASE   = rootfs-latest
#
# Requirements: zstd, tar, curl
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DEST_DIR="${1:-$SCRIPT_DIR/../files}"
RELEASE="${2:-rootfs-latest}"

BASE_URL="https://github.com/friuns2/anyclaw-rootfs-assets/releases/download/$RELEASE"
TARBALL="rootfs.tar.zst.bin"
JNI_TARBALL="jniLibs-arm64-v8a.tar.gz"

# The rootfs unpacks as a Debian tree (usr/, opt/, etc/, bin -> usr/bin,
# lib -> usr/lib at the top level). We stage it under .anyclaw-staging and
# then merge the top-level dirs into DEST_DIR (== the app's files/ dir) so
# the result matches BootstrapInstaller.prefixDir == DEST_DIR/usr.
PREFIX="$DEST_DIR"
STAGING="$DEST_DIR/.anyclaw-staging"
CACHE="$DEST_DIR/cache"

mkdir -p "$CACHE"

echo "=== Downloading AnyClaw rootfs ($RELEASE) ==="

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "1/3 Downloading $TARBALL…"
curl -fsSL --retry 3 -o "$WORK/$TARBALL" "$BASE_URL/$TARBALL"
echo "   $(ls -lh "$WORK/$TARBALL" | awk '{print $5}') downloaded"

echo "2/3 Extracting rootfs…"
rm -rf "$STAGING"
mkdir -p "$STAGING"
zstd -dc "$WORK/$TARBALL" | tar -x -C "$STAGING"

echo "3/3 Downloading + extracting $JNI_TARBALL…"
curl -fsSL --retry 3 -o "$WORK/$JNI_TARBALL" "$BASE_URL/$JNI_TARBALL"
mkdir -p "$STAGING/usr/lib"
tar -xzf "$WORK/$JNI_TARBALL" -C "$STAGING/usr/lib"

echo "4/4 Installing rootfs tree into $PREFIX…"
for d in usr opt etc bin lib; do
    if [ -e "$STAGING/$d" ]; then
        [ -e "$PREFIX/$d" ] && rm -rf "$PREFIX/$d"
        mv "$STAGING/$d" "$PREFIX/$d"
    fi
done
rm -rf "$STAGING"
touch "$PREFIX/usr/.anyclaw_extracted"

echo "Top-level entries:"
ls "$PREFIX" | head -20
echo ""
echo "Key paths:"
for p in usr/bin/sh usr/local/bin/node usr/local/bin/npm usr/local/bin/openclaw \
         usr/local/lib/node_modules/openclaw/openclaw.mjs \
         usr/local/lib/node_modules/@brutalstrikedevs/codexui-android/dist-cli/index.js \
         opt/hermes-webui/server.py \
         usr/lib/arm64-v8a/libproot.so; do
    if [ -e "$PREFIX/$p" ]; then
        echo "  ✓ $p"
    else
        echo "  ✗ $p MISSING"
    fi
done
