import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import tomatoSmall from '../../assets/tomato-small.png'
import tomatoBig from '../../assets/tomato-big.png'
import { TRAY_KIND_LABELS } from '../lib/types'
import type { TrayTool } from '../lib/types'
import { IconClose, IconPlus } from './icons'
import { IconFocus } from './focusIcons'

export interface TomatoDragPayload {
  minutes: number
  label: string
}

export interface TomatoBarProps {
  shortMinutes: number
  longMinutes: number
  /** 是否有番茄钟正在运行：只决定是否显示取消按钮。 */
  isRunning: boolean
  tools: TrayTool[]
  showPomodoro: boolean
  showTools: boolean
  align: 'center' | 'left' | 'right'
  onRunTool: (tool: TrayTool) => void
  onEditTools: () => void
  onCancel: () => void
  onEnterFocus: () => void
  onHoverCard: (cardId: string | null) => void
  onDropOnCard: (cardId: string, tomato: TomatoDragPayload) => void
  onDropNothing: () => void
}

/** 面板里的圆形按钮：托盘的统一手感，图标是 emoji 或者图片。 */
export function TrayButton({
  label,
  onClick,
  children,
  tone,
  size = 'md',
  active = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  tone?: 'tomato' | 'ghost'
  size?: 'md' | 'lg'
  active?: boolean
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={`tray-btn${tone ? ` tray-btn--${tone}` : ''}${size === 'lg' ? ' is-lg' : ''}${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </button>
  )
}

function cardIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return (el?.closest('[data-card-id]') as HTMLElement | null)?.dataset.cardId ?? null
}

/**
 * 一颗可以拖到卡片上的番茄（圆形按钮）。
 *
 * 这里**不用 HTML5 拖放**：桌面端窗口为了接住系统拖进来的文件，开着 dragDropEnabled，
 * 真实鼠标拖拽会被系统那层吃掉，DOM 的 dragstart/drop 根本不来（合成事件却会来，
 * 所以自动化测试反而是绿的）。改成 pointer 事件自己实现，顺带能做跟手的拖影和目标高亮。
 */
function TomatoButton({
  src,
  minutes,
  label,
  onHoverCard,
  onDropOnCard,
  onDropNothing,
}: {
  src: string
  minutes: number
  label: string
  onHoverCard: (cardId: string | null) => void
  onDropOnCard: (cardId: string, tomato: TomatoDragPayload) => void
  onDropNothing: () => void
}) {
  const hoverRef = useRef<string | null>(null)
  const draggingRef = useRef(false)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)

  const handleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    hoverRef.current = null
    setGhost({ x: event.clientX, y: event.clientY })
  }

  const handleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    setGhost({ x: event.clientX, y: event.clientY })
    const id = cardIdAt(event.clientX, event.clientY)
    if (id !== hoverRef.current) {
      hoverRef.current = id
      onHoverCard(id)
    }
  }

  const handleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
      <TrayButton
        label={`${label} ${minutes} 分钟 · 按住拖到某张卡片上开始计时`}
        tone="tomato"
        size="lg"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
      >
        <img src={src} alt="" draggable={false} />
      </TrayButton>
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
 * 界面下方那块浮动面板：圆形按钮排成一排——
 * 番茄（按住拖到卡片上开始计时）、自定义工具、末尾一个「＋」跳去设置，
 * 计时中时末尾多一个取消按钮。
 */
export function TomatoBar({
  shortMinutes,
  longMinutes,
  isRunning,
  tools,
  showPomodoro,
  showTools,
  align,
  onRunTool,
  onEditTools,
  onCancel,
  onEnterFocus,
  onHoverCard,
  onDropOnCard,
  onDropNothing,
}: TomatoBarProps) {
  const hasTools = showTools && tools.length > 0

  return (
    <div className={`tray tray--${align}`} role="group" aria-label="番茄钟与工具">
      <div className="tray__inner">
        {showPomodoro ? (
          <TomatoButton
            src={tomatoSmall}
            minutes={shortMinutes}
            label="小番茄"
            onHoverCard={onHoverCard}
            onDropOnCard={onDropOnCard}
            onDropNothing={onDropNothing}
          />
        ) : null}
        {showPomodoro ? (
          <TomatoButton
            src={tomatoBig}
            minutes={longMinutes}
            label="大番茄"
            onHoverCard={onHoverCard}
            onDropOnCard={onDropOnCard}
            onDropNothing={onDropNothing}
          />
        ) : null}

        {showPomodoro && (hasTools || showTools) ? (
          <span className="tray__rule" aria-hidden="true" />
        ) : null}

        <TrayButton label="进入专注模式" tone="ghost" onClick={onEnterFocus}>
          <IconFocus size={18} />
        </TrayButton>

        {hasTools
          ? tools.map((tool) => (
              <TrayButton
                key={tool.id}
                label={`${tool.label} · ${TRAY_KIND_LABELS[tool.kind]}`}
                onClick={() => onRunTool(tool)}
              >
                <span className="tray-btn__emoji">{tool.icon}</span>
              </TrayButton>
            ))
          : null}

        {showTools ? (
          <TrayButton label="在设置里配置这个面板" tone="ghost" onClick={onEditTools}>
            <IconPlus size={18} />
          </TrayButton>
        ) : null}

        {isRunning ? (
          <>
            <span className="tray__rule" aria-hidden="true" />
            <TrayButton label="取消番茄钟" tone="ghost" onClick={onCancel}>
              <IconClose size={16} />
            </TrayButton>
          </>
        ) : null}

      </div>
    </div>
  )
}
