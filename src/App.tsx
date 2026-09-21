import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { ArchiveDrawer } from './components/ArchiveDrawer'
import { Board } from './components/Board'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TopBar } from './components/TopBar'
import { NeuButton } from './components/controls'
import { IconClose } from './components/icons'
import {
  MAX_ATTACHMENTS,
  fileToAttachment,
  mergeAttachments,
  pathToAttachment,
} from './lib/attachments'
import {
  applyAlwaysOnTop,
  applyBlurBehind,
  closeWindow,
  isDesktop,
  minimizeWindow,
  platformLabel,
  watchNativeDrop,
} from './lib/platform'
import type { NativeDrop } from './lib/platform'
import { clearState, loadState, saveState } from './lib/storage'
import { boardReducer, createInitialState } from './lib/store'
import { quadrantFromPoint, zoneSizeFor } from './lib/types'
import type { Attachment, CardData, Settings, ZoneSize } from './lib/types'
import { playCompleteSound } from './lib/sound'
import './styles/tokens.css'
import './styles/neumorphism.css'
import './styles/app.css'

const PERSIST_DELAY = 320
const TICK_INTERVAL = 30000
const NEW_CARD_OFFSET_X = 46
const NEW_CARD_OFFSET_Y = 22

/** 四象限的可用区域 = .board 的内容盒（要扣掉内边距和滚动条）。 */
function measureBoardViewport(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  return {
    width: element.clientWidth - padX,
    height: element.clientHeight - padY,
  }
}

function resolveInitialState() {
  return loadState() ?? createInitialState()
}

function titleFromAttachment(attachment: Attachment | undefined): string {
  if (!attachment) return '新卡片'
  const trimmed = attachment.name.replace(/\.[^.]+$/, '').trim()
  return trimmed || '新卡片'
}

