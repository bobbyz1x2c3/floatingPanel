import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import tomatoSmall from '../../assets/tomato-small.png'
import tomatoBig from '../../assets/tomato-big.png'
import { TRAY_KIND_LABELS } from '../lib/types'
import type { TrayTool } from '../lib/types'
import { NeuButton } from './controls'
import { IconClose } from './icons'

export interface TomatoDragPayload {
  minutes: number
  label: string
}

export interface TomatoBarProps {
  shortMinutes: number
  longMinutes: number
  /** 正在跑的番茄钟：显示剩余时间和取消按钮。 */
  runningLabel: string | null
  runningClock: string | null
  /** 托盘上的快捷方式。 */
  tools: TrayTool[]
  onRunTool: (tool: TrayTool) => void
  onEditTools: () => void
  onCancel: () => void
  /** 拖着番茄经过某张卡片（null = 不在任何卡片上），用来高亮目标。 */
  onHoverCard: (cardId: string | null) => void
  /** 松手时落在某张卡片上。 */
  onDropOnCard: (cardId: string, tomato: TomatoDragPayload) => void
  /** 松手时没落在卡片上。 */
  onDropNothing: () => void
}

function cardIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return (el?.closest('[data-card-id]') as HTMLElement | null)?.dataset.cardId ?? null
}

/**
 * 一颗可以拖到卡片上的番茄。
 *
 * 这里**不用 HTML5 拖放**：桌面端窗口为了接住系统拖进来的文件，开着 dragDropEnabled，
 * 真实鼠标拖拽会被系统那层吃掉，DOM 的 dragstart/drop 根本不来（合成事件却会来，
 * 所以自动化测试反而是绿的）。改成 pointer 事件自己实现，顺带能做跟手的拖影和目标高亮。
 */
function Tomato({
  src,
  minutes,
  label,
  small,
  onHoverCard,
  onDropOnCard,
  onDropNothing,
}: {
  src: string
  minutes: number
  label: string
  small?: boolean
  onHoverCard: (cardId: string | null) => void
  onDropOnCard: (cardId: string, tomato: TomatoDragPayload) => void
  onDropNothing: () => void
}) {
  const hoverRef = useRef<string | null>(null)
  const draggingRef = useRef(false)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    hoverRef.current = null
    setGhost({ x: event.clientX, y: event.clientY })
  }

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    setGhost({ x: event.clientX, y: event.clientY })
    const id = cardIdAt(event.clientX, event.clientY)
    if (id !== hoverRef.current) {
      hoverRef.current = id
      onHoverCard(id)
    }
  }

  const handleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setGhost(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const id = hoverRef.current
    hoverRef.current = null
    onHoverCard(null)
    if (id) onDropOnCard(id, { minutes, label })
    else onDropNothing()
  }

  return (
    <>
      <div
        className={`tomato${ghost ? ' is-dragging' : ''}`}
        title={`按住拖到某张卡片上，开始 ${minutes} 分钟`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        <img className={`tomato__img${small ? ' is-small' : ''}`} src={src} alt="" draggable={false} />
        <span className="tomato__text">
          <b>{label}</b>
          <em>{minutes} 分钟</em>
        </span>
      </div>
      {ghost ? (
        <div className="tomato-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <img src={src} alt="" draggable={false} />
          <span>{minutes}′</span>
        </div>
      ) : null}
    </>
  )
}

/**
 * 界面下方的浮动托盘：两颗可以拖到卡片上的番茄，右侧挂自定义的快捷方式，
 * 计时中时再显示剩余时间和取消。
 */
export function TomatoBar({
  shortMinutes,
  longMinutes,
  runningLabel,
  runningClock,
  tools,
  onRunTool,
  onEditTools,
  onCancel,
  onHoverCard,
  onDropOnCard,
  onDropNothing,
}: TomatoBarProps) {
  const tomatoProps = { onHoverCard, onDropOnCard, onDropNothing }

  return (
    <div className="tomatoes" role="group" aria-label="番茄钟与工具">
      <Tomato src={tomatoSmall} minutes={shortMinutes} label="小番茄" small {...tomatoProps} />
      <Tomato src={tomatoBig} minutes={longMinutes} label="大番茄" {...tomatoProps} />

      {tools.length > 0 ? (
        <>
          <span className="tomatoes__rule" aria-hidden="true" />
          <div className="tray-tools">
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="tray-tool"
                title={`${tool.label} · ${TRAY_KIND_LABELS[tool.kind]}`}
                aria-label={tool.label}
                onClick={() => onRunTool(tool)}
              >
                <span className="tray-tool__icon" aria-hidden="true">
                  {tool.icon}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="tray-tool tray-tool--ghost"
              title="在设置里管理托盘工具"
              aria-label="管理托盘工具"
              onClick={onEditTools}
            >
              <span className="tray-tool__icon" aria-hidden="true">
                ＋
              </span>
            </button>
          </div>
        </>
      ) : null}

      {runningClock ? (
        <>
          <span className="tomatoes__rule" aria-hidden="true" />
          <span className="tomatoes__running" title={`${runningLabel} 进行中`}>
            <img className="tomato__img is-small" src={tomatoSmall} alt="" aria-hidden="true" />
            {runningClock}
          </span>
          <NeuButton size="sm" aria-label="取消番茄钟" title="取消这个番茄钟" onClick={onCancel}>
            <IconClose size={14} />
            取消
          </NeuButton>
        </>
      ) : tools.length === 0 ? (
        <span className="tomatoes__hint">拖到卡片上开始计时</span>
      ) : null}
    </div>
  )
}
