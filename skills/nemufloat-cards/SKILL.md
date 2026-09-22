---
name: nemufloat-cards
description: 通过 `nemu` 命令行读写 NemuFloat 悬浮卡片面板（四象限待办板）里的卡片。当用户提到「悬浮卡片」「卡片面板」「NemuFloat」「nemu」，或者让你把某件事记成卡片、看看板上有什么、把某张卡片标成完成、归档/恢复卡片、按关键词找卡片、给卡片加附件或链接时使用。
---

# NemuFloat 卡片管理

NemuFloat 是一个四象限的悬浮待办面板。卡片按「紧急 / 重要」分成四格：

| 象限 key | 含义 | 位置 |
| --- | --- | --- |
| `do` | 紧急 · 重要 | 右上 |
| `schedule` | 重要 · 不紧急 | 左上 |
| `delegate` | 紧急 · 不重要 | 右下 |
| `drop` | 不重要 · 不紧急 | 左下 |

## 怎么调用

界面和 CLI 共用同一个状态文件，所以**不用管 app 有没有开着**：

- app 开着 → 写完 1~2 秒内窗口里就会自己出现（界面每 1.2 秒比对一次文件）
- app 没开 → 直接改文件，下次启动就能看到

命令名是 `nemu`。找不到就直接用完整路径，Windows 上通常在：

```
%LOCALAPPDATA%\NemuFloat\bin\nemu.exe                      装完应用就有
H:\wkspa\floatingPanel\src-tauri\target\release\nemu.exe   从源码构建时
```

macOS 是 `/Applications/NemuFloat.app/Contents/Resources/bin/nemu`，
Linux 是 `/usr/lib/NemuFloat/bin/nemu`。

两个都没有就先构建一次（在仓库根目录）：

```bash
npm run cli:build
```

## 命令速查

```bash
nemu list                       # 列出所有卡片（按象限）
nemu list --quadrant do         # 只看某个象限
nemu search 周报                # 按标题 / 正文 / 附件名搜
nemu show '#1'                  # 看第 1 张的完整信息（含正文和附件）
nemu add --title "写周报" --body "整理本周进展" --quadrant schedule
nemu add --title "看这个 issue" --url "https://example.com/i/1"
nemu add --title "设计稿" --attach "D:\design\home.png"
nemu set '#2' --append "补一句：下周一交"
nemu set '#2' --quadrant delegate --collapsed true
nemu done '#2'                  # 完成并归档
nemu archived                   # 看归档
nemu restore '#1'               # 从归档恢复
nemu rm '#2'                    # 删除（卡片和归档都能删）
nemu board                      # 每个象限各多少张 + 状态文件路径
```

**选择器**三种写法：完整 id、id 的前几位（`a7226231`）、`#序号`（当前列表里的第几张，从 1 开始）。
`#序号` 在 `restore` 里数的是归档列表，其余命令数的是卡片列表。

**给机器读**：所有命令都可以加 `--json`，输出结构化 JSON。`add` 的 JSON 里带 `id`，方便接着 `set` / `done`。

## 常用流程

**把一段对话里的待办都记下来**（先用一个命令拿到顺序，再按序号引用的写法最省事）：

```bash
nemu add --title "回邮件给张三" --quadrant do --body "问他周会的三个问题"
nemu add --title "重写登录页" --quadrant schedule --body "顺手把错误提示补上"
nemu list
```

**每天早上过一遍板子**：

```bash
nemu list --json          # 读 total / cards[].quadrant / title / body / updatedAt
nemu board                # 四个象限的分布，看出哪里堆太多了
```

**收尾**：确认做完的卡片用 `nemu done '#3'`，误删或想反悔用 `nemu restore`。

## 注意

- 写卡片**不会**碰到用户正在编辑的窗口焦点：界面收到外部改动会整块替换状态，所以别在用户正打字的时候批量写。
- 卡片正文里直接写网址就行，界面会自动识别成链接条；`--url` 则是加一个附件式链接。
- 图片附件用 `--attach` 指向本地图片路径，界面会把它读成内嵌图；文件夹也可以 `--attach`，会变成一个能 Ctrl+点击打开的链接。
- `--file <路径>` 可以指向别的状态文件（测试或者同时管多块板子时用），不写就用界面那份。
- 不确定状态文件在哪：`nemu path`。