export function App() {
  const [state, dispatch] = useReducer(boardReducer, null, resolveInitialState)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [systemDark, setSystemDark] = useState(false)
  const [windowFocused, setWindowFocused] = useState(true)
  const toastTimer = useRef<number | null>(null)
  const confirmTimer = useRef<number | null>(null)
  const storageWarned = useRef(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [zone, setZone] = useState<ZoneSize>(() =>
    zoneSizeFor(window.innerWidth - 32, window.innerHeight - 132),
  )
  const zoneRef = useRef(zone)
  zoneRef.current = zone
  const stateRef = useRef(state)
  stateRef.current = state

  const { cards, archived, settings } = state

  // 四象限跟着窗口走：每格恒等于可视区的一半（低于最小值时才开始滚动）。
  useLayoutEffect(() => {
    const element = boardRef.current
    if (!element) return
    const measure = () => {
      const viewport = measureBoardViewport(element)
      const next = zoneSizeFor(viewport.width, viewport.height)
      setZone((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (saveState(state) || storageWarned.current) return
      storageWarned.current = true
      notify('本地存储快满了，最新的图片可能没有被保存')
    }, PERSIST_DELAY)
    return () => window.clearTimeout(timer)
  }, [state, notify])

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL)
    return () => window.clearInterval(handle)
  }, [])

  // 旧存档（四象限之前）和全新示例都没有按真实窗口排布过，首次加载补一次归位。
  useEffect(() => {
    if (stateRef.current.version >= 2) return
    dispatch({ type: 'arrange', zone: zoneRef.current })
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const onBlur = () => setWindowFocused(false)
    const onFocus = () => setWindowFocused(true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.accent = settings.accent
    root.style.setProperty('--panel-opacity', String(settings.panelOpacity))
    root.style.setProperty('--nm-grain', String(settings.grain))
    root.style.setProperty('--glass-blur', `${(6 + settings.frost * 0.38).toFixed(1)}px`)
    root.style.setProperty('--glass-blur-soft', `${(4 + settings.frost * 0.18).toFixed(1)}px`)
    document.body.classList.toggle('is-desktop', isDesktop)
  }, [resolvedTheme, settings.accent, settings.panelOpacity, settings.grain, settings.frost])

  useEffect(() => {
    if (!isDesktop) return
    void applyAlwaysOnTop(settings.alwaysOnTop)
  }, [settings.alwaysOnTop])

  useEffect(() => {
    if (!isDesktop) return
    void applyBlurBehind(settings.blurBehind)
  }, [settings.blurBehind])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
    }
  }, [])

  /** 把附件放进某张卡片；没有命中卡片时就在指定位置新建一张。 */
  const applyAttachments = useCallback(
    (cardId: string | null, items: Attachment[], point?: { x: number; y: number }) => {
      if (items.length === 0) return
      const card = cardId
        ? stateRef.current.cards.find((item) => item.id === cardId)
        : undefined

      if (card) {
        dispatch({
          type: 'update',
          id: card.id,
          patch: { attachments: mergeAttachments(card.attachments, items) },
        })
        const hasImage = items.some((item) => item.kind === 'image')
        notify(hasImage ? '已把图片放进这张卡片' : '已把文件链接放进这张卡片')
        return
      }

      const px = point?.x ?? 90
      const py = point?.y ?? 90
      dispatch({
        type: 'add',
        zone: zoneRef.current,
        quadrant: quadrantFromPoint(px, py, zoneRef.current),
        x: px - NEW_CARD_OFFSET_X,
        y: py - NEW_CARD_OFFSET_Y,
        title: titleFromAttachment(items[0]),
        attachments: items.slice(0, MAX_ATTACHMENTS),
      })
      notify('已新建卡片并放入附件')
    },
    [notify],
  )

  const cardIdAt = useCallback((clientX: number, clientY: number): string | null => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    return (target?.closest('[data-card-id]') as HTMLElement | null)?.dataset.cardId ?? null
  }, [])

  const canvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = document.querySelector('.board-canvas') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    if (!rect) return undefined
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  // 桌面端：系统拖拽走 Tauri 事件，拿到的是真实路径。
  const dropHoverId = useRef<string | null>(null)
  const nativeDrop = useRef<(drop: NativeDrop) => void>(() => {})
  nativeDrop.current = (drop) => {
    if (drop.kind !== 'drop') {
      const hovered = drop.kind === 'over' ? cardIdAt(drop.x, drop.y) : null
      if (hovered !== dropHoverId.current) {
        dropHoverId.current = hovered
        setDropTargetId(hovered)
      }
      return
    }
    dropHoverId.current = null
    setDropTargetId(null)
    if (drop.paths.length === 0) return
    const paths = drop.paths.slice(0, MAX_ATTACHMENTS)
    void Promise.all(paths.map(pathToAttachment)).then((created) => {
      const list = created.filter((item): item is Attachment => item !== null)
      applyAttachments(cardIdAt(drop.x, drop.y), list, canvasPoint(drop.x, drop.y))
    })
  }

  useEffect(() => {
    if (!isDesktop) return
    return watchNativeDrop((drop) => nativeDrop.current(drop))
  }, [])

  // 浏览器端：HTML5 拖拽；桌面端这个分支不会触发。
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      const { clientX, clientY } = event
      const picked = files.slice(0, MAX_ATTACHMENTS)
      void Promise.all(picked.map(fileToAttachment)).then((created) => {
        const list = created.filter((item): item is Attachment => item !== null)
        applyAttachments(cardIdAt(clientX, clientY), list, canvasPoint(clientX, clientY))
      })
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [applyAttachments, cardIdAt, canvasPoint])

  // 焦点不在卡片里时的兜底粘贴：进当前卡片，没有卡片就新建一张。
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-card-id]')) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      void Promise.all(files.slice(0, MAX_ATTACHMENTS).map(fileToAttachment)).then((created) => {
        const list = created.filter((item): item is Attachment => item !== null)
        applyAttachments(stateRef.current.activeId, list)
      })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [applyAttachments])

  const addCard = useCallback(
    (quadrant?: CardData['quadrant']) => {
      setQuery('')
      dispatch({ type: 'add', zone: zoneRef.current, quadrant })
      notify('已新建一张卡片')
    },
    [notify],
  )

  const addCardAt = useCallback((x: number, y: number) => {
    dispatch({
      type: 'add',
      zone: zoneRef.current,
      quadrant: quadrantFromPoint(x, y, zoneRef.current),
      x: x - NEW_CARD_OFFSET_X,
      y: y - NEW_CARD_OFFSET_Y,
    })
  }, [])

  const updateCard = useCallback((id: string, patch: Partial<CardData>, touch?: boolean) => {
    dispatch({ type: 'update', id, patch, touch })
  }, [])

  const arrange = useCallback(() => {
    dispatch({ type: 'arrange', zone: zoneRef.current })
    notify('已按象限重新排列')
  }, [notify])

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    dispatch({ type: 'settings', patch })
  }, [])

  const cycleTheme = useCallback(() => {
    const order = ['light', 'dark', 'system'] as const
    const next = order[(order.indexOf(settings.theme) + 1) % order.length]
    patchSettings({ theme: next })
  }, [patchSettings, settings.theme])

  const allCollapsed = useMemo(
    () => cards.length > 0 && cards.every((card) => card.collapsed),
    [cards],
  )

  const matchCount = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return cards.length
    return cards.filter(
      (card) =>
        card.title.toLowerCase().includes(needle) ||
        card.body.toLowerCase().includes(needle) ||
        card.attachments.some((item) => item.name.toLowerCase().includes(needle)),
    ).length
  }, [cards, query])

  const requestClear = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmingClear(false), 4000)
      notify('再次点击「清空卡片」以确认')
      return
    }
    setConfirmingClear(false)
    dispatch({ type: 'clear' })
    clearState()
    notify('已清空全部卡片')
  }, [confirmingClear, notify])

  const toggleArchive = useCallback(() => {
    setArchiveOpen((open) => {
      if (!open) setSettingsOpen(false)
      return !open
    })
  }, [])

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (!open) setArchiveOpen(false)
      return !open
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (preview) {
          setPreview(null)
          return
        }
        setSettingsOpen(false)
        setArchiveOpen(false)
        setConfirmingClear(false)
        return
      }
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        addCard()
      } else if (key === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (key === ',') {
        event.preventDefault()
        toggleSettings()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addCard, preview, toggleSettings])

  const isDimmed = settings.dimOnBlur && !windowFocused && !settingsOpen && !archiveOpen

  return (
    <div className={`shell${isDimmed ? ' is-dimmed' : ''}`}>
      <div className="panel">
        <TopBar
          isDesktop={isDesktop}
          platformLabel={platformLabel}
          alwaysOnTop={settings.alwaysOnTop}
          cardCount={cards.length}
          archivedCount={archived.length}
          searchRef={searchRef}
          query={query}
          onQueryChange={setQuery}
          matchCount={matchCount}
          theme={settings.theme}
          accent={settings.accent}
          allCollapsed={allCollapsed}
          settingsOpen={settingsOpen}
          archiveOpen={archiveOpen}
          onAdd={() => addCard()}
          onArrange={arrange}
          onToggleCollapseAll={() => dispatch({ type: 'collapseAll', value: !allCollapsed })}
          onCycleTheme={cycleTheme}
          onToggleArchive={toggleArchive}
          onToggleSettings={toggleSettings}
          onToggleAlwaysOnTop={() => patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
          onMinimize={() => void minimizeWindow()}
          onClose={() => void closeWindow()}
        />

        <Board
          cards={cards}
          activeId={state.activeId}
          query={query}
          snap={settings.snapToGrid}
          showGrid={settings.showGrid}
          dropTargetId={dropTargetId}
          now={now}
          onAddAt={addCardAt}
          onUpdate={updateCard}
          onFocus={(id) => dispatch({ type: 'focus', id })}
          onRemove={(id) => {
            dispatch({ type: 'remove', id })
            notify('已删除卡片')
          }}
          onArchive={(id) => {
            dispatch({ type: 'archive', id })
            if (settings.soundOnComplete) playCompleteSound()
            notify('已归档，可在「归档」里找到')
          }}
          onPreview={setPreview}
          onNotify={notify}
          zone={zone}
          boardRef={boardRef}
          onBlurBoard={() => {
            dispatch({ type: 'blur' })
            setSettingsOpen(false)
            setArchiveOpen(false)
          }}
        />

        {archiveOpen ? (
          <ArchiveDrawer
            archived={archived}
            now={now}
            onRestore={(id) => {
              dispatch({ type: 'restoreArchived', id, zone: zoneRef.current })
              notify('已恢复到原来的象限')
            }}
            onDelete={(id) => {
              dispatch({ type: 'deleteArchived', id })
              notify('已删除这条归档')
            }}
            onClear={() => {
              dispatch({ type: 'clearArchived' })
              notify('已清空归档')
            }}
            onClose={() => setArchiveOpen(false)}
          />
        ) : null}

        {settingsOpen ? (
          <SettingsDrawer
            settings={settings}
            isDesktop={isDesktop}
            onPatch={patchSettings}
            onArrange={arrange}
            onCollapseAll={() => dispatch({ type: 'collapseAll', value: true })}
            onClear={requestClear}
            onRestore={() => {
              dispatch({ type: 'restoreExamples' })
              notify('已恢复示例卡片')
            }}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {preview ? (
          <div
            className="preview"
            role="dialog"
            aria-label={`预览 ${preview.name}`}
            onClick={() => setPreview(null)}
          >
            <figure className="preview__frame" onClick={(event) => event.stopPropagation()}>
              <img className="preview__image" src={preview.src} alt={preview.name} />
              <figcaption className="preview__bar">
                <span className="preview__name">{preview.name}</span>
                <NeuButton size="sm" onClick={() => setPreview(null)}>
                  <IconClose size={14} />
                  关闭
                </NeuButton>
              </figcaption>
            </figure>
          </div>
        ) : null}

        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  )
}
