import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentType, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  applyAlwaysOnTop,
  closeWindow,
  isDesktop,
  minimizeWindow,
  observeMaximized,
  toggleMaximizeWindow,
} from '../lib/platform'
import { readPreviewPayload } from '../lib/preview'
import { loadState } from '../lib/storage'
import { NeuButton } from './controls'
import {
  IconArrowLine,
  IconChevronDown,
  IconChevronUp,
  IconCircle,
  IconClose,
  IconEraser,
  IconFit,
  IconMaximize,
  IconMinus,
  IconPencil,
  IconPin,
  IconRestoreWindow,
  IconSquare,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from './icons'
import '../styles/preview.css'

type Tool = 'pencil' | 'rect' | 'ellipse' | 'arrow'

interface Point {
  x: number
  y: number
}

interface PencilShape {
  tool: 'pencil'
  color: string
  width: number
  points: Point[]
}

interface BoxShape {
  tool: 'rect' | 'ellipse' | 'arrow'
  color: string
  width: number
  from: Point
  to: Point
}

type Shape = PencilShape | BoxShape

interface Size {
  w: number
  h: number
}

const TOOLS: { key: Tool; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { key: 'pencil', label: '铅笔', Icon: IconPencil },
  { key: 'rect', label: '矩形', Icon: IconSquare },
  { key: 'ellipse', label: '圆形', Icon: IconCircle },
  { key: 'arrow', label: '箭头', Icon: IconArrowLine },
]

const COLORS = ['#ff5d73', '#ffb020', '#2f9bff', '#1f2534']

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.25
/** 线宽按图片尺寸换算，画出来的标注缩放时会跟图片一起放大。 */
const STROKE_DIVISOR = 300

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function strokeWidthFor(size: Size): number {
  return clamp(Math.max(size.w, size.h) / STROKE_DIVISOR, 1.4, 12)
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save()
  ctx.strokeStyle = shape.color
  ctx.lineWidth = shape.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (shape.tool === 'pencil') {
    const [first, ...rest] = shape.points
    if (!first) {
      ctx.restore()
      return
    }
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    if (rest.length === 0) {
      // 只点了一下：画一个点，不然什么都看不到。
      ctx.lineTo(first.x + 0.01, first.y)
    }
    for (const point of rest) ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.restore()
    return
  }

  const { from, to } = shape
  if (shape.tool === 'rect') {
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
  } else if (shape.tool === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
  } else {
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const head = clamp(Math.hypot(to.x - from.x, to.y - from.y) * 0.24, shape.width * 2.4, 90)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - head * Math.cos(angle - 0.42), to.y - head * Math.sin(angle - 0.42))
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - head * Math.cos(angle + 0.42), to.y - head * Math.sin(angle + 0.42))
    ctx.stroke()
  }
  ctx.restore()
}

export interface PreviewWindowProps {
  payloadId: string
}

