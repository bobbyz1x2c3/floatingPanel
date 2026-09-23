import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { QUADRANTS, QUADRANT_META } from '../lib/types'
import type { Attachment, CardData, ZoneSize } from '../lib/types'
import { CardView } from './CardView'
import { IconLayers } from './icons'

/** 画布在最后一张卡片之外多留的余量，方便把卡片拖到边缘外一点。 */
const EDGE_SLACK = 24

export interface BoardProps {
  cards: CardData[]
  activeId: string | null
  query: string
  snap: boolean
  showGrid: boolean
  zone: ZoneSize
  dropTargetId: string | null
  now: number
  boardRef: RefObject<HTMLDivElement | null>
  onAddAt: (x: number, y: number) => void
  onUpdate: (id: string, patch: Partial<CardData>, touch?: boolean) => void
  onFocus: (id: string) => void
  onRemove: (id: string) => void
  onArchive: (id: string) => void
  onComplete: (cardId: string) => void
  onPreview: (attachment: Attachment) => void
  onNotify: (message: string) => void
  onBlurBoard: () => void
  /** 正在「整理」：卡片换位置时走过渡。 */
  moving?: boolean
  /** 正在跑番茄钟的卡片 id。 */
  timingId?: string | null
}

function matchesQuery(card: CardData, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    card.title.toLowerCase().includes(needle) ||
    card.body.toLowerCase().includes(needle) ||
    card.attachments.some((item) => item.name.toLowerCase().includes(needle))
  )
}

export function Board({
  cards,
  activeId,
  query,
  snap,
  showGrid,
  zone,
  dropTargetId,
  now,
  boardRef,
  onAddAt,
  onUpdate,
  onFocus,
  onRemove,
  onArchive,
  onComplete,
  onPreview,
  onNotify,
  onBlurBoard,
  moving = false,
  timingId = null,
}: BoardProps) {
  // 画布至少铺满窗口（正好两格宽、两格高），卡片堆到外面时再撑大。
  const bounds = useMemo(() => {
    let width = zone.width * 2
    let height = zone.height * 2
    for (const card of cards) {
      const cardHeight = card.collapsed ? 78 : card.height
      // 只留一点点余量：留多了会让画布平白比可视区宽，无端多出一条滚动条。
      width = Math.max(width, card.x + card.width + EDGE_SLACK)
      height = Math.max(height, card.y + cardHeight + EDGE_SLACK)
    }
    return { width, height }
  }, [cards, zone])

  const filtered = query.trim().length > 0

  /*
    记一下「哪些卡片是刚出现的」：首屏那一批交给依次落下的入场动效，
    之后新加的（双击、拖入、从归档恢复、CLI 加进来）走展开动效。
  */
  const knownIds = useRef<Set<string>>(new Set())
  const seenFirstBatch = useRef(false)
  /** 首屏那批：依次落下的入场动效。 */
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set())
  /** 之后新增的：从鼠标落点展开出来。 */
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const known = knownIds.current
    const alive = new Set(cards.map((card) => card.id))
    for (const id of [...known]) if (!alive.has(id)) known.delete(id)
    const added = cards.filter((card) => !known.has(card.id)).map((card) => card.id)
    for (const id of added) known.add(id)
    if (!seenFirstBatch.current) {
      seenFirstBatch.current = true
      if (added.length === 0) return
      setEnteringIds(new Set(added))
      const first = window.setTimeout(() => setEnteringIds(new Set()), 1000)
      return () => window.clearTimeout(first)
    }
    if (added.length === 0) return
    setFreshIds(new Set(added))
    const timer = window.setTimeout(() => setFreshIds(new Set()), 700)
    return () => window.clearTimeout(timer)
  }, [cards])
  const matchCount = useMemo(
    () => cards.filter((card) => matchesQuery(card, query)).length,
    [cards, query],
  )

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const card of cards) map.set(card.quadrant, (map.get(card.quadrant) ?? 0) + 1)
    return map
  }, [cards])

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    onAddAt(event.clientX - rect.left, event.clientY - rect.top)
  }

  return (
    <div className="board nm-scroll" ref={boardRef}>
      <div
        className={`board-canvas${showGrid ? ' is-grid' : ''}`}
        style={{ width: bounds.width, height: bounds.height }}
        onDoubleClick={handleDoubleClick}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onBlurBoard()
        }}
      >
        <div className="zones" aria-hidden="true">
          {QUADRANTS.map((key) => {
            const meta = QUADRANT_META[key]
            return (
              <div
                key={key}
                className="zone"
                data-tone={meta.tone}
                style={{
                  left: meta.column * zone.width,
                  top: meta.row * zone.height,
                  width: zone.width,
                  height: zone.height,
                }}
              >
                <span className="zone__panel" />
                <span className="zone__head">
                  <span className="zone__dot" />
                  <span className="zone__title">{meta.title}</span>
                  <span className="zone__count">{counts.get(key) ?? 0}</span>
                  <span className="zone__hint">
                    {meta.position} · {meta.hint}
                  </span>
                </span>
              </div>
            )
          })}
          <span
            className="zones__divider zones__divider--v"
            style={{ left: zone.width }}
          />
          <span
            className="zones__divider zones__divider--h"
            style={{ top: zone.height }}
          />
        </div>

        {/*
          刻意按 state 里的原始顺序渲染：z-index 已经决定了叠放层次，
          如果按 z 排序，focus 时 React 会移动卡片节点，pointerdown/click 就会被拆散。
        */}
        {cards.map((card, index) => (
          <CardView
            key={card.id}
            card={card}
            enterIndex={index}
            active={activeId === card.id}
            dimmed={filtered && !matchesQuery(card, query)}
            matched={filtered && matchesQuery(card, query)}
            dropTarget={dropTargetId === card.id}
            snap={snap}
            zone={zone}
            now={now}
            onChange={(patch, touch) => onUpdate(card.id, patch, touch)}
            onBringToFront={() => onFocus(card.id)}
            onRemove={() => onRemove(card.id)}
            onArchive={() => onArchive(card.id)}
            onComplete={onComplete}
            onPreview={onPreview}
            onNotify={onNotify}
            moving={moving}
            isNew={freshIds.has(card.id)}
            entering={enteringIds.has(card.id)}
            timing={timingId === card.id}
          />
        ))}

        {cards.length === 0 ? (
          <div className="empty">
            <span className="empty__badge">
              <IconLayers size={34} />
            </span>
            <p className="empty__title">还没有卡片</p>
            <p className="empty__hint">
              在空白处双击就能新建卡片，卡片会落到双击所在的象限里。
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
