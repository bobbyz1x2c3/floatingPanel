import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { MAX_ATTACHMENTS, fileToAttachment, mergeAttachments } from '../lib/attachments'
import { formatDateTime, formatFileSize, formatStamp } from '../lib/format'
import { caretIndexFromPoint, findLinkAt, listLinks } from '../lib/links'
import { openModifier, openTarget } from '../lib/platform'
import { snapValue } from '../lib/store'
import {
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  QUADRANT_META,
  quadrantFromPoint,
} from '../lib/types'
import type { Attachment, CardData, ZoneSize } from '../lib/types'
import { NeuButton } from './controls'
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconExternal,
  IconFile,
  IconLink,
  IconTrash,
} from './icons'

export interface CardViewProps {
  card: CardData
  active: boolean
  dimmed: boolean
  matched: boolean
  dropTarget: boolean
  snap: boolean
  zone: ZoneSize
  now: number
  onChange: (patch: Partial<CardData>, touch?: boolean) => void
  onBringToFront: () => void
  onRemove: () => void
  onArchive: () => void
  onComplete: () => void
  onPreview: (attachment: Attachment) => void
  onNotify: (message: string) => void
  /** 在列表里的序号：用来给入场动效排队，一叠卡片依次落下来。 */
  enterIndex?: number
  /** 正在「整理」：这时候卡片换位置要走过渡，而不是瞬移。 */
  moving?: boolean
  /** 刚新建出来的卡片：播一个展开动效。 */
  isNew?: boolean
  /** 首屏那批：播依次落下的入场动效。 */
  entering?: boolean
  /** 这张卡片上正在跑番茄钟：高亮一下。 */
  timing?: boolean
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

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/** 归档动效时长，和 app.css 里的 card-archive 动画保持一致。 */
const ARCHIVE_ANIMATION = 460
/** 删除动效时长，和 app.css 里的 card-out 保持一致。 */
const REMOVE_ANIMATION = 220
/** 收起后的高度，和 app.css 里 .card__head 的实际高度对应（收起时卡片就只剩标题栏）。 */
const COLLAPSED_HEIGHT = 58
/** 收起 / 展开的过渡时长，和 app.css 里的 is-toggling 一致。 */
const TOGGLE_ANIMATION = 280

function hasOpenModifier(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey
}

export function CardView({
  card,
  active,
  dimmed,
  matched,
  dropTarget,
  snap,
  zone,
  now,
  onChange,
  onBringToFront,
  onRemove,
  onArchive,
  onComplete,
  onPreview,
  onNotify,
  enterIndex = 0,
  moving = false,
  isNew = false,
  entering = false,
  timing = false,
}: CardViewProps) {
  const originRef = useRef<DragOrigin | null>(null)
  const edgeRef = useRef<ResizeEdge | null>(null)
  const archiveTimer = useRef<number | null>(null)
  const movedRef = useRef(false)
  const pendingFocus = useRef<{ field: HTMLInputElement; clientX: number; clientY: number } | null>(
    null,
  )
  const [gesture, setGesture] = useState<Gesture>('idle')
  const [archiving, setArchiving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const latest = useRef({ onChange, snap, card, zone })

  useEffect(() => {
    latest.current = { onChange, snap, card, zone }
  })

  useEffect(() => {
    return () => {
      if (archiveTimer.current !== null) window.clearTimeout(archiveTimer.current)
    }
  }, [])

  useEffect(() => {
    const clearDrop = () => setDropActive(false)
    window.addEventListener('drop', clearDrop)
    window.addEventListener('dragend', clearDrop)
    return () => {
      window.removeEventListener('drop', clearDrop)
      window.removeEventListener('dragend', clearDrop)
    }
  }, [])

  useEffect(() => {
    if (gesture === 'idle') return

    const handleMove = (event: PointerEvent) => {
      const origin = originRef.current
      if (!origin) return
      const deltaX = event.clientX - origin.pointerX
      const deltaY = event.clientY - origin.pointerY

      if (gesture === 'drag') {
        const { onChange: change, snap: snapping, card: current, zone: area } = latest.current
        const x = Math.max(-600, snapValue(origin.startX + deltaX, snapping))
        const y = Math.max(-600, snapValue(origin.startY + deltaY, snapping))
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) movedRef.current = true
        const patch: Partial<CardData> = { x, y }
        const next = quadrantFromPoint(x + current.width / 2, y + current.height / 2, area)
        if (next !== current.quadrant) patch.quadrant = next
        change(patch, false)
        return
      }

      const edge = edgeRef.current
      if (!edge) return
      const { onChange: change, snap: snapping } = latest.current
      let x = origin.startX
      let y = origin.startY
      let width = origin.startWidth
      let height = origin.startHeight

      if (edge.includes('e')) width = snapValue(origin.startWidth + deltaX, snapping)
      if (edge.includes('s')) height = snapValue(origin.startHeight + deltaY, snapping)
      if (edge.includes('w')) {
        x = snapValue(origin.startX + deltaX, snapping)
        width = origin.startX + origin.startWidth - x
      }
      if (edge.includes('n')) {
        y = snapValue(origin.startY + deltaY, snapping)
        height = origin.startY + origin.startHeight - y
      }

      // 拖过头的方向要让对面那条边钉住，所以改尺寸的同时要回推 x / y。
      if (width < CARD_MIN_WIDTH) {
        width = CARD_MIN_WIDTH
        if (edge.includes('w')) x = origin.startX + origin.startWidth - width
      }
      if (height < CARD_MIN_HEIGHT) {
        height = CARD_MIN_HEIGHT
        if (edge.includes('n')) y = origin.startY + origin.startHeight - height
      }
      if (width > CARD_MAX_WIDTH) {
        width = CARD_MAX_WIDTH
        if (edge.includes('w')) x = origin.startX + origin.startWidth - width
      }
      if (height > CARD_MAX_HEIGHT) {
        height = CARD_MAX_HEIGHT
        if (edge.includes('n')) y = origin.startY + origin.startHeight - height
      }

      change({ x, y, width, height }, false)
    }

    const finish = () => {
      const pending = pendingFocus.current
      pendingFocus.current = null
      // 标题栏既是拖动手柄也是输入框：没拖动就当作一次普通的点击落光标。
      if (pending && !movedRef.current) {
        const index = caretIndexFromPoint(pending.field, pending.clientX, pending.clientY)
        pending.field.focus()
        if (index >= 0) pending.field.setSelectionRange(index, index)
      }
      originRef.current = null
      edgeRef.current = null
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
    movedRef.current = false
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
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    const field = target.closest('input')
    if (field) {
      // 拦掉默认的聚焦/选中，松手时再决定是落光标还是完成拖动。
      event.preventDefault()
      pendingFocus.current = {
        field: field as HTMLInputElement,
        clientX: event.clientX,
        clientY: event.clientY,
      }
    } else {
      pendingFocus.current = null
    }
    edgeRef.current = null
    beginGesture(event, 'drag')
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLSpanElement>, edge: ResizeEdge) => {
    // 页面上如果已经有文本选区，不拦掉默认行为的话浏览器会开始一次原生拖放，
    // 指针序列会被 dragstart 打断，缩放就只走了一步。
    event.preventDefault()
    event.stopPropagation()
    pendingFocus.current = null
    edgeRef.current = edge
    beginGesture(event, 'resize')
  }

  const ingest = async (files: File[]) => {
    const picked = files.slice(0, MAX_ATTACHMENTS)
    const created = await Promise.all(picked.map(fileToAttachment))
    const list = created.filter((item): item is Attachment => item !== null)
    if (list.length === 0) {
      onNotify('这些文件没办法作为附件添加')
      return
    }
    onChange({ attachments: mergeAttachments(card.attachments, list) })
    const images = list.filter((item) => item.kind === 'image').length
    if (images === list.length) onNotify(`已添加 ${images} 张图片`)
    else if (images === 0) onNotify(`已添加 ${list.length} 个文件链接`)
    else onNotify(`已添加 ${list.length} 个附件（含 ${images} 张图片）`)
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    void ingest(files)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDropActive(false)
  }

  const handleArchive = () => {
    if (archiving) return
    // 音效跟着点击走，不等归档动效播完。
    onComplete()
    setArchiving(true)
    archiveTimer.current = window.setTimeout(() => onArchive(), ARCHIVE_ANIMATION)
  }

  /** 收起 / 展开：临时挂一个类，让高度这段变化走过渡（平时高度是跟手拖的，不能有过渡）。 */
  const handleToggleCollapse = () => {
    onBringToFront()
    setToggling(true)
    onChange({ collapsed: !card.collapsed })
    archiveTimer.current = window.setTimeout(() => setToggling(false), TOGGLE_ANIMATION)
  }

  /** 删除也先播一下缩小淡出，不然卡片会凭空消失。 */
  const handleRemove = () => {
    if (removing || archiving) return
    setRemoving(true)
    archiveTimer.current = window.setTimeout(() => onRemove(), REMOVE_ANIMATION)
  }

  const links = useMemo(() => listLinks(card.body), [card.body])

  const openHref = (href: string) => {
    void openTarget(href).then((opened) => {
      if (!opened) onNotify('没有找到可以打开它的程序')
    })
  }

  const handleTextClick = (event: ReactMouseEvent<HTMLTextAreaElement>) => {
    if (!hasOpenModifier(event)) return
    const index = caretIndexFromPoint(event.currentTarget, event.clientX, event.clientY)
    if (index < 0) return
    const link = findLinkAt(card.body, index)
    if (!link?.href) return
    event.preventDefault()
    openHref(link.href)
  }

  const handleAttachmentOpen = (attachment: Attachment) => {
    if (attachment.kind === 'image') {
      onPreview(attachment)
      return
    }
    if (!attachment.src) {
      onNotify('浏览器模式下拿不到本地文件，请在桌面端打开')
      return
    }
    openHref(attachment.src)
  }

  const area = QUADRANT_META[card.quadrant]

  const classes = [
    'card',
    active && 'is-front',
    gesture === 'drag' && 'is-dragging',
    gesture === 'resize' && 'is-resizing',
    card.collapsed && 'is-collapsed',
    dimmed && 'is-dimmed',
    matched && 'is-match',
    timing && 'is-timing',
    archiving && 'is-archiving',
    removing && 'is-removing',
    toggling && 'is-toggling',
    moving && 'is-moving',
    isNew && 'is-new',
    entering && 'is-entering',
    gesture === 'drag' && snap && 'is-snapping',
    (dropActive || dropTarget) && 'is-drop',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={classes}
      data-tone={card.tone}
      data-card-id={card.id}
      data-zone={card.quadrant}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        // 显式给高度（收起时是标题栏那一档），这样收起 / 展开才有得过渡。
        height: card.collapsed ? COLLAPSED_HEIGHT : card.height,
        zIndex: card.z,
        ['--enter-delay']: `${Math.min(enterIndex, 11) * 26}ms`,
      } as CSSProperties}
      onPointerDown={onBringToFront}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="card__head" onPointerDown={handleHeadPointerDown}>
        <span className="card__dot" title={`${area.position} · ${area.title}`} aria-hidden="true" />
        <input
          className="card__title"
          value={card.title}
          aria-label="卡片标题"
          spellCheck={false}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <span className="card__stamp" title={`最后更新 ${formatDateTime(card.updatedAt)}`}>
          {formatStamp(card.updatedAt, now)}
        </span>
        <div className="card__actions">
          <NeuButton
            iconOnly
            size="sm"
            variant="danger"
            title="删除卡片"
            aria-label="删除卡片"
            onClick={handleRemove}
          >
            <IconTrash size={16} />
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            title={card.collapsed ? '展开卡片' : '收起卡片'}
            aria-label={card.collapsed ? '展开卡片' : '收起卡片'}
            onClick={handleToggleCollapse}
          >
            {card.collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          </NeuButton>
          <NeuButton
            iconOnly
            size="sm"
            className="card__done"
            disabled={archiving}
            aria-label="完成并归档这张卡片"
            title="完成并归档这张卡片"
            onClick={handleArchive}
          >
            <IconCheck size={21} strokeWidth={2.9} />
          </NeuButton>
        </div>
      </div>

      <div className="card__body">
        <textarea
          className="card__text"
          value={card.body}
          aria-label="卡片内容"
          placeholder="写点什么…图片可以直接粘贴进来"
          spellCheck={false}
          onChange={(event) => onChange({ body: event.target.value })}
          onClick={handleTextClick}
          onPointerDown={onBringToFront}
        />

        {links.length > 0 ? (
          <div className="card__links">
            {links.map((segment, index) => (
              <button
                key={`${segment.href}-${index}`}
                type="button"
                className="card__link"
                title={`按住 ${openModifier} 点击打开 ${segment.href}`}
                onClick={(event) => {
                  const href = segment.href ?? ''
                  if (!hasOpenModifier(event)) {
                    onNotify(`按住 ${openModifier} 点击就能打开这个链接`)
                    return
                  }
                  event.preventDefault()
                  openHref(href)
                }}
              >
                <IconLink size={12} />
                <span className="card__link-text">{segment.value}</span>
                <IconExternal size={11} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {card.attachments.length > 0 ? (
        <div className="card__atts">
          {card.attachments.map((attachment) => (
            <div key={attachment.id} className={`att att--${attachment.kind}`}>
              {attachment.kind === 'image' ? (
                <button
                  type="button"
                  className="att__thumb"
                  title={`${attachment.name} · 点击预览`}
                  onClick={() => onPreview(attachment)}
                >
                  <img src={attachment.src} alt={attachment.name} draggable={false} />
                </button>
              ) : (
                <button
                  type="button"
                  className="att__file"
                  title={
                    attachment.src
                      ? `按住 ${openModifier} 点击打开 ${attachment.name}`
                      : attachment.name
                  }
                  onClick={(event) => {
                    if (!hasOpenModifier(event)) {
                      onNotify(`按住 ${openModifier} 点击就能打开这个文件`)
                      return
                    }
                    handleAttachmentOpen(attachment)
                  }}
                >
                  <span className="att__icon">
                    <IconFile size={15} />
                  </span>
                  <span className="att__meta">
                    <span className="att__name">{attachment.name}</span>
                    {formatFileSize(attachment.size) ? (
                      <span className="att__size">{formatFileSize(attachment.size)}</span>
                    ) : null}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="att__remove"
                aria-label={`移除 ${attachment.name}`}
                title="移除附件"
                onClick={() =>
                  onChange({
                    attachments: card.attachments.filter((item) => item.id !== attachment.id),
                  })
                }
              >
                <IconClose size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* 打完的番茄钟：卡片底边上一排小标记，不影响完成 / 归档状态。 */}
      {card.pomodoros > 0 ? (
        <span className="card__toms" title={`已打完 ${card.pomodoros} 个番茄钟`}>
          {Array.from({ length: Math.min(card.pomodoros, 6) }, (_, index) => (
            <span key={index} className="card__tom" />
          ))}
          {card.pomodoros > 6 ? <em>+{card.pomodoros - 6}</em> : null}
        </span>
      ) : null}

      {RESIZE_EDGES.map((edge) => (
        <span
          key={edge}
          className={`rz rz--${edge}`}
          role="presentation"
          draggable={false}
          title="拖动边缘调整大小"
          onPointerDown={(event) => handleResizePointerDown(event, edge)}
        />
      ))}
    </article>
  )
}
