#!/usr/bin/env node
/**
 * 发布页截图：对着本地 dev server 用无头 Edge（CDP）拍三张图。
 *
 * 用法：
 *   1. 在「要拍的那个 checkout」里起 dev server（默认假定 127.0.0.1:5173）
 *   2. node scripts/make-shots.mjs
 *
 * 产物（覆盖写入）：
 *   docs/assets/board-light.jpg  1600×960  浅色主题
 *   docs/assets/board-dark.jpg   1600×960  深色主题 + 频谱
 *   docs/assets/preview.jpg      1200×840  图片预览窗（带标注）
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs', 'assets')
const ORIGIN = process.env.SHOT_ORIGIN ?? 'http://127.0.0.1:5173'
const CDP_PORT = 9401
const EDGE =
  process.env.EDGE_PATH ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function log(...args) {
  console.log('[shots]', ...args)
}

/* ---------- Edge / CDP ---------- */

async function launchEdge(profileDir) {
  if (!existsSync(EDGE)) {
    throw new Error(`找不到 Edge：${EDGE}（可用 EDGE_PATH 覆盖）`)
  }
  const child = spawn(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--window-size=1600,960',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  )
  // 等 DevTools 端口起来
  const deadline = Date.now() + 15000
  for (;;) {
    if (Date.now() > deadline) throw new Error('Edge 调试端口超时未就绪')
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (res.ok) break
    } catch {
      /* 还没起来 */
    }
    await sleep(200)
  }
  return child
}

async function connectCdp() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('没有找到可调试的页面')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id == null || !pending.has(msg.id)) return
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(`${msg.error.message}`))
    else resolve(msg.result)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`${method} 超时`))
        }
      }, 20000)
    })

  return { ws, send }
}

/* ---------- 页面操作 ---------- */

function makeEval(send) {
  return async (expression, { awaitPromise = false } = {}) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    })
    if (r.exceptionDetails) {
      const desc =
        r.exceptionDetails.exception?.description ??
        r.exceptionDetails.text ??
        'evaluate 失败'
      throw new Error(desc)
    }
    return r.result?.value
  }
}

function makeWaitFor(evaluate) {
  return async (expression, timeout = 15000, label = expression) => {
    const start = Date.now()
    let lastError
    for (;;) {
      try {
        if (await evaluate(expression)) return
      } catch (err) {
        lastError = err
      }
      if (Date.now() - start > timeout) {
        throw new Error(
          `等待超时：${label}${lastError ? `（最后一次错误：${lastError.message}）` : ''}`,
        )
      }
      await sleep(150)
    }
  }
}

/** 补一段「桌面端按钮是亮的」样式——网页里窗口按钮是 disabled 的。 */
const DESKTOP_FIX = `(() => {
  if (document.getElementById('shot-fix')) return true
  const style = document.createElement('style')
  style.id = 'shot-fix'
  style.textContent = '.nm-btn[disabled]{opacity:1;cursor:default}'
  document.head.appendChild(style)
  return true
})()`

const NO_ERROR_OVERLAY = `!document.querySelector('vite-error-overlay')`

/** 等首屏卡片 + 字体 + 排布动画都落定。 */
async function waitForBoard(evaluate, waitFor, cardSelector = '.card') {
  await waitFor(
    `${NO_ERROR_OVERLAY} && document.querySelectorAll('${cardSelector}').length >= 4`,
    20000,
    '四张示例卡片渲染',
  )
  await evaluate('document.fonts.ready.then(() => true)', {
    awaitPromise: true,
  })
  // arrange 动画 460ms + 卡片位移过渡 380ms + 存档防抖 320ms
  await sleep(1400)
  await waitFor(NO_ERROR_OVERLAY, 5000, '无 Vite 错误浮层')
}

/** 改 localStorage 里的主题 / 音频响应（必须等首次存档落盘后再改）。 */
const PATCH_SETTINGS = (patch) =>
  `(() => {
    const raw = localStorage.getItem('nemu-float.board.v1')
    if (!raw) return false
    const state = JSON.parse(raw)
    state.settings = { ...state.settings, ...${JSON.stringify(patch)} }
    localStorage.setItem('nemu-float.board.v1', JSON.stringify(state))
    return true
  })()`

