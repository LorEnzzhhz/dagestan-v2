#!/bin/bash
# bundle-packages.sh — Pre-download OpenCodex + Hermes + Claude Code + Cursor
# into APK assets so they're instantly available on first launch (no network
# needed on the device).
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
#
# Claude Code: the official native linux-arm64 build (glibc) is shipped as a
# flat tarball. It runs inside the proot Debian container that the device
# agent provisions — the APK's Termux prefix is bionic and only stages it.
#
# Cursor Agent: the official `agent` CLI. Best-effort — the download is
# resolved from Cursor's installer/CDN, and if it can't be fetched the APK
# still builds (the device agent falls back to installing it on-device when
# the phone is online).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../app/src/main/assets/packages"
OPENCODEX_TGZ="$ASSETS_DIR/opencodex.tgz"
HERMES_TGZ="$ASSETS_DIR/hermes-webui.tgz"
BUN_DEB="$ASSETS_DIR/bun.deb"
CLAUDE_TGZ="$ASSETS_DIR/claude-code.tgz"
CURSOR_TGZ="$ASSETS_DIR/cursor-agent.tgz"

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

# 4. Claude Code — native linux-arm64 build (glibc; runs in the proot Debian
#    container). The npm package is just the binary + metadata, so we re-pack
#    it flat: claude-code.tgz -> { claude, package.json, LICENSE.md, ... }.
CLAUDE_VERSION="${CLAUDE_CODE_VERSION:-2.1.252}"
CLAUDE_PKG="@anthropic-ai/claude-code-linux-arm64@${CLAUDE_VERSION}"
echo "Downloading ${CLAUDE_PKG} from npm..."
CLAUDE_URL=$(npm view "$CLAUDE_PKG" dist.tarball 2>/dev/null)
if [ -z "$CLAUDE_URL" ]; then
    echo "ERROR: could not resolve ${CLAUDE_PKG} dist.tarball from npm" >&2
    exit 1
fi
curl -fsSL "$CLAUDE_URL" -o "$WORK_DIR/claude-arm64.tgz"
mkdir -p "$WORK_DIR/claude"
tar -xzf "$WORK_DIR/claude-arm64.tgz" -C "$WORK_DIR/claude"
if [ ! -f "$WORK_DIR/claude/package/claude" ]; then
    echo "ERROR: claude binary missing from ${CLAUDE_PKG} tarball" >&2
    exit 1
fi
rm -f "$CLAUDE_TGZ"
( cd "$WORK_DIR/claude/package" && tar -czf "$CLAUDE_TGZ" . )
echo "Claude Code tarball: $(ls -lh "$CLAUDE_TGZ" | awk '{print $5}')"

# 5. Cursor Agent — the official `agent` CLI. The official installer is
#    `curl https://cursor.com/install | bash`; we resolve the same tarball it
#    downloads and ship the linux/arm64 build. Soft-fail: if Cursor's CDN is
#    unreachable (or has no arm64 build) the APK still builds, and the device
#    agent installs Cursor on-device when the phone is online.
echo "Resolving Cursor Agent download..."
cursor_download() {
    # Returns the URL of a tarball containing a working `agent` binary, or "".
    local url candidate
    for candidate in "$@"; do
        [ -n "$candidate" ] || continue
        if curl -fsSL --max-time 60 "$candidate" -o "$WORK_DIR/cursor.tgz" 2>/dev/null; then
            mkdir -p "$WORK_DIR/cursor"
            rm -rf "$WORK_DIR/cursor"/* 2>/dev/null || true
            if tar -xzf "$WORK_DIR/cursor.tgz" -C "$WORK_DIR/cursor" 2>/dev/null; then
                local bin
                bin=$(find "$WORK_DIR/cursor" -type f \( -name agent -o -name cursor-agent \) 2>/dev/null | head -1)
                if [ -n "$bin" ] && [ -s "$bin" ]; then
                    printf '%s' "$candidate"
                    return 0
                fi
            fi
        fi
    done
    return 1
}

CURSOR_URL=""
# 5a. Parse the official installer for the current download URL (it exposes
#     something like https://downloads.cursor.com/lab/<ver>/${OS}/${ARCH}/agent-cli-package.tar.gz)
CURSOR_INSTALLER=$(curl -fsSL --max-time 30 https://cursor.com/install 2>/dev/null || true)
if [ -n "$CURSOR_INSTALLER" ]; then
    CURSOR_BASE=$(printf '%s' "$CURSOR_INSTALLER" \
        | grep -oE 'https://[^"'"'"' ]*agent-cli-package[^"'"'"' ]*' | head -1 || true)
    if [ -n "$CURSOR_BASE" ]; then
        CURSOR_BASE=$(printf '%s' "$CURSOR_BASE" \
            | sed -e 's/\${OS}/linux/g' -e 's/\${ARCH}/arm64/g' -e 's/${OS}/linux/g' -e 's/${ARCH}/arm64/g')
    fi
fi
# 5b. Probe candidates: installer-derived URL first, then a couple of guesses.
CURSOR_URL=$(cursor_download \
    "$CURSOR_BASE" \
    "https://downloads.cursor.com/lab/stable/linux/arm64/agent-cli-package.tar.gz" \
    "https://downloads.cursor.com/lab/latest/linux/arm64/agent-cli-package.tar.gz" \
    "https://api2.cursor.sh/updates/download-latest?os=cli-linux-arm64" \
    || true)
if [ -n "$CURSOR_URL" ]; then
    rm -f "$CURSOR_TGZ"
    # Re-pack flat: cursor-agent.tgz -> { agent }
    tar -czf "$CURSOR_TGZ" -C "$WORK_DIR/cursor" .
    echo "Cursor Agent tarball: $(ls -lh "$CURSOR_TGZ" | awk '{print $5}') (from $CURSOR_URL)"
else
    echo "WARNING: could not fetch a linux/arm64 Cursor Agent build." >&2
    echo "         The APK will build without it; the device agent installs Cursor on-device when online." >&2
    rm -f "$CURSOR_TGZ"
fi

echo ""
echo "=== Bundle complete ==="
ls -lh "$ASSETS_DIR"
echo ""
echo "Total bundle size: $(du -sh "$ASSETS_DIR" | awk '{print $1}')"