export function PreviewWindow({ payloadId }: PreviewWindowProps) {
  const [payload] = useState(() => readPreviewPayload(payloadId))
  const [natural, setNatural] = useState<Size | null>(null)
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState<Tool>('pencil')
  const [color, setColor] = useState(COLORS[0])
  const [pinned, setPinned] = useState(true)
  const [maximized, setMaximized] = useState(false)
  const [count, setCount] = useState(0)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  /** 标注工具条可以收起：收起后连左键也变成平移，就是一块纯看图。 */
  const [toolsOpen, setToolsOpen] = useState(true)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shapesRef = useRef<Shape[]>([])
  const draftRef = useRef<Shape | null>(null)
  const penRef = useRef<{ pointerId: number; mode: 'draw' | 'pan'; x: number; y: number; left: number; top: number } | null>(null)
  const naturalRef = useRef<Size | null>(null)
  const zoomRef = useRef(1)
  const toolRef = useRef<Tool>('pencil')
  const colorRef = useRef(COLORS[0])
  const spaceRef = useRef(false)
  const toolsRef = useRef(true)
  const zoomAnchor = useRef<{ ix: number; iy: number; vx: number; vy: number } | null>(null)
  const fittedRef = useRef(false)

  naturalRef.current = natural
  zoomRef.current = zoom
  toolRef.current = tool
  colorRef.current = color
  spaceRef.current = spaceDown
  toolsRef.current = toolsOpen

  const view: Size | null = natural
    ? { w: Math.max(1, Math.round(natural.w * zoom)), h: Math.max(1, Math.round(natural.h * zoom)) }
    : null

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const size = naturalRef.current
    if (!canvas || !size) return
    const dpr = window.devicePixelRatio || 1
    const cssW = Math.max(1, Math.round(size.w * zoomRef.current))
    const cssH = Math.max(1, Math.round(size.h * zoomRef.current))
    const deviceW = Math.round(cssW * dpr)
    const deviceH = Math.round(cssH * dpr)
    if (canvas.width !== deviceW || canvas.height !== deviceH) {
      canvas.width = deviceW
      canvas.height = deviceH
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 画布坐标 = 图片像素坐标，缩放交给变换矩阵，标注因此永远贴着图片。
    ctx.setTransform(deviceW / size.w, 0, 0, deviceH / size.h, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    for (const shape of shapesRef.current) drawShape(ctx, shape)
    if (draftRef.current) drawShape(ctx, draftRef.current)
  }, [])

  useLayoutEffect(() => {
    paint()
  })

  // 主题跟着主面板走，两个窗口看起来才是一套东西。
  useEffect(() => {
    const settings = loadState()?.settings
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const resolve = () => {
      const mode = settings?.theme ?? 'light'
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.documentElement.dataset.accent = settings?.accent ?? 'sky'
      document.documentElement.style.setProperty('--glass-blur', `${6 + (settings?.frost ?? 62) * 0.38}px`)
      document.documentElement.style.setProperty('--glass-blur-soft', `${4 + (settings?.frost ?? 62) * 0.18}px`)
    }
    resolve()
    media.addEventListener('change', resolve)
    document.body.classList.toggle('is-desktop', isDesktop)
    return () => media.removeEventListener('change', resolve)
  }, [])

  useEffect(() => {
    return observeMaximized(setMaximized)
  }, [])

  // 图片加载完先按窗口大小适配一次。
  useEffect(() => {
    if (!natural || fittedRef.current) return
    const stage = stageRef.current
    if (!stage) return
    fittedRef.current = true
    const scale = Math.min(
      (stage.clientWidth - 28) / natural.w,
      (stage.clientHeight - 28) / natural.h,
    )
    setZoom(clamp(scale, MIN_ZOOM, 1))
  }, [natural])

  // 滚轮缩放时把光标下的那一点钉住不动。
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    const stage = stageRef.current
    if (!anchor || !stage) return
    zoomAnchor.current = null
    stage.scrollLeft = anchor.ix * zoom - anchor.vx
    stage.scrollTop = anchor.iy * zoom - anchor.vy
  }, [zoom])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpaceDown(true)
        if (event.target === document.body) event.preventDefault()
        return
      }
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key
      if (key === 'z') {
        event.preventDefault()
        undo()
      } else if (key === '=' || key === '+') {
        event.preventDefault()
        zoomBy(ZOOM_STEP)
      } else if (key === '-') {
        event.preventDefault()
        zoomBy(1 / ZOOM_STEP)
      } else if (key === '0') {
        event.preventDefault()
        setZoom(1)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  const undo = () => {
    if (shapesRef.current.length === 0) return
    shapesRef.current = shapesRef.current.slice(0, -1)
    setCount(shapesRef.current.length)
    paint()
  }

  const clearAll = () => {
    if (shapesRef.current.length === 0) return
    shapesRef.current = []
    setCount(0)
    paint()
  }

  const zoomBy = (factor: number) => {
    setZoom((value) => clamp(value * factor, MIN_ZOOM, MAX_ZOOM))
  }

  const fitToWindow = () => {
    const stage = stageRef.current
    if (!stage || !naturalRef.current) return
    const size = naturalRef.current
    const scale = Math.min((stage.clientWidth - 28) / size.w, (stage.clientHeight - 28) / size.h)
    setZoom(clamp(scale, MIN_ZOOM, MAX_ZOOM))
  }

  const pointFromEvent = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scale = zoomRef.current
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const size = naturalRef.current
    if (!size) return
    const canvas = event.currentTarget
    /*
      平移：右键、中键、空格 + 左键都可以。
      工具条收起时左键也让给平移——那时候是「纯看图」，不该再往图上画东西。
    */
    const wantsPan =
      event.button === 1 ||
      event.button === 2 ||
      spaceRef.current ||
      (event.button === 0 && !toolsRef.current)
    canvas.setPointerCapture(event.pointerId)
    if (wantsPan) {
      const stage = stageRef.current
      penRef.current = {
        pointerId: event.pointerId,
        mode: 'pan',
        x: event.clientX,
        y: event.clientY,
        left: stage?.scrollLeft ?? 0,
        top: stage?.scrollTop ?? 0,
      }
      setPanning(true)
      return
    }
    if (event.button !== 0) return
    const start = pointFromEvent(event.clientX, event.clientY)
    const width = strokeWidthFor(size)
    const nextTool = toolRef.current
    draftRef.current =
      nextTool === 'pencil'
        ? { tool: 'pencil', color: colorRef.current, width, points: [start, start] }
        : { tool: nextTool, color: colorRef.current, width, from: start, to: start }
    penRef.current = { pointerId: event.pointerId, mode: 'draw', x: 0, y: 0, left: 0, top: 0 }
    paint()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pen = penRef.current
    if (!pen || pen.pointerId !== event.pointerId) return
    if (pen.mode === 'pan') {
      const stage = stageRef.current
      if (!stage) return
      stage.scrollLeft = pen.left - (event.clientX - pen.x)
      stage.scrollTop = pen.top - (event.clientY - pen.y)
      return
    }
    const draft = draftRef.current
    if (!draft) return
    const point = pointFromEvent(event.clientX, event.clientY)
    if (draft.tool === 'pencil') {
      const last = draft.points[draft.points.length - 1]
      // 太密的点没必要记，长按涂鸦时能省不少内存。
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < draft.width * 0.35) return
      draft.points.push(point)
    } else {
      draft.to = point
    }
    paint()
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pen = penRef.current
    if (!pen || pen.pointerId !== event.pointerId) return
    penRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pen.mode === 'pan') {
      setPanning(false)
      return
    }
    const draft = draftRef.current
    draftRef.current = null
    if (draft) {
      shapesRef.current = [...shapesRef.current, draft]
      setCount(shapesRef.current.length)
    }
    paint()
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    /*
      滚轮直接缩放（以光标为中心）。按住 Shift 时不拦，
      留给滚动条自己去滚——放大之后想平移还有右键 / 中键 / 空格拖拽。
    */
    if (event.shiftKey || !naturalRef.current) return
    event.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const vx = event.clientX - rect.left
    const vy = event.clientY - rect.top
    const current = zoomRef.current
    const next = clamp(current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM)
    if (next === current) return
    zoomAnchor.current = {
      ix: (stage.scrollLeft + vx) / current,
      iy: (stage.scrollTop + vy) / current,
      vx,
      vy,
    }
    setZoom(next)
  }

  const title = payload?.name ?? '图片预览'

  if (!payload) {
    return (
      <div className="pv pv--empty">
        <p className="pv__empty-title">这张图片没有传过来</p>
        <p className="pv__empty-hint">回到主面板，重新点一下缩略图试试。</p>
        <NeuButton onClick={() => void closeWindow()}>关闭窗口</NeuButton>
      </div>
    )
  }

  return (
    <div
      className={`pv${panning ? ' is-panning' : ''}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* 整条标题栏都是拖动区：文件名留空时左侧同样能拖着窗口走。 */}
      <header className="pv__bar" data-tauri-drag-region="deep">
        <span className="pv__dot" aria-hidden="true" />
        <span className="pv__title" title={title}>
          {title}
        </span>
        {natural ? (
          <span className="pv__meta">
            {natural.w} × {natural.h}
          </span>
        ) : null}
        <span className="pv__grip" />
        {/* 缩放放在标题栏右侧、置顶左边：标注工具收起来之后这里也一直在。 */}
        <div className="pv__group pv__group--zoom">
          <NeuButton
            iconOnly
            size="sm"
            aria-label="缩小"
            title="缩小"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <IconZoomOut size={16} />
          </NeuButton>
          <button
            type="button"
            className="pv__zoom"
            title="点击回到 100%"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <NeuButton
            iconOnly
            size="sm"
            aria-label="放大"
            title="放大"
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <IconZoomIn size={16} />
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            aria-label="适应窗口"
            title="适应窗口"
            onClick={fitToWindow}
          >
            <IconFit size={16} />
          </NeuButton>
        </div>
        <span className="pv__rule" aria-hidden="true" />
        <NeuButton
          iconOnly
          size="sm"
          active={pinned}
          disabled={!isDesktop}
          aria-label="窗口置顶"
          title={pinned ? '取消置顶' : '窗口置顶'}
          onClick={() => {
            const next = !pinned
            setPinned(next)
            if (isDesktop) void applyAlwaysOnTop(next)
          }}
        >
          <IconPin size={16} />
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          disabled={!isDesktop}
          aria-label="最小化"
          title="最小化"
          onClick={() => void minimizeWindow()}
        >
          <IconMinus size={16} />
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          disabled={!isDesktop}
          aria-label={maximized ? '还原窗口' : '最大化'}
          title={maximized ? '还原窗口' : '最大化'}
          onClick={() => void toggleMaximizeWindow()}
        >
          {maximized ? <IconRestoreWindow size={15} /> : <IconMaximize size={15} />}
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          variant="danger"
          aria-label="关闭"
          title="关闭窗口"
          onClick={() => void closeWindow()}
        >
          <IconClose size={16} />
        </NeuButton>
      </header>

      <div className={`pv__tools${toolsOpen ? '' : ' is-collapsed'}`}>
        <NeuButton
          size="sm"
          className="pv__toggle"
          aria-expanded={toolsOpen}
          aria-controls="pv-tools"
          aria-label={toolsOpen ? '收起标注工具' : '展开标注工具'}
          title={toolsOpen ? '收起标注工具（收起后左键也用来平移）' : '展开标注工具'}
          onClick={() => setToolsOpen((open) => !open)}
        >
          {toolsOpen ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          <span className="pv__toggle-label">{toolsOpen ? '收起标注' : '标注工具'}</span>
        </NeuButton>

        {toolsOpen ? (
          <div className="pv__group" id="pv-tools" role="group" aria-label="标注工具">
            {TOOLS.map(({ key, label, Icon }) => (
              <NeuButton
                key={key}
                iconOnly
                size="sm"
                active={tool === key}
                aria-label={label}
                title={label}
                onClick={() => setTool(key)}
              >
                <Icon size={16} />
              </NeuButton>
            ))}
            <span className="pv__rule" aria-hidden="true" />
            {COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`pv__swatch${color === value ? ' is-active' : ''}`}
                style={{ background: value }}
                aria-label={`颜色 ${value}`}
                aria-pressed={color === value}
                title="标注颜色"
                onClick={() => setColor(value)}
              />
            ))}
            <span className="pv__rule" aria-hidden="true" />
            <NeuButton
              iconOnly
              size="sm"
              disabled={count === 0}
              aria-label="撤销上一笔"
              title="撤销上一笔（Ctrl+Z）"
              onClick={undo}
            >
              <IconUndo size={16} />
            </NeuButton>
            <NeuButton
              iconOnly
              size="sm"
              disabled={count === 0}
              aria-label="清空标注"
              title="清空全部标注"
              onClick={clearAll}
            >
              <IconEraser size={16} />
            </NeuButton>
          </div>
        ) : null}

        {/* 缩放控件在标题栏那边，这里只放标注相关的东西。 */}
        <span className="pv__spacer" />
      </div>

      <div className="pv__stage nm-scroll" ref={stageRef} onWheel={handleWheel}>
        <div
          className="pv__sheet"
          style={{ width: view?.w ?? 0, height: view?.h ?? 0 }}
        >
          <img
            className="pv__image"
            src={payload.src}
            alt={payload.name}
            draggable={false}
            onLoad={(event) =>
              setNatural({
                w: event.currentTarget.naturalWidth || 1,
                h: event.currentTarget.naturalHeight || 1,
              })
            }
          />
          <canvas
            ref={canvasRef}
            className="pv__ink"
            style={{ cursor: spaceDown || !toolsOpen ? 'grab' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
      </div>

      <footer className="pv__foot">
        <span>
          {toolsOpen
            ? `${TOOLS.find((item) => item.key === tool)?.label ?? ''} · 拖动左键画标注`
            : '纯看图 · 按住左键拖动即可平移'}
        </span>
        <span className="pv__spacer" />
        <span>滚轮缩放 · 右键 / 中键 / 空格拖拽平移 · 标题栏拖动窗口</span>
      </footer>
    </div>
  )
}