/** 给频谱柱子注入一组静态高度（网页端没有系统音频，拍静态图用）。 */
const INJECT_SPECTRUM = `(() => {
  const root = document.querySelector('.spectrum')
  if (!root) return false
  root.style.setProperty('--audio-level', '0.62')
  const bars = root.querySelectorAll('.spectrum__bar')
  bars.forEach((bar, i) => {
    const t = bars.length > 1 ? i / (bars.length - 1) : 0
    // 低频在两边、高频在中间：两端高、中间起伏
    const envelope = 0.35 + 0.65 * Math.abs(Math.cos(t * Math.PI))
    const wobble = 0.55 + 0.45 * Math.sin(i * 1.9 + 0.6)
    const v = Math.min(1, Math.max(0.08, envelope * wobble))
    bar.style.transform = \`scaleY(\${v.toFixed(3)})\`
    bar.style.opacity = String(0.35 + v * 0.55)
  })
  return bars.length > 0
})()`

async function capture(send, file) {
  const shot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
  })
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  log('写入', path.relative(ROOT, file))
}

async function setViewport(send, width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  })
}

async function goto(send, evaluate, waitFor, url) {
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete"', 20000, '页面加载完成')
}

/* ---------- 预览窗用的演示图（页面里现画一张） ---------- */

const MAKE_PREVIEW_DATA_URL = `(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1400
  canvas.height = 900
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 1400, 900)
  gradient.addColorStop(0, '#dfe9ff')
  gradient.addColorStop(0.5, '#ffe3ee')
  gradient.addColorStop(1, '#e5fff4')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1400, 900)
  ctx.strokeStyle = 'rgba(70, 84, 140, 0.14)'
  ctx.lineWidth = 1
  for (let x = 0; x <= 1400; x += 70) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 900); ctx.stroke()
  }
  for (let y = 0; y <= 900; y += 70) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(1400, y + 0.5); ctx.stroke()
  }
  ctx.fillStyle = '#2b3350'
  ctx.textAlign = 'center'
  ctx.font = '700 76px "Smiley Sans", "Microsoft YaHei", sans-serif'
  ctx.fillText('点缩略图开独立窗口', 700, 430)
  ctx.font = '400 40px "Smiley Sans", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#5b6478'
  ctx.fillText('滚轮缩放 · 随手标注 · 可以置顶', 700, 520)
  return canvas.toDataURL('image/jpeg', 0.88)
})()`

/** 在画布上拖出一条标注（CDP 鼠标事件会触发 React 的 pointer 回调）。 */
async function dragOnCanvas(send, evaluate, from, to, steps = 8) {
  const box = await evaluate(`(() => {
    const el = document.querySelector('.pv__ink')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })()`)
  if (!box || box.w < 10 || box.h < 10) return false
  const x1 = box.x + box.w * from[0]
  const y1 = box.y + box.h * from[1]
  const x2 = box.x + box.w * to[0]
  const y2 = box.y + box.h * to[1]
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x1,
    y: y1,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1 + ((x2 - x1) * i) / steps,
      y: y1 + ((y2 - y1) * i) / steps,
      button: 'left',
      buttons: 1,
    })
    await sleep(16)
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x2,
    y: y2,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })
  return true
}

/* ---------- 主流程 ---------- */

