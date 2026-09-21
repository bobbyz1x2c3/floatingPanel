# NemuFloat · 悬浮卡片

一块**磨砂玻璃背景 + 新拟态控件**的悬浮卡片面板，用四象限（紧急 / 重要）组织事情。一份代码同时产出 Windows / macOS / Linux 原生悬浮窗，也能直接在浏览器和移动端运行。

![风格](https://img.shields.io/badge/style-glassmorphism%20%2B%20neumorphism-6d8bff) ![平台](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Web%20%7C%20Mobile-46c2a0)

## 风格约定

混搭的关键是**分层**：大面积的容器用玻璃，能按的小控件用新拟态。

| 层 | 手法 | 实现 |
| --- | --- | --- |
| 面板 / 抽屉 / 提示条 | 磨砂玻璃 | 半透明填充 + `backdrop-filter` + 1px 高明度描边 + 环境投影 |
| 卡片 | 玻璃基底 + 抬升感 | 半透明填充 + 柔和环境阴影（不再用大面积白色外发光） |
| 按钮 / 开关 / 滑杆 / 输入框 | 新拟态 | 同色半透明底 + 双阴影（暗右下 / 亮左上），按下时切换为内阴影 |

玻璃要“看得出来”，就必须有可被模糊的东西，这一点桌面端和浏览器端完全不同：

| 端 | 模糊来源 | 说明 |
| --- | --- | --- |
| 浏览器 | CSS `backdrop-filter` | 面板背后由 `--glass-aura-*` 绘制柔光晕，`backdrop-filter` 负责把它磨砂化 |
| 桌面端 | 系统窗口材质（Acrylic） | Tauri 窗口是透明的，**`backdrop-filter` 无法模糊窗口之外的系统桌面**，必须由 `windowEffects` 调用系统级材质 |

因此桌面端在 `src-tauri/tauri.conf.json` 里设置了：

```json
"windowEffects": { "effects": ["acrylic"], "state": "active" }
```

它要求 Cargo 打开 `unstable` 特性（已在 `src-tauri/Cargo.toml` 中启用）。同一开关也暴露在设置面板的「毛玻璃背景」里，可随时关掉；关闭时窗口退化为半透明面板，依然可用。

另外桌面端会去掉外壳留白（`--shell-pad: 0`）并把面板圆角交给系统：Windows 11 会为无边框窗口绘制圆角与投影，若自己再画一圈留白，系统材质会铺满整个矩形窗口，反而不像一块悬浮玻璃。

## 技术栈

- **Tauri 2**：Rust 外壳，输出体积小、支持桌面 + 移动端
- **React 19 + TypeScript**：界面与状态
- **Vite 7**：开发与构建
- **零运行时 UI 依赖**：所有控件、图标、阴影都是手写 CSS / SVG

## 环境要求

- Node.js 20+
- Rust 1.77+（仅桌面/移动端需要）
- Windows 需 WebView2（Win11 自带）、macOS 需 Xcode Command Line Tools

## 常用命令

```bash
npm install

npm run dev            # 浏览器开发（http://127.0.0.1:5173）
npm run build          # 类型检查 + 构建到 dist/
npm run preview        # 预览构建产物

npm run desktop:dev    # 桌面端开发（原生悬浮窗 + 热更新）
npm run desktop:build  # 打包当前平台安装包

npm run icon           # 由 src-tauri/icon-source.png 重新生成全平台图标
```

> `vite` 使用 `--configLoader runner`，避免配置经 esbuild 打包。若你的环境无此限制，也可以去掉该参数。

## 跨平台打包

在目标系统上执行 `npm run desktop:build` 即可得到本机安装包：

| 平台 | 产物 |
| --- | --- |
| Windows | `.msi`（WiX）+ `.exe`（NSIS） |
| macOS | `.dmg` + `.app`（Intel / Apple Silicon） |
| Linux | `.deb` + `.rpm` + `.AppImage` |

移动端（需先装好对应 SDK）：

```bash
npm run tauri android init && npm run tauri android build
npm run tauri ios init     && npm run tauri ios build
```

窗口配置见 `src-tauri/tauri.conf.json`：无边框、透明、默认置顶，因此桌面端看起来就是一块浮在系统桌面上的玻璃板。

## 四象限

画布被分成四块，卡片停在哪个象限由**卡片中心点**决定，跨过分界线会自动换象限并换上对应的强调色：

| 位置 | 象限 | 强调色 |
| --- | --- | --- |
| 右上 | 紧急 · 重要（立刻去做） | 玫瑰 |
| 右下 | 紧急 · 不重要（交给别人） | 琥珀 |
| 左上 | 重要 · 不紧急（计划去做） | 天蓝 |
| 左下 | 不重要 · 不紧急（有空再说） | 石墨 |

「整理」按象限把卡片重新堆好；空白处双击会在双击所在的象限放下新卡片。

## 交互

- 拖动卡片**标题栏**移动（在标题上直接拖也能拖动整张卡；只点不拖就是正常落光标），右下角手柄缩放
- 卡片右上角只有两个按钮：收起 / 展开、删除
- 卡片正中下方是**更新时间和「完成」按钮**：点完成会播一段收起动效，然后这张卡片被归档
- 画板支持滚动；卡片可以拖到画布任意位置
- 内容自动写入 `localStorage`（键名 `nemu-float.board.v1`）

快捷键：`Ctrl/Cmd + N` 新建 · `Ctrl/Cmd + F` 搜索 · `Ctrl/Cmd + ,` 设置 · `Esc` 关闭面板 / 关预览

## 归档

工具栏的「归档」按钮外面挂着已归档的数量。点开后能看到所有归档卡片、它们原本的象限、附件数量，以及**归档时间**（绝对时间 + 相对时间），可以单张恢复、单张删除或清空归档。归档区最多保留 300 张。

## 附件

卡片支持三种内容来源，全部会随卡片一起保存：

| 操作 | 结果 |
| --- | --- |
| 在卡片里 `Ctrl/Cmd + V` 粘贴截图 | 变成内嵌图片（自动缩放后再存） |
| 把图片拖进卡片 / 画布 | 变成内嵌图片，拖到空白处会顺手新建一张卡片 |
| 把其它文件拖进卡片 / 画布 | 变成文件链接 |

- 正文里出现的网址会被自动识别成链接条
- **按住 `Ctrl`（macOS 为 `⌘`）点击**文件链接或网址才会打开；普通点击只给一句提示，避免编辑时误触
- 图片附件点一下就能在面板内放大预览
- 单张卡片最多 12 个附件

> 浏览器模式拿不到本地文件的真实路径，拖进来的非图片文件会用会话内的 `blob:` 地址，刷新后失效；桌面端拿到的是真实路径，`Ctrl + 点击`交给系统默认程序打开。

## 设置项

主题（浅色 / 深色 / 跟随系统）、强调色、面板透明度、颗粒质感、磨砂强度（浏览器端映射为 `backdrop-filter` 半径）、对齐网格、显示网格、窗口置顶、毛玻璃材质（桌面端系统 Acrylic，默认开）、失焦自动淡化，以及整理布局 / 收起全部 / 恢复示例 / 清空卡片。

窗口行为相关项在浏览器模式下会自动禁用并提示“仅桌面端可用”。

## 目录结构

```
src/
  components/      界面组件（卡片、画板、标题栏、工具栏、归档抽屉、设置抽屉、控件库、图标）
  lib/             状态机（store.ts）、持久化、平台桥接（platform.ts）、附件、链接识别、图片压缩、格式化
  styles/          tokens.css（设计变量）/ neumorphism.css（控件库）/ app.css（布局）
src-tauri/         Rust 外壳、窗口配置、权限、图标
scripts/           应用图标生成脚本
```

设计变量集中在 `src/styles/tokens.css`：改 `--glass-*` 调玻璃，改 `--nm-*` 调新拟态。

## 平台能力差异

| 能力 | 桌面端 | 浏览器 |
| --- | --- | --- |
| 无边框透明悬浮窗 | 支持 | — |
| 窗口置顶 / 最小化 / 关闭 | 支持 | 禁用 |
| 系统毛玻璃材质 | 支持（部分系统） | 用 CSS `backdrop-filter` 代替 |
| 拖入文件拿到真实路径 | 支持（可交给默认程序打开） | 仅能拿到文件内容，非图片会话结束即失效 |
| 粘贴截图 | 支持 | 支持 |
| 本地持久化 | `localStorage` | `localStorage` |
