import { useMemo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { CardData } from '../lib/types'
import { CardView } from './CardView'
import { IconLayers } from './icons'

export interface BoardProps {
  cards: CardData[]
  activeId: string | null
  query: string
  snap: boolean
  showGrid: boolean
  now: number
  onAddAt: (x: number, y: number) => void
  onUpdate: (id: string, patch: Partial<CardData>, touch?: boolean) => void
  onFocus: (id: string) => void
  onRemove: (id: string) => void
  onCycleTone: (id: string) => void
  onTogglePin: (id: string) => void
  onBlurBoard: () => void
}

function matchesQuery(card: CardData, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    card.title.toLowerCase().includes(needle) || card.body.toLowerCase().includes(needle)
  )
}

export function Board({
  cards,
  activeId,
  query,
  snap,
  showGrid,
  now,
  onAddAt,
  onUpdate,
  onFocus,
  onRemove,
  onCycleTone,
  onTogglePin,
  onBlurBoard,
}: BoardProps) {
  const bounds = useMemo(() => {
    let width = 0
    let height = 0
    for (const card of cards) {
      const cardHeight = card.collapsed ? 74 : card.height
      width = Math.max(width, card.x + card.width + 48)
      height = Math.max(height, card.y + cardHeight + 48)
    }
    return { width: Math.max(width, 360), height: Math.max(height, 260) }
  }, [cards])

  const ordered = useMemo(() => [...cards].sort((a, b) => a.z - b.z), [cards])
  const filtered = query.trim().length > 0
  const matchCount = useMemo(
    () => cards.filter((card) => matchesQuery(card, query)).length,
    [cards, query],
  )

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    onAddAt(event.clientX - rect.left - 60, event.clientY - rect.top - 24)
  }

  return (
    <div className="board nm-scroll">
      <div
        className={`board-canvas${showGrid ? ' is-grid' : ''}`}
        style={{ width: bounds.width, height: bounds.height }}
        onDoubleClick={handleDoubleClick}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onBlurBoard()
        }}
      >
        {ordered.map((card) => (
          <CardView
            key={card.id}
            card={card}
            active={activeId === card.id}
            dimmed={filtered && !matchesQuery(card, query)}
            matched={filtered && matchesQuery(card, query)}
            snap={snap}
            now={now}
            onChange={(patch, touch) => onUpdate(card.id, patch, touch)}
            onBringToFront={() => onFocus(card.id)}
            onRemove={() => onRemove(card.id)}
            onCycleTone={() => onCycleTone(card.id)}
            onTogglePin={() => onTogglePin(card.id)}
          />
        ))}

        {cards.length === 0 ? (
          <div className="empty">
            <span className="empty__badge">
              <IconLayers size={34} />
            </span>
            <p className="empty__title">还没有卡片</p>
            <p className="empty__hint">
              点击上方「新建卡片」，或在空白处双击，即可放下一张新的悬浮卡片。
            </p>
          </div>
        ) : null}

        {filtered && matchCount === 0 && cards.length > 0 ? (
          <div className="empty">
            <span className="empty__badge">
              <IconLayers size={34} />
            </span>
            <p className="empty__title">没有匹配的卡片</p>
            <p className="empty__hint">换一个关键词，或清空搜索框查看全部卡片。</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
