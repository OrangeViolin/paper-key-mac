#!/usr/bin/env bash
# =============================================================
# 纸上键 · 内测版打包脚本（ad-hoc 签名）
# 用法： bash scripts/release.sh [版本号]
# 例：  bash scripts/release.sh 0.1.1
# 产物：dist/纸上键-v0.1.1.dmg  +  dist/INSTALL.md
# =============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
VERSION="${1:-0.1.0}"
APP_NAME="纸上键"
TARGET="aarch64-apple-darwin"
BUNDLE_ID="com.01fish.paperkey"

DIST="$APP_DIR/dist"
mkdir -p "$DIST"

# ---- 1. 清理旧产物 ----
echo "==> 清理旧构建产物"
rm -rf "$APP_DIR/src-tauri/target/${TARGET}/release/bundle"
rm -rf "$DIST/${APP_NAME}.app"
rm -f  "$DIST/${APP_NAME}-v${VERSION}.dmg"

# ---- 2. tauri build ----
echo "==> tauri build（--target ${TARGET}）"
cd "$APP_DIR"
npm run tauri build -- --target "${TARGET}"

# ---- 3. Tauri 会把 .app 清理掉只留 dmg，从 dmg 里挖出来 ----
BUNDLE_DMG="$APP_DIR/src-tauri/target/${TARGET}/release/bundle/dmg/${APP_NAME}_${VERSION}_aarch64.dmg"
if [ ! -f "$BUNDLE_DMG" ]; then
  # 尝试其它可能的版本号命名
  BUNDLE_DMG="$(ls "$APP_DIR/src-tauri/target/${TARGET}/release/bundle/dmg/"*.dmg 2>/dev/null | head -1 || true)"
fi
if [ -z "$BUNDLE_DMG" ] || [ ! -f "$BUNDLE_DMG" ]; then
  echo "✗ 没找到 Tauri 构建产物 dmg。检查上面的构建日志。" >&2
  exit 1
fi
echo "==> 挂载并提取 .app  :  $BUNDLE_DMG"
MOUNT_LINE="$(hdiutil attach -nobrowse "$BUNDLE_DMG" | tail -1)"
VOLUME="$(echo "$MOUNT_LINE" | awk '{for(i=3;i<=NF;i++) printf "%s%s",$i,(i<NF?" ":""); print ""}')"
cp -R "$VOLUME/${APP_NAME}.app" "$DIST/"
hdiutil detach "$VOLUME" -quiet

APP_PATH="$DIST/${APP_NAME}.app"

# ---- 4. ad-hoc 深度签名 ----
echo "==> ad-hoc codesign"
codesign --force --deep --sign - "$APP_PATH"

# ---- 5. 清 quarantine（针对本机测试，对外下载者无效） ----
xattr -cr "$APP_PATH" 2>/dev/null || true

# ---- 6. 重新打 DMG（简洁样式） ----
DMG_FINAL="$DIST/${APP_NAME}-v${VERSION}.dmg"
echo "==> 打包 DMG → $DMG_FINAL"
STAGE="$(mktemp -d -t paperkey-stage)"
cp -R "$APP_PATH" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "${APP_NAME}" \
  -srcfolder "$STAGE" \
  -ov -format UDZO \
  "$DMG_FINAL" >/dev/null
rm -rf "$STAGE"

# ---- 7. 复制安装说明 ----
if [ -f "$APP_DIR/INSTALL.md" ]; then
  cp "$APP_DIR/INSTALL.md" "$DIST/"
fi

# ---- 8. 输出 CDHash（方便对照诊断面板） ----
CD_HASH="$(codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep '^CDHash=' | head -1 | cut -d= -f2)"

cat <<EOF

✅ 打包完成

  DMG      : $DMG_FINAL
  size     : $(du -h "$DMG_FINAL" | awk '{print $1}')
  CDHash   : $CD_HASH
  identifier: $BUNDLE_ID

🧪 本机测试：
   open "$DMG_FINAL"
   拖 ${APP_NAME}.app 到 Applications，然后 右键→打开

📦 发给内测用户：
   把 $DMG_FINAL 和 $DIST/INSTALL.md 一起发
EOF
