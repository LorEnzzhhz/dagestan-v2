#!/usr/bin/env bash
#
# Bundle the published codex-web-local npm package into APK assets so the
# on-device server can run fully offline (no runtime npm install).
#
# The codex-web-local package ships a prebuilt frontend (dist/) and CLI
# (dist-cli/index.js) plus a short dependency list (express, commander).
# We download the pinned tarball, unpack it, and pre-install its production
# dependencies so the Android app can extract everything and start the server
# without a network connection.
#
# Usage:
#   ./scripts/build-server-bundle.sh
#
# Prerequisites:
#   - Node.js and npm installed on the build machine
#   - Run from the android/ directory OR the project root

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$(dirname "$SCRIPT_DIR")"

ASSETS_DIR="$ANDROID_DIR/app/src/main/assets/server-bundle"

CODEX_WEB_LOCAL_VERSION="${CODEX_WEB_LOCAL_VERSION:-0.1.0}"
TARBALL_URL="https://registry.npmjs.org/codex-web-local/-/codex-web-local-$CODEX_WEB_LOCAL_VERSION.tgz"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "=== Bundling codex-web-local@$CODEX_WEB_LOCAL_VERSION ==="

echo "Downloading package tarball..."
curl -fsSL -o "$WORK_DIR/codex-web-local.tgz" "$TARBALL_URL"

echo "Unpacking package..."
mkdir -p "$WORK_DIR/pkg"
tar -xzf "$WORK_DIR/codex-web-local.tgz" -C "$WORK_DIR/pkg"

# Copy the package into assets (rename package -> root of server-bundle)
echo "Copying package into Android assets..."
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp -r "$WORK_DIR/pkg/package/." "$ASSETS_DIR/"

# Pre-install production dependencies so the bundle is self-contained.
# --omit=dev installs only runtime deps (express, commander); prune the
# empty @scope stub directories npm leaves behind so the APK stays small.
echo "Installing production dependencies..."
(
  cd "$ASSETS_DIR"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund 2>&1 | tail -5 || \
    { echo "WARNING: npm install failed; runtime will try to install deps on-device."; }
  # Remove empty @scope directories left by omit=dev
  find node_modules -maxdepth 1 -type d -name '@*' -empty -print0 2>/dev/null | xargs -0 rmdir 2>/dev/null || true
)

echo ""
echo "=== Server bundle ready ==="
echo "Location: $ASSETS_DIR"
echo "Contains:"
ls -la "$ASSETS_DIR"
du -sh "$ASSETS_DIR" 2>/dev/null || true
