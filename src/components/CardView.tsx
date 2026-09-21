import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatRelative } from '../lib/format'
import { snapValue } from '../lib/store'
import { CARD_MIN_HEIGHT, CARD_MIN_WIDTH, TONE_LABELS } from '../lib/types'
import type { CardData } from '../lib/types'
import { NeuButton } from './controls'
import { IconChevronDown, IconChevronUp, IconPalette, IconPin, IconResize, IconTrash } from './icons'

export interface CardViewProps {
  card: CardData
  active: boolean
  dimmed: boolean
  matched: boolean
  snap: boolean
  now: number
  onChange: (patch: Partial<CardData>, touch?: boolean) => void
  onBringToFront: () => void
  onRemove: () => void
  onCycleTone: () => void
  onTogglePin: () => void
}

interface DragOrigin {
  pointerX: number
  pointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

type Gesture = 'idle' | 'drag' | 'resize'

export function CardView({
  card,
  active,
  dimmed,
  matched,
  snap,
  now,
  onChange,
  onBringToFront,
  onRemove,
  onCycleTone,
  onTogglePin,
}: CardViewProps) {
  const originRef = useRef<DragOrigin | null>(null)
  const [gesture, setGesture] = useState<Gesture>('idle')
  const latest = useRef({ onChange, snap })

  useEffect(() => {
    latest.current = { onChange, snap }
  })

  useEffect(() => {
    if (gesture === 'idle') return

    const handleMove = (event: PointerEvent) => {
      const origin = originRef.current
      if (!origin) return
      const { onChange: change, snap: snapping } = latest.current
      const deltaX = event.clientX - origin.pointerX
      const deltaY = event.clientY - origin.pointerY

      if (gesture === 'drag') {
        change(
          {
            x: Math.max(-600, snapValue(origin.startX + deltaX, snapping)),
            y: Math.max(-600, snapValue(origin.startY + deltaY, snapping)),
          },
          false,
        )
        return
      }

      change(
        {
          width: Math.max(CARD_MIN_WIDTH, snapValue(origin.startWidth + deltaX, snapping)),
          height: Math.max(CARD_MIN_HEIGHT, snapValue(origin.startHeight + deltaY, snapping)),
        },
        false,
      )
    }

    const finish = () => {
      originRef.current = null
      setGesture('idle')
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    document.documentElement.dataset.gesture = gesture

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      delete document.documentElement.dataset.gesture
    }
  }, [gesture])

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, next: Gesture) => {
    if (event.button !== 0) return
    originRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: card.x,
      startY: card.y,
      startWidth: card.width,
      startHeight: card.height,
    }
    setGesture(next)
    onBringToFront()
  }

  const handleHeadPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, textarea')) return
    beginGesture(event, 'drag')
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    beginGesture(event, 'resize')
  }

  const classes = [
    'card',
    active && 'is-front',
    gesture === 'drag' && 'is-dragging',
    gesture === 'resize' && 'is-resizing',
    card.collapsed && 'is-collapsed',
    dimmed && 'is-dimmed',
    matched && 'is-match',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={classes}
      data-tone={card.tone}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.collapsed ? undefined : card.height,
        zIndex: card.pinned ? 20000 + card.z : card.z,
      }}
      onPointerDown={onBringToFront}
    >
      <div className="card__head" onPointerDown={handleHeadPointerDown}>
        <span className="card__dot" aria-hidden="true" />
        <input
          className="card__title"
          value={card.title}
          aria-label="卡片标题"
          spellCheck={false}
          onChange={(event) => onChange({ title: event.target.value })}
          onPointerDown={(event) => {
            event.stopPropagation()
            onBringToFront()
          }}
        />
        <div className="card__actions">
          <NeuButton
            iconOnly
            size="sm"
            active={card.pinned}
            title={card.pinned ? '取消置顶' : '置顶卡片'}
            aria-label={card.pinned ? '取消置顶' : '置顶卡片'}
            onClick={() => {
              onBringToFront()
              onTogglePin()
            }}
          >
            <IconPin size={15} />
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            title={card.collapsed ? '展开卡片' : '收起卡片'}
            aria-label={card.collapsed ? '展开卡片' : '收起卡片'}
            onClick={() => {
              onBringToFront()
              onChange({ collapsed: !card.collapsed })
            }}
          >
            {card.collapsed ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            title="切换配色"
            aria-label="切换配色"
            onClick={onCycleTone}
          >
            <IconPalette size={15} />
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            variant="danger"
            title="删除卡片"
            aria-label="删除卡片"
            onClick={onRemove}
          >
            <IconTrash size={15} />
          </NeuButton>
        </div>
      </div>

      <div className="card__body">
        <textarea
          className="card__text"
          value={card.body}
          aria-label="卡片内容"
          placeholder="写点什么…"
          spellCheck={false}
          onChange={(event) => onChange({ body: event.target.value })}
          onPointerDown={onBringToFront}
        />
      </div>

      <div className="card__foot">
        <span>{TONE_LABELS[card.tone]}</span>
        <span>{formatRelative(card.updatedAt, now)}</span>
      </div>

      <span
        className="card__resize"
        title="调整大小"
        role="presentation"
        onPointerDown={handleResizePointerDown}
      >
        <IconResize size={14} />
      </span>
    </article>
  )
}
