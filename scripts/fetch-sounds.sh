#!/usr/bin/env bash
# fetch-sounds.sh — 从 mechvibes 仓库拉取 18 款音色包到 src/assets/sounds/
#
# 音色包归 mechvibes 所有 (GPL-3.0)：
#   https://github.com/hainguyents13/mechvibes
set -euo pipefail

PACKS=(
  cherrymx-black-abs cherrymx-black-pbt
  cherrymx-blue-abs  cherrymx-blue-pbt
  cherrymx-brown-abs cherrymx-brown-pbt
  cherrymx-red-abs   cherrymx-red-pbt
  cream-travel       eg-crystal-purple
  eg-oreo            holy-pandas
  mxblack-travel     mxblue-travel
  mxbrown-travel     nk-cream
  topre-purple-hybrid-pbt
  turquoise
)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src/assets/sounds"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "→ clone mechvibes (shallow)..."
git clone --depth 1 https://github.com/hainguyents13/mechvibes.git "$TMP/mv" > /dev/null

mkdir -p "$DEST"
for p in "${PACKS[@]}"; do
  if [ -d "$DEST/$p" ]; then
    echo "✓ $p (skip — 已存在)"
  elif [ -d "$TMP/mv/src/audio/$p" ]; then
    cp -R "$TMP/mv/src/audio/$p" "$DEST/"
    echo "✓ $p"
  else
    echo "✗ $p 找不到，mechvibes 仓库结构可能改过，请检查" >&2
  fi
done

echo ""
echo "完成。音色已拉到 $DEST"
echo "记得给 https://github.com/hainguyents13/mechvibes 点个 star ⭐"
