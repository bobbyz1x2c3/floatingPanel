import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { MAX_ATTACHMENTS, fileToAttachment, mergeAttachments } from '../lib/attachments'
import { formatDateTime, formatFileSize, formatRelativeShort } from '../lib/format'
import { caretIndexFromPoint, findLinkAt, listLinks } from '../lib/links'
import { openModifier, openTarget } from '../lib/platform'
import { snapValue } from '../lib/store'
import { CARD_MIN_HEIGHT, CARD_MIN_WIDTH, QUADRANT_META, quadrantFromPoint } from '../lib/types'
import type { Attachment, CardData } from '../lib/types'
import { NeuButton } from './controls'
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconExternal,
  IconFile,
  IconLink,
  IconResize,
  IconTrash,
} from './icons'

export interface CardViewProps {
  card: CardData
  active: boolean
  dimmed: boolean
  matched: boolean
  dropTarget: boolean
  snap: boolean
  now: number
  onChange: (patch: Partial<CardData>, touch?: boolean) => void
  onBringToFront: () => void
  onRemove: () => void
  onArchive: () => void
  onPreview: (attachment: Attachment) => void
  onNotify: (message: string) => void
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

/** 归档动效时长，和 app.css 里的 card-archive 动画保持一致。 */
const ARCHIVE_ANIMATION = 460

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
  now,
  onChange,
  onBringToFront,
  onRemove,
  onArchive,
  onPreview,
  onNotify,
}: CardViewProps) {
  const originRef = useRef<DragOrigin | null>(null)
  const archiveTimer = useRef<number | null>(null)
  const movedRef = useRef(false)
  const pendingFocus = useRef<{ field: HTMLInputElement; clientX: number; clientY: number } | null>(
    null,
  )
  const [gesture, setGesture] = useState<Gesture>('idle')
  const [archiving, setArchiving] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const latest = useRef({ onChange, snap, card })

  useEffect(() => {
    latest.current = { onChange, snap, card }
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
      const { onChange: change, snap: snapping, card: current } = latest.current
      const deltaX = event.clientX - origin.pointerX
      const deltaY = event.clientY - origin.pointerY

      if (gesture === 'drag') {
        const x = Math.max(-600, snapValue(origin.startX + deltaX, snapping))
        const y = Math.max(-600, snapValue(origin.startY + deltaY, snapping))
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) movedRef.current = true
        const patch: Partial<CardData> = { x, y }
        const zone = quadrantFromPoint(x + current.width / 2, y + current.height / 2)
        if (zone !== current.quadrant) patch.quadrant = zone
        change(patch, false)
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
      const pending = pendingFocus.current
      pendingFocus.current = null
      // 标题栏既是拖动手柄也是输入框：没拖动就当作一次普通的点击落光标。
      if (pending && !movedRef.current) {
        const index = caretIndexFromPoint(pending.field, pending.clientX, pending.clientY)
        pending.field.focus()
        if (index >= 0) pending.field.setSelectionRange(index, index)
      }
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
    beginGesture(event, 'drag')
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.stopPropagation()
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
    setArchiving(true)
    archiveTimer.current = window.setTimeout(() => onArchive(), ARCHIVE_ANIMATION)
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

  const zone = QUADRANT_META[card.quadrant]

  const classes = [
    'card',
    active && 'is-front',
    gesture === 'drag' && 'is-dragging',
    gesture === 'resize' && 'is-resizing',
    card.collapsed && 'is-collapsed',
    dimmed && 'is-dimmed',
    matched && 'is-match',
    archiving && 'is-archiving',
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
        height: card.collapsed ? undefined : card.height,
        zIndex: card.z,
      }}
      onPointerDown={onBringToFront}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="card__head" onPointerDown={handleHeadPointerDown}>
        <span className="card__dot" title={`${zone.position} · ${zone.title}`} aria-hidden="true" />
        <input
          className="card__title"
          value={card.title}
          aria-label="卡片标题"
          spellCheck={false}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <div className="card__actions">
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

      <div className="card__foot">
        <span className="card__time" title={`最后更新 ${formatDateTime(card.updatedAt)}`}>
          更新于 {formatRelativeShort(card.updatedAt, now)}
        </span>
        <NeuButton
          size="sm"
          variant="primary"
          className="card__confirm"
          disabled={archiving}
          aria-label="完成并归档这张卡片"
          title="完成并归档这张卡片"
          onClick={handleArchive}
        >
          <IconCheck size={15} />
          完成
        </NeuButton>
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
