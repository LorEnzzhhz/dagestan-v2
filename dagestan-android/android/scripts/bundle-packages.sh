#!/bin/bash
# bundle-packages.sh — Pre-download OpenCodex + Hermes into APK assets
# so they're instantly available on first launch (no network needed).
#
# OpenCodex: we download the published npm tarball, then `npm install` its
# production deps into it (--ignore-scripts so the postinstall doesn't try
# to fetch a native bun binary that won't run on the build host). The APK
# then ships a fully self-contained @bitkyc08/opencodex package — no
# on-device npm install required.
#
# Hermes: shipped as-is from GitHub (it's a pure-Python stdlib server
# with optional pip deps that the Kotlin install path handles).
#
# Bun: shipped as the bionic aarch64 .deb so the Kotlin extractor can
# unpack it into prefix/bin/bun on first launch.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../app/src/main/assets/packages"
OPENCODEX_TGZ="$ASSETS_DIR/opencodex.tgz"
HERMES_TGZ="$ASSETS_DIR/hermes-webui.tgz"
BUN_DEB="$ASSETS_DIR/bun.deb"

mkdir -p "$ASSETS_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "=== Bundling packages into APK assets ==="

# 1. OpenCodex: download tarball, install prod deps, re-tar
echo "Downloading @bitkyc08/opencodex from npm..."
OPENCODEX_URL=$(npm view @bitkyc08/opencodex dist.tarball 2>/dev/null)
if [ -z "$OPENCODEX_URL" ]; then
    echo "ERROR: could not resolve @bitkyc08/opencodex dist.tarball from npm" >&2
    exit 1
fi
curl -fsSL "$OPENCODEX_URL" -o "$WORK_DIR/opencodex.tgz"
mkdir -p "$WORK_DIR/ocx"
tar -xzf "$WORK_DIR/opencodex.tgz" -C "$WORK_DIR/ocx"
# npm tarballs always unpack as ./package/ — rename for clarity, then install
# production deps (--ignore-scripts: the bun postinstall would try to
# download a native binary that won't run on the build host).
echo "Installing OpenCodex production deps (no scripts)..."
(
    cd "$WORK_DIR/ocx/package"
    npm install --omit=dev --ignore-scripts --no-audit --no-fund 2>&1 | tail -5
)
# Re-tar with the fully-installed node_modules
echo "Repacking OpenCodex with bundled node_modules..."
rm -f "$OPENCODEX_TGZ"
( cd "$WORK_DIR/ocx" && tar -czf "$OPENCODEX_TGZ" package )
echo "OpenCodex tarball: $(ls -lh "$OPENCODEX_TGZ" | awk '{print $5}')"

# 2. Hermes WebUI (Python stdlib; pip deps installed on device if needed)
echo "Downloading hermes-webui from GitHub..."
HERMES_URL="https://github.com/nesquena/hermes-webui/archive/refs/heads/master.tar.gz"
curl -fsSL "$HERMES_URL" -o "$HERMES_TGZ"
echo "Hermes tarball: $(ls -lh "$HERMES_TGZ" | awk '{print $5}')"

# 3. Bun binary (bionic aarch64 from Termux User Repository)
BUN_VERSION="1.4.0"
BUN_URL="https://tur.kcubeterm.com/pool/tur/bun_${BUN_VERSION}_aarch64.deb"
echo "Downloading Bun ${BUN_VERSION}..."
curl -fsSL "$BUN_URL" -o "$BUN_DEB"
echo "Bun .deb: $(ls -lh "$BUN_DEB" | awk '{print $5}')"

echo ""
echo "=== Bundle complete ==="
ls -lh "$ASSETS_DIR"
echo ""
echo "Total bundle size: $(du -sh "$ASSETS_DIR" | awk '{print $1}')"