async function main() {
  // 确认 dev server 是要拍的那个：联机分支才有 src/lib/online.ts，
  // main 上不存在这个文件，Vite 会回退成 index.html（HTML 而不是 TS 源码）。
  const probe = await fetch(`${ORIGIN}/src/lib/online.ts`).catch(() => null)
  const probeText = probe?.ok ? await probe.text() : ''
  if (probeText.includes('joinRoom')) {
    log(
      '警告：dev server 在跑联机分支（src/lib/online.ts 存在）。main 截图请改用 main 的 dev server。',
    )
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const profileDir = path.join(
    os.tmpdir(),
    `nemushot-${randomBytes(4).toString('hex')}`,
  )
  const edge = await launchEdge(profileDir)
  const { ws, send } = await connectCdp()
  const evaluate = makeEval(send)
  const waitFor = makeWaitFor(evaluate)

  try {
    await send('Page.enable')
    await send('Runtime.enable')

    /* 1) 浅色主面板：新 profile 默认就是浅色，等存档落盘即可 */
    log('拍浅色主面板…')
    await setViewport(send, 1600, 960)
    await goto(send, evaluate, waitFor, `${ORIGIN}/`)
    await waitForBoard(evaluate, waitFor)
    await waitFor(
      `!!localStorage.getItem('nemu-float.board.v1')`,
      8000,
      '看板已写入 localStorage',
    )
    await evaluate(DESKTOP_FIX)
    const lightCards = await evaluate(
      `document.querySelectorAll('.card').length`,
    )
    log('浅色卡片数', lightCards)
    await capture(send, path.join(OUT_DIR, 'board-light.jpg'))

    /* 2) 深色主面板 + 频谱 */
    log('拍深色主面板…')
    const patched = await evaluate(
      PATCH_SETTINGS({ theme: 'dark', audioReactive: true }),
    )
    if (!patched) throw new Error('localStorage 里还没有看板数据')
    await send('Page.reload', { ignoreCache: true })
    await waitFor('document.readyState === "complete"', 20000, '重载完成')
    await waitForBoard(evaluate, waitFor)
    await waitFor(
      `document.documentElement.dataset.theme === 'dark'`,
      8000,
      '深色主题生效',
    )
    await waitFor(
      `!!document.querySelector('.spectrum')`,
      8000,
      '频谱层渲染',
    )
    const bars = await evaluate(INJECT_SPECTRUM)
    log('频谱柱子数', bars)
    await evaluate(DESKTOP_FIX)
    await sleep(500)
    await capture(send, path.join(OUT_DIR, 'board-dark.jpg'))

    /* 3) 图片预览窗（浅色主题 + 两笔标注） */
    log('拍图片预览窗…')
    const backToLight = await evaluate(
      PATCH_SETTINGS({ theme: 'light', audioReactive: false }),
    )
    if (!backToLight) throw new Error('localStorage 里还没有看板数据')
    const dataUrl = await evaluate(MAKE_PREVIEW_DATA_URL)
    if (!dataUrl?.startsWith('data:image/')) {
      throw new Error('生成预览图失败')
    }
    const payload = JSON.stringify({ name: 'preview-demo.jpg', src: dataUrl })
    const stored = await evaluate(
      `(() => {
        localStorage.setItem('nemu-float.preview.shot', ${JSON.stringify(payload)})
        return localStorage.getItem('nemu-float.preview.shot')?.length ?? 0
      })()`,
    )
    if (!stored) throw new Error('写入预览 payload 失败')
    await setViewport(send, 1200, 840)
    await goto(send, evaluate, waitFor, `${ORIGIN}/?preview=shot`)
    await waitFor(
      `${NO_ERROR_OVERLAY} && (() => {
        const img = document.querySelector('.pv__image')
        return img && img.complete && img.naturalWidth > 0 && !!document.querySelector('.pv__ink')
      })()`,
      20000,
      '预览图加载完成',
    )
    await evaluate('document.fonts.ready.then(() => true)', {
      awaitPromise: true,
    })
    await sleep(500)
    await evaluate(DESKTOP_FIX)

    await waitFor(
      `document.querySelectorAll('.pv__picks button').length >= 4`,
      8000,
      '预览工具条渲染',
    )
    // 矩形（红）+ 箭头（蓝），和工具条里前几个按钮对应
    await evaluate(
      `document.querySelectorAll('.pv__picks button')[1]?.click()`,
    )
    await sleep(150)
    await dragOnCanvas(send, evaluate, [0.16, 0.22], [0.52, 0.58])
    await evaluate(
      `document.querySelectorAll('.pv__picks button')[3]?.click()`,
    )
    await evaluate(
      `document.querySelectorAll('.pv__colors button')[2]?.click()`,
    )
    await sleep(120)
    await dragOnCanvas(send, evaluate, [0.62, 0.66], [0.4, 0.38])
    await sleep(350)
    await capture(send, path.join(OUT_DIR, 'preview.jpg'))
  } finally {
    try {
      ws.close()
    } catch {
      /* 已断开 */
    }
    edge.kill()
    await sleep(300)
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* 目录占用，留着也没关系 */
    }
  }
}

function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = buf[i + 1]
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      }
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      i += 2
      continue
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

try {
  await main()

  // 校验尺寸和体积，防止拍出空白图
  const expect = [
    ['board-light.jpg', 1600, 960],
    ['board-dark.jpg', 1600, 960],
    ['preview.jpg', 1200, 840],
  ]
  for (const [name, w, h] of expect) {
    const file = path.join(OUT_DIR, name)
    const buf = readFileSync(file)
    const size = jpegSize(buf)
    const kb = Math.round(statSync(file).size / 1024)
    if (!size || size.width !== w || size.height !== h) {
      throw new Error(
        `${name} 尺寸不对：期望 ${w}×${h}，实际 ${size ? `${size.width}×${size.height}` : '无法解析'}`,
      )
    }
    if (kb < 15) throw new Error(`${name} 只有 ${kb}KB，可能是空白图`)
    log(`${name} ${w}×${h} ${kb}KB ✓`)
  }
  log('全部完成')
} catch (err) {
  console.error('[shots] 失败：', err)
  process.exitCode = 1
}
