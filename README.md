# 纸上键 · paper-key

> 给你的键盘一百种灵魂。

一个极简的 macOS 机械键盘音效 App — 按任何键，在任何 App 里，都能出机械键盘的声音。

这是 [Mechvibes](https://mechvibes.com) 的精神续作，用 **Tauri 2 + Rust** 原生重写，27 MB 安装包，不带 Electron。

---

## 特点

- 🎹 **18 款真实机械键盘录音** — Cherry MX（青/茶/红/黑 · ABS/PBT）、Topre 静电容、Holy Pandas、NK Cream、Everglide Oreo / Crystal Purple、Tealio Turquoise、Travel 系列…
- 🌏 **全局监听** — 在任意 App 里敲键都出声（浏览器、编辑器、终端、Finder…）
- 🎚️ **音量调节** + 选择记忆
- 🎨 **宣纸美学** — 墨绿/朱红/宣纸三色，中文书法感 UI
- 📦 **27 MB 原生 App** — CGEventTap + Web Audio，零 Electron 开销

---

## 下载 & 安装

1. 下载最新 [Release](../../releases) 里的 `纸上键-v*.dmg`（Apple Silicon，macOS 11+）
2. 打开 DMG，拖「纸上键」到 `/Applications/`
3. 首次打开：在 `/Applications/` 里**右键 → 打开** → 弹窗里再点「打开」（ad-hoc 签名，未经 Apple 公证）
4. 跟着 App 里的三步引导走：欢迎 → 解释 → 点「去开启」会弹系统授权对话框 → 在**系统设置 → 隐私与安全性 → 输入监控**里打开「纸上键」开关
5. 回到 App，敲键盘 → 出声

> macOS 对「全局捕获键盘事件」的 App 要求 **Input Monitoring（输入监控）** 权限，跟截屏录屏同级；首次授权后会一直记住。
> 如果某次更新后显示「⚠ 权限失效」，点状态栏的修复面板，按指引在系统设置里把「纸上键」从列表删掉再拖回来即可（这是 ad-hoc 签名的已知限制，详见 [INSTALL.md](./INSTALL.md#权限失效怎么办)）。

---

## 致谢 & 引用的开源项目

**这个项目是站在巨人的肩膀上拼起来的。强烈建议先去给下面这些项目点个 star。**

### 核心灵感 & 音色资产

[**mechvibes/mechvibes**](https://github.com/hainguyents13/mechvibes) by Hai Nguyen — **本项目所有 18 款音色包直接来自 mechvibes 仓库**，配置格式（`config.json` 的 `defines` 字段、sprite 偏移）也完全沿用它的设计。mechvibes 是 Electron 实现的跨平台版本（支持 Windows / macOS / Linux），**如果你不在 Mac 上，请直接用 mechvibes**。

- License：**GPL-3.0**，因此本项目也采用 GPL-3.0
- 音色文件全部来自 [`mechvibes/src/audio/`](https://github.com/hainguyents13/mechvibes/tree/master/src/audio)
- 原始录制者的 attribution 详见 mechvibes 上游 README

### 技术栈

| 用途 | 库 | 作者 |
|------|----|------|
| 桌面 App 框架 | [Tauri 2](https://tauri.app) | [tauri-apps](https://github.com/tauri-apps) |
| macOS Framework FFI | [core-foundation-rs](https://github.com/servo/core-foundation-rs) | Mozilla / Servo |
| CGEventTap 绑定 | [core-graphics](https://crates.io/crates/core-graphics) | Mozilla / Servo |
| JSON & 序列化 | [serde](https://serde.rs) | dtolnay et al. |

### 踩过的坑 & 放弃的方案

- [**rdev**](https://github.com/Narsil/rdev) — 最初方案，Rust 原生跨平台键盘监听。但它的 macOS 实现在 callback 线程里调 `TSMGetInputSourceProperty`，触发 `dispatch_assert_queue_fail` → `SIGTRAP` 崩溃（macOS 14+ 对 queue assertion 收紧了）。最终放弃，直接用 core-graphics 的 `CGEventTap` 自己写。

---

## 开发

```bash
# 1. 拉音色（首次必跑，从 mechvibes 上游克隆 18 款音色包到 src/assets/sounds/）
bash scripts/fetch-sounds.sh

# 2. 装依赖
npm install
rustup target add aarch64-apple-darwin  # M 系列 Mac

# 3. 开发模式
npm run tauri dev -- --target aarch64-apple-darwin

# 打包（一键：build + ad-hoc 签名 + 自定义 DMG）
bash scripts/release.sh 0.2.0
# 产物：dist/纸上键-v0.2.0.dmg（约 23 MB，含 /Applications 拖拽符号链接）

# 也可以只跑 Tauri 原生 build（不做 ad-hoc 重签）
npm run tauri build -- --target aarch64-apple-darwin
```

### 目录

```
paper-key/
├── src/                  # 前端（原生 HTML + JS，无框架）
│   ├── index.html        # 硬编码 18 张音色卡
│   ├── app.js            # 音色加载 + Web Audio 播放 + Tauri event 桥
│   ├── onboarding.js     # 3 步引导 + 权限状态栏 + 诊断面板
│   ├── onboarding.css
│   ├── style.css         # 宣纸风 UI
│   └── assets/sounds/    # 18 款音色包（来自 mechvibes，首次需跑 fetch-sounds.sh）
├── src-tauri/
│   └── src/lib.rs        # CGEventTap 全局监听 + IOHID 输入监控授权 + 诊断命令
├── scripts/
│   ├── fetch-sounds.sh   # 从 mechvibes 上游拉音色
│   └── release.sh        # 一键 build + ad-hoc 签名 + DMG
└── INSTALL.md            # 给 beta 用户看的安装/排错指南
```

### 添加新音色

1. 在 `src/assets/sounds/<id>/` 放 `config.json` + 音频文件（格式见 [mechvibes 文档](https://github.com/hainguyents13/mechvibes#custom-sounds)）
2. 在 `src/index.html` 里复制一张 `.card` 加上 `data-pack="<id>"`

---

## 为什么又造一遍轮子

- **macOS 专属**：不想要 Electron 的体积；Tauri 打出来 27 MB，启动即开
- **练手**：学 Tauri 2 + 原生 macOS FFI（CGEventTap / TCC / AXIsProcessTrustedWithOptions）
- **审美偏好**：想要宣纸 + 墨绿 + 朱红的中式极简 UI

跨平台 / 更成熟 / 更大社区 — 请用 [mechvibes](https://mechvibes.com)。

---

## License

**GPL-3.0-or-later** — 因为引用了 mechvibes 的音色资产（GPL-3.0），本项目保持一致授权。

- 完整协议文本：[LICENSE](LICENSE)
- 版权声明 / 衍生作品声明 / 第三方依赖：[NOTICE](NOTICE)

### 这意味着什么

- ✅ 你可以**自由使用、修改、再分发**本项目（商业用途也可以）
- ⚠️ 任何基于本项目的修改或衍生作品，**必须也采用 GPL-3.0 开源**，不能闭源
- ⚠️ 分发二进制时必须同时提供完整源码（或给出可获取源码的方式）
- ⚠️ 保留原始 `LICENSE` / `NOTICE` / 版权声明，不得移除
- ⚠️ GPL-3.0 与 Apple App Store 分发条款不兼容，**无法上架 Mac App Store**

---

## 作者

[01fish](https://01fish.com) · Claude Code 深度参与了这个项目的开发。
