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
import { FocusView } from './components/FocusView'
import { SettingsDrawer } from './components/SettingsDrawer'
import { Spectrum } from './components/Spectrum'
import { TomatoBar } from './components/TomatoBar'
import { TopBar } from './components/TopBar'
import {
  MAX_ATTACHMENTS,
  fileToAttachment,
  mergeAttachments,
  pathToAttachment,
} from './lib/attachments'
import {
  applyAlwaysOnTop,
  closeWindow,
  isDesktop,
  minimizeWindow,
  openTarget,
  openPreviewWindow,
  platformLabel,
  runCommand,
  toggleMaximizeWindow,
  watchNativeDrop,
} from './lib/platform'
import type { NativeDrop } from './lib/platform'
import { enterFocusWindow, resizeFocusWindow, restoreFocusWindow } from './lib/platform'
import type { FocusWindowSnapshot } from './lib/platform'
import { putPreviewPayload } from './lib/preview'
import { startAudio, stopAudio } from './lib/audio'
import { formatClock } from './lib/pomodoro'
import { focusCardIdInDirection, focusOrderedCards, focusStackSize } from './lib/focus'
import type { FocusDirection, FocusPhase } from './lib/focus'
import type { TrayTool } from './lib/types'
import { IDLE_UPDATE, appVersion, checkUpdate as runUpdateCheck, installUpdate } from './lib/update'
import type { UpdateState } from './lib/update'
import {
  boardFileStamp,
  parseBoardFile,
  readBoardFile,
  serializeBoard,
  writeBoardFile,
} from './lib/boardFile'
import { clearState, loadState, saveState } from './lib/storage'
import { boardReducer, createInitialState } from './lib/store'
import { quadrantFromPoint, zoneSizeFor } from './lib/types'
import type { Attachment, CardData, Settings, ZoneSize } from './lib/types'
import { playCompleteSound } from './lib/sound'
import { playTimerSound } from './lib/sound'
import './styles/tokens.css'
import './styles/neumorphism.css'
import './styles/app.css'
import './styles/pomodoro.css'
import './styles/focus.css'

const PERSIST_DELAY = 320
const TICK_INTERVAL = 30000
const NEW_CARD_OFFSET_X = 46
const NEW_CARD_OFFSET_Y = 22
/** 提示条停留时间，以及淡出动画给多长。 */
const TOAST_HOLD = 2400
const TOAST_OUT = 200
/** 「已完成」那种大字动效停留多久（和 app.css 里的 flash 动画对齐）。 */
const FLASH_DURATION = 1100
/** 「整理」时给卡片位移留的过渡时间窗口。 */
const ARRANGE_MOTION = 460
/** 番茄钟的剩余时间刷新间隔：一秒一次就够，250ms 让数字跳变更跟手。 */
const TIMER_TICK = 250

/** 四象限的可用区域 = .board 的内容盒（扣掉内边距）。 */
function measureBoardViewport(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const width = element.clientWidth - padX
  const height = element.clientHeight - padY
  // Board 刚从专注模式挂回来时，布局可能还没稳定；无效测量不能写进 zone。
  if (!Number.isFinite(width) || !Number.isFinite(height) || (width <= 0 && height <= 0)) return null
  /*
    clientWidth/clientHeight 已经把滚动条扣掉了，这里是最准的可视区。
    之所以不会抖：.board 上挂着 scrollbar-gutter: stable，纵向滚动条槽常驻，
    它的出现/消失不再改变这里量到的尺寸，也就不会再反过来触发象限重算。
  */
  return {
    width,
    height,
  }
}

function resolveInitialState() {
  return loadState() ?? createInitialState()
}

function titleFromAttachment(attachment: Attachment | undefined): string {
  if (!attachment) return '新卡片'
  // 文件夹的名字带一个结尾斜杠（见 attachments.ts），起标题时去掉。
  const trimmed = attachment.name.replace(/\/$/, '').replace(/\.[^.]+$/, '').trim()
  return trimmed || '新卡片'
}

export function App() {
  const [state, dispatch] = useReducer(boardReducer, null, resolveInitialState)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastLeaving, setToastLeaving] = useState(false)
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null)
  const [arranging, setArranging] = useState(false)
  /** 正在跑的番茄钟（同一时间只允许一个）。 */
  const [pomodoro, setPomodoro] = useState<{ cardId: string; endsAt: number; label: string } | null>(null)
  const [remaining, setRemaining] = useState(0)
  const pomodoroRef = useRef(pomodoro)
  pomodoroRef.current = pomodoro
  const [focusPhase, setFocusPhase] = useState<FocusPhase>('idle')
  const [focusCurrentId, setFocusCurrentId] = useState<string | null>(null)
  const [focusTransition, setFocusTransition] = useState<{
    previousId: string
    direction: FocusDirection
    sizeChange: boolean
  } | null>(null)
  const [focusBarHidden, setFocusBarHidden] = useState(false)
  const focusPhaseRef = useRef(focusPhase)
  focusPhaseRef.current = focusPhase
  const focusCurrentRef = useRef(focusCurrentId)
  focusCurrentRef.current = focusCurrentId
  const focusWindowSnapshot = useRef<FocusWindowSnapshot | null>(null)
  const focusLayoutSnapshot = useRef<Array<Pick<CardData, 'id' | 'x' | 'y' | 'width' | 'height' | 'quadrant' | 'tone'>>>([])
  const focusPhaseTimer = useRef<number | null>(null)
  const focusTransitionTimer = useRef<number | null>(null)
  const focusHideTimer = useRef<number | null>(null)
  const [version, setVersion] = useState('—')
  const [update, setUpdate] = useState<UpdateState>(IDLE_UPDATE)
  const [now, setNow] = useState(() => Date.now())
  const [systemDark, setSystemDark] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const toastLeaveTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const arrangeTimer = useRef<number | null>(null)
  const confirmTimer = useRef<number | null>(null)
  const storageWarned = useRef(false)
  /** 状态文件：最近一次同步过的内容和修改时间，用来和 CLI 对表。 */
  const fileStamp = useRef(0)
  const fileSyncedText = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [zone, setZone] = useState<ZoneSize>(() =>
    zoneSizeFor(window.innerWidth - 32, window.innerHeight - 132),
  )
  const zoneRef = useRef(zone)
  zoneRef.current = zone
  /** 首帧那次测量只是把猜测值换成真实值，不应该被当成一次“象限变化”去缩放卡片。 */
  const zoneReady = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const { cards, archived, settings } = state
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // 四象限跟着窗口走：每格恒等于可视区的一半（低于最小值时才开始滚动）。
  useLayoutEffect(() => {
    const element = boardRef.current
    if (!element) return
    const measure = () => {
      const viewport = measureBoardViewport(element)
      if (!viewport) return
      const next = zoneSizeFor(viewport.width, viewport.height)
      const previous = zoneRef.current
      const unchanged = previous.width === next.width && previous.height === next.height
      if (!zoneReady.current) {
        zoneReady.current = true
        if (!unchanged) setZone(next)
        return
      }
      if (unchanged) return
      // 象限变了，卡片按“原本在自己那一格里的相对位置”跟着挪，而不是钉死在绝对坐标上。
      dispatch({ type: 'rezone', from: previous, to: next })
      setZone(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const notify = useCallback((message: string) => {
    setToast(message)
    setToastLeaving(false)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    if (toastLeaveTimer.current !== null) window.clearTimeout(toastLeaveTimer.current)
    // 先播淡出，再真正移除，不然提示条会「啪」地消失。
    toastLeaveTimer.current = window.setTimeout(() => setToastLeaving(true), TOAST_HOLD - TOAST_OUT)
    toastTimer.current = window.setTimeout(() => {
      setToast(null)
      setToastLeaving(false)
    }, TOAST_HOLD)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    const text = serializeBoard(state)
    // 内容和状态文件已经一致（比如刚被 CLI 同步过）就不用再写一遍。
    if (isDesktop && text === fileSyncedText.current) return
    const timer = window.setTimeout(() => {
      const saved = saveState(state)
      if (isDesktop) {
        void writeBoardFile(state).then((stamp) => {
          if (stamp === null) return
          fileSyncedText.current = text
          fileStamp.current = stamp
        })
      }
      if (!saved && !storageWarned.current) {
        storageWarned.current = true
        notify('本地存储快满了，最新的图片可能没有被保存')
      }
    }, PERSIST_DELAY)
    return () => window.clearTimeout(timer)
  }, [state, notify])

  /*
    桌面端的状态文件是主数据源：启动时先读文件，没有文件（第一次跑）就把
    当前状态写进去当种子；之后每 1.2 秒比一次修改时间，谁改了就同步过来。
    CLI（nemu）就是靠这条路径和界面接上的。
  */
  useEffect(() => {
    if (!isDesktop) return
    let cancelled = false
    void (async () => {
      const raw = await readBoardFile()
      const parsed = raw ? parseBoardFile(raw) : null
      if (cancelled) return
      if (parsed) {
        const text = serializeBoard(parsed)
        fileSyncedText.current = text
        dispatch({ type: 'hydrate', state: { ...parsed, activeId: null } })
      } else {
        void writeBoardFile(stateRef.current).then((stamp) => {
          if (stamp !== null) fileStamp.current = stamp
        })
      }
      fileStamp.current = await boardFileStamp()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    let stopped = false
    const timer = window.setInterval(() => {
      void (async () => {
        const stamp = await boardFileStamp()
        if (stopped || !stamp || stamp === fileStamp.current) return
        fileStamp.current = stamp
        const raw = await readBoardFile()
        if (!raw) return
        const parsed = parseBoardFile(raw)
        if (!parsed) return
        const text = serializeBoard(parsed)
        if (text === serializeBoard(stateRef.current)) {
          fileSyncedText.current = text
          return
        }
        fileSyncedText.current = text
        dispatch({ type: 'hydrate', state: { ...parsed, activeId: stateRef.current.activeId } })
        notify('已同步外部改动')
      })()
    }, 1200)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [notify])

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
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.accent = settings.accent
    /*
      背景透明度：换算成玻璃填充的 alpha，只动 --glass-fill*（面板底色），
      卡片的 --glass-fill-card* 不动，所以文字始终看得清。
    */
    const fill = (1 - settings.bgTransparency).toFixed(3)
    root.style.setProperty('--glass-fill', fill)
    root.style.setProperty('--glass-fill-desktop', fill)
    root.style.setProperty('--nm-grain', String(settings.grain))
    root.style.setProperty('--glass-blur', `${(6 + settings.frost * 0.38).toFixed(1)}px`)
    root.style.setProperty('--glass-blur-soft', `${(4 + settings.frost * 0.18).toFixed(1)}px`)
    document.body.classList.toggle('is-desktop', isDesktop)
  }, [resolvedTheme, settings.accent, settings.bgTransparency, settings.grain, settings.frost])

  useEffect(() => {
    if (!isDesktop) return
    void applyAlwaysOnTop(settings.alwaysOnTop)
  }, [settings.alwaysOnTop])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      if (toastLeaveTimer.current !== null) window.clearTimeout(toastLeaveTimer.current)
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      if (arrangeTimer.current !== null) window.clearTimeout(arrangeTimer.current)
      if (focusPhaseTimer.current !== null) window.clearTimeout(focusPhaseTimer.current)
      if (focusTransitionTimer.current !== null) window.clearTimeout(focusTransitionTimer.current)
      if (focusHideTimer.current !== null) window.clearTimeout(focusHideTimer.current)
      if (focusWindowSnapshot.current) void restoreFocusWindow(focusWindowSnapshot.current)
    }
  }, [])

  /** 把附件放进某张卡片；没有命中卡片时就新建一张。 */
  const applyAttachments = useCallback(
    (cardId: string | null, items: Attachment[], spot?: { x?: number; y?: number; quadrant?: CardData['quadrant'] }) => {
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

      const zoneNow = zoneRef.current
      const hasPoint = spot?.x !== undefined && spot?.y !== undefined
      const quadrant = hasPoint
        ? quadrantFromPoint(spot.x as number, spot.y as number, zoneNow)
        : (spot?.quadrant ?? 'do')
      dispatch({
        type: 'add',
        zone: zoneNow,
        quadrant,
        // 落在画布外面（菜单栏、抽屉上）时不给坐标，交给级联排布。
        x: hasPoint ? (spot.x as number) - NEW_CARD_OFFSET_X : undefined,
        y: hasPoint ? (spot.y as number) - NEW_CARD_OFFSET_Y : undefined,
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

  /**
   * 拖放落点：画布内给精确坐标；拖到画布外面（菜单栏、抽屉、窗口边缘）时
   * 只保留「落在哪个象限」这个信息，位置交给级联，卡片不会跑到可视区外面去。
   */
  const dropSpot = useCallback((clientX: number, clientY: number) => {
    const canvas = document.querySelector('.board-canvas') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    if (!rect) return {}
    const insideX = Math.min(Math.max(clientX, rect.left + 1), rect.right - 1)
    const insideY = Math.min(Math.max(clientY, rect.top + 1), rect.bottom - 1)
    const quadrant = quadrantFromPoint(insideX - rect.left, insideY - rect.top, zoneRef.current)
    const x = clientX - rect.left
    const y = clientY - rect.top
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
    return inside ? { x, y, quadrant } : { quadrant }
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
      applyAttachments(cardIdAt(drop.x, drop.y), list, dropSpot(drop.x, drop.y))
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
        applyAttachments(cardIdAt(clientX, clientY), list, dropSpot(clientX, clientY))
      })
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [applyAttachments, cardIdAt, dropSpot])

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
    if (focusPhaseRef.current !== 'idle') {
      focusLayoutSnapshot.current = focusLayoutSnapshot.current.map((saved) => {
        if (saved.id !== id) return saved
        return {
          ...saved,
          x: patch.x ?? saved.x,
          y: patch.y ?? saved.y,
          width: patch.width ?? saved.width,
          height: patch.height ?? saved.height,
          quadrant: patch.quadrant ?? saved.quadrant,
          tone: patch.tone ?? saved.tone,
        }
      })
    }
  }, [])

  const moveFocusTo = useCallback((id: string, direction: FocusDirection) => {
    const ordered = focusOrderedCards(stateRef.current.cards)
    const previousId = focusCurrentRef.current
    const previous = ordered.find((card) => card.id === previousId)
    const next = ordered.find((card) => card.id === id)
    if (!next || next.id === previousId) return
    const sizeChange = Boolean(previous && (previous.width !== next.width || previous.height !== next.height))
    if (focusTransitionTimer.current !== null) window.clearTimeout(focusTransitionTimer.current)
    setFocusTransition({ previousId: previousId ?? next.id, direction, sizeChange })
    setFocusCurrentId(next.id)
    focusCurrentRef.current = next.id
      focusTransitionTimer.current = window.setTimeout(() => setFocusTransition(null), 560)
  }, [])

  const switchFocus = useCallback(
    (direction: FocusDirection) => {
      const nextId = focusCardIdInDirection(stateRef.current.cards, focusCurrentRef.current, direction)
      if (nextId) moveFocusTo(nextId, direction)
    },
    [moveFocusTo],
  )

  const selectFocusCard = useCallback(
    (id: string) => {
      const ordered = focusOrderedCards(stateRef.current.cards)
      const from = ordered.findIndex((card) => card.id === focusCurrentRef.current)
      const to = ordered.findIndex((card) => card.id === id)
      if (to < 0 || to === from) return
      const direction: FocusDirection = to > from ? 'next' : 'previous'
      moveFocusTo(id, direction)
    },
    [moveFocusTo],
  )

  const enterFocus = useCallback(async () => {
    if (focusPhaseRef.current !== 'idle') return
    const ordered = focusOrderedCards(stateRef.current.cards)
    const target = ordered.find((card) => card.id === stateRef.current.activeId) ?? ordered[ordered.length - 1]
    if (!target) {
      notify('还没有卡片，先创建一张')
      return
    }
    setFocusCurrentId(target.id)
    focusCurrentRef.current = target.id
    setFocusTransition(null)
    setFocusBarHidden(false)
    setSettingsOpen(false)
    setArchiveOpen(false)
    focusLayoutSnapshot.current = stateRef.current.cards.map((card) => ({
      id: card.id,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
      quadrant: card.quadrant,
      tone: card.tone,
    }))
    const size = focusStackSize(target)
    focusWindowSnapshot.current = await enterFocusWindow(size.width, size.height)
    setFocusPhase('entering')
  }, [notify])

  const exitFocus = useCallback(() => {
    if (focusPhaseRef.current === 'idle' || focusPhaseRef.current === 'exiting') return
    if (focusTransitionTimer.current !== null) window.clearTimeout(focusTransitionTimer.current)
    setFocusTransition(null)
    setFocusBarHidden(false)
    setFocusPhase('exiting')
  }, [])

  const handleFocusCardRemoved = useCallback(
    (id: string) => {
      if (focusPhaseRef.current === 'idle' || focusCurrentRef.current !== id) return
      const remaining = focusOrderedCards(stateRef.current.cards.filter((card) => card.id !== id))
      const next = remaining[0]
      if (!next) {
        void exitFocus()
        return
      }
      moveFocusTo(next.id, 'next')
    },
    [exitFocus, moveFocusTo],
  )

  const arrange = useCallback(() => {
    // 先把「正在整理」挂上，卡片换位置就会走过渡而不是瞬移。
    setArranging(true)
    if (arrangeTimer.current !== null) window.clearTimeout(arrangeTimer.current)
    arrangeTimer.current = window.setTimeout(() => setArranging(false), ARRANGE_MOTION)
    dispatch({ type: 'arrange', zone: zoneRef.current })
    notify('已按象限重新排列')
  }, [notify])

  /** 完成一张卡片：响一声 + 屏幕中央来一发「已完成」。 */
  const celebrate = useCallback(
    (text: string) => {
      if (settings.soundOnComplete) playCompleteSound()
      setFlash({ id: Date.now(), text })
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_DURATION)
    },
    [settings.soundOnComplete],
  )

  /** 番茄钟走完：给卡片记一笔、响钟、来一发大字。 */
  const finishPomodoro = useCallback(() => {
    const current = pomodoroRef.current
    setPomodoro(null)
    setRemaining(0)
    if (!current) return
    dispatch({ type: 'pomodoroDone', id: current.cardId })
    if (settingsRef.current.soundOnComplete) playTimerSound()
    setFlash({ id: Date.now(), text: '时间到' })
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_DURATION)
  }, [])

  const completeCard = useCallback(
    (id: string) => {
      if (pomodoroRef.current?.cardId === id) {
        pomodoroRef.current = null
        setPomodoro(null)
        setRemaining(0)
      }
      celebrate('已完成')
    },
    [celebrate],
  )

  const startPomodoro = useCallback(
    (cardId: string, minutes: number, label: string) => {
      const next = { cardId, endsAt: Date.now() + minutes * 60_000, label }
      pomodoroRef.current = next
      setPomodoro(next)
      setRemaining(minutes * 60_000)
      notify(`${label} · ${minutes} 分钟，开始计时`)
    },
    [notify],
  )

  // 番茄钟倒计时：每秒刷数字，到点收尾。
  useEffect(() => {
    if (!pomodoro) return
    const tick = () => {
      const left = pomodoro.endsAt - Date.now()
      setRemaining(left)
      if (left <= 0) finishPomodoro()
    }
    tick()
    const timer = window.setInterval(tick, TIMER_TICK)
    return () => window.clearInterval(timer)
  }, [pomodoro, finishPomodoro])

  // 专注模式跟随当前卡片收缩 / 放大桌面窗口。
  const focusCurrentWidth = cards.find((card) => card.id === focusCurrentId)?.width
  const focusCurrentHeight = cards.find((card) => card.id === focusCurrentId)?.height
  useEffect(() => {
    if (focusPhase === 'idle' || !focusCurrentId) return
    const current = stateRef.current.cards.find((card) => card.id === focusCurrentId)
    if (!current) return
    const size = focusStackSize(current)
    void resizeFocusWindow(size.width, size.height)
  }, [focusPhase, focusCurrentId, focusCurrentWidth, focusCurrentHeight])

  // 进入 / 退出各留一段动画时间；退出完成后再恢复普通窗口。
  useEffect(() => {
    if (focusPhase === 'entering') {
      focusPhaseTimer.current = window.setTimeout(() => setFocusPhase('active'), 780)
    } else if (focusPhase === 'exiting') {
      focusPhaseTimer.current = window.setTimeout(() => {
        void (async () => {
          await restoreFocusWindow(focusWindowSnapshot.current)
          dispatch({ type: 'restoreLayout', cards: focusLayoutSnapshot.current })
          focusWindowSnapshot.current = null
          focusLayoutSnapshot.current = []
          zoneReady.current = false
          setFocusPhase('idle')
          setFocusCurrentId(null)
          focusCurrentRef.current = null
          setFocusTransition(null)
          setFocusBarHidden(false)
        })()
      }, 520)
    }
    return () => {
      if (focusPhaseTimer.current !== null) window.clearTimeout(focusPhaseTimer.current)
    }
  }, [focusPhase])

  // 失去窗口焦点两秒后收起专注面板，重新聚焦时再滑出来。
  useEffect(() => {
    if (focusPhase === 'idle') return
    const hide = () => {
      if (focusHideTimer.current !== null) window.clearTimeout(focusHideTimer.current)
      focusHideTimer.current = window.setTimeout(() => setFocusBarHidden(true), 2000)
    }
    const show = () => {
      if (focusHideTimer.current !== null) window.clearTimeout(focusHideTimer.current)
      setFocusBarHidden(false)
    }
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    return () => {
      if (focusHideTimer.current !== null) window.clearTimeout(focusHideTimer.current)
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
    }
  }, [focusPhase])

  /**
   * 图片预览走独立窗口：主面板把这一张图写进 localStorage，
   * 预览窗按 id 读出来，两边互不阻塞，面板该拖该改都不受影响。
   */
  const openPreview = useCallback(
    async (attachment: Attachment) => {
      if (!attachment.src) {
        notify('这张图片没有内容，打不开')
        return
      }
      const payloadId = putPreviewPayload({
        name: attachment.name || '图片',
        src: attachment.src,
      })
      if (!payloadId) {
        notify('图片太大，本地存不下，没法单独打开')
        return
      }
      const opened = await openPreviewWindow(payloadId, attachment.name || '图片预览')
      if (!opened) notify('预览窗口没能打开，请稍后再试')
    },
    [notify],
  )

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    dispatch({ type: 'settings', patch })
  }, [])

  // 音频响应：开了就让 Rust 那边开始抓系统声音，关掉（或离开）就停。
  useEffect(() => {
    if (!isDesktop || !settings.audioReactive) return
    let cancelled = false
    void startAudio().then((ok) => {
      if (cancelled || ok) return
      patchSettings({ audioReactive: false })
      notify('没打开系统音频（可能被占用或系统不支持），音频响应已关闭')
    })
    return () => {
      cancelled = true
      void stopAudio()
    }
  }, [settings.audioReactive, patchSettings, notify])

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

  /** 跑托盘上的一个快捷方式。 */
  const runTrayTool = useCallback(
    async (tool: TrayTool) => {
      if (tool.kind === 'open') {
        const opened = await openTarget(tool.value)
        notify(opened ? `已打开 ${tool.label}` : `打不开「${tool.value}」`)
        return
      }
      if (tool.kind === 'command') {
        const ok = await runCommand(tool.value)
        notify(ok ? `已执行 ${tool.label}` : '命令没能执行，检查一下设置里的写法')
        return
      }
      switch (tool.value) {
        case 'arrange':
          arrange()
          break
        case 'archive':
          setArchiveOpen(true)
          setSettingsOpen(false)
          break
        case 'settings':
          setSettingsOpen(true)
          setArchiveOpen(false)
          break
        case 'new-card':
          addCard()
          break
        case 'collapse-all':
          dispatch({ type: 'collapseAll', value: !allCollapsed })
          break
        default:
          notify(`不认识的托盘动作：${tool.value}`)
      }
    },
    [addCard, allCollapsed, arrange, notify],
  )

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (!open) setArchiveOpen(false)
      return !open
    })
  }, [])

  const requestUpdateCheck = useCallback(
    async (manual: boolean) => {
      if (!isDesktop) return
      setUpdate({ status: 'checking' })
      const result = await runUpdateCheck()
      setUpdate(result)
      if (result.status === 'available') {
        notify(`发现新版本 ${result.version}，可在设置里下载安装`)
      } else if (manual && result.status === 'latest') {
        notify('已经是最新版本')
      } else if (manual && result.status === 'error') {
        notify(`检查更新失败：${result.message}`)
      }
    },
    [notify],
  )

  const requestInstallUpdate = useCallback(async () => {
    setUpdate({ status: 'installing', percent: 0 })
    const ok = await installUpdate((percent) => setUpdate({ status: 'installing', percent }))
    if (!ok) {
      setUpdate({ status: 'error', message: '安装失败，请到 Release 页面手动下载' })
      notify('更新安装失败')
    }
  }, [notify])

  // 记一下版本号，并（在开着自动检查时）启动几秒后问一次更新。
  useEffect(() => {
    if (!isDesktop) return
    void appVersion().then(setVersion)
  }, [])

  useEffect(() => {
    if (!isDesktop || !settings.autoCheckUpdate) return
    const timer = window.setTimeout(() => void requestUpdateCheck(false), 4000)
    return () => window.clearTimeout(timer)
    // 只在启动时问一次，之后由设置里的按钮手动触发。
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (focusPhaseRef.current !== 'idle') {
        if (event.key === 'Escape') {
          event.preventDefault()
          exitFocus()
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          switchFocus('previous')
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          switchFocus('next')
        }
        return
      }
      if (event.key === 'Escape') {
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
  }, [addCard, toggleSettings, exitFocus, switchFocus])

  return (
    <div
      className={`shell${settings.audioReactive ? ' is-audio' : ''}${focusPhase !== 'idle' ? ' is-focus' : ''}${focusPhase === 'entering' ? ' is-focus-entering' : ''}${focusPhase === 'exiting' ? ' is-focus-exiting' : ''}`}
    >
      <div className="panel">
        {/* 频谱垫在所有卡片下面，是面板背景的一部分，不是浮层。 */}
        {settings.audioReactive && focusPhase === 'idle' ? <Spectrum label="系统音频" /> : null}

        {/* 番茄钟进行中：面板背景上一个很大的剩余时间。 */}
        {pomodoro && focusPhase === 'idle' ? (
          <div className="countdown" aria-hidden="true">
            {formatClock(remaining)}
          </div>
        ) : null}

        <div className={`topbar-shell${focusPhase !== 'idle' ? ' is-collapsed' : ''}`}>
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
          allCollapsed={allCollapsed}
          settingsOpen={settingsOpen}
          archiveOpen={archiveOpen}
          hasUpdate={update.status === 'available'}
          onArrange={arrange}
          onToggleCollapseAll={() => dispatch({ type: 'collapseAll', value: !allCollapsed })}
          onCycleTheme={cycleTheme}
          onToggleArchive={toggleArchive}
          onToggleSettings={toggleSettings}
          onToggleAlwaysOnTop={() => patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
          onMinimize={() => void minimizeWindow()}
          onMaximize={() => void toggleMaximizeWindow()}
          onClose={() => void closeWindow()}
        />
        </div>

        {focusPhase === 'idle' ? (
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
            handleFocusCardRemoved(id)
            notify('已删除卡片')
          }}
          onArchive={(id) => {
            dispatch({ type: 'archive', id })
            handleFocusCardRemoved(id)
            notify('已归档，可在「归档」里找到')
          }}
          onComplete={completeCard}
          onPreview={(attachment) => void openPreview(attachment)}
          onNotify={notify}
          moving={arranging}
          timingId={pomodoro?.cardId ?? null}
          zone={zone}
          boardRef={boardRef}
          onBlurBoard={() => {
            dispatch({ type: 'blur' })
            setSettingsOpen(false)
            setArchiveOpen(false)
          }}
        />
        ) : (
          <FocusView
            cards={cards}
            currentId={focusCurrentId}
            transition={focusTransition}
            phase={focusPhase}
            now={now}
            alwaysOnTop={settings.alwaysOnTop}
            shortMinutes={settings.pomodoroShort}
            longMinutes={settings.pomodoroLong}
            timerCardId={pomodoro?.cardId ?? null}
            remainingLabel={pomodoro ? formatClock(remaining) : null}
            audioReactive={settings.audioReactive}
            barHidden={focusBarHidden}
            onSelectCard={selectFocusCard}
            onUpdate={updateCard}
            onRemove={(id) => {
              dispatch({ type: 'remove', id })
              handleFocusCardRemoved(id)
              notify('已删除卡片')
            }}
            onArchive={(id) => {
              dispatch({ type: 'archive', id })
              handleFocusCardRemoved(id)
              notify('已归档，可在「归档」里找到')
            }}
            onComplete={completeCard}
            onPreview={(attachment) => void openPreview(attachment)}
            onNotify={notify}
            onToggleAlwaysOnTop={() => patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
            onPrevious={() => switchFocus('previous')}
            onNext={() => switchFocus('next')}
            onStartPomodoro={(minutes, label) => {
              if (focusCurrentRef.current) startPomodoro(focusCurrentRef.current, minutes, label)
            }}
            onExit={exitFocus}
          />
        )}

        {focusPhase === 'idle' && archiveOpen ? (
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

        {focusPhase === 'idle' && settingsOpen ? (
          <SettingsDrawer
            settings={settings}
            isDesktop={isDesktop}
            onPatch={patchSettings}
            onArrange={arrange}
            onCollapseAll={() => dispatch({ type: 'collapseAll', value: true })}
            onClear={requestClear}
            onRestore={() => {
              dispatch({ type: 'restoreExamples', zone: zoneRef.current })
              notify('已恢复示例卡片')
            }}
            version={version}
            update={update}
            onCheckUpdate={() => void requestUpdateCheck(true)}
            onInstallUpdate={() => void requestInstallUpdate()}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {toast ? (
          <div className={`toast${toastLeaving ? ' is-leaving' : ''}`} role="status">
            {toast}
          </div>
        ) : null}

        {/* 完成卡片时屏幕中央的大字，纯装饰、不挡操作。 */}
        {flash ? (
          <div className="flash" key={flash.id} aria-hidden="true">
            <span className="flash__text">{flash.text}</span>
          </div>
        ) : null}

        {focusPhase === 'idle' ? (
        <TomatoBar
          shortMinutes={settings.pomodoroShort}
          longMinutes={settings.pomodoroLong}
          isRunning={Boolean(pomodoro)}
          tools={settings.trayTools}
          showPomodoro={settings.trayShowPomodoro}
          showTools={settings.trayShowTools}
          align={settings.trayAlign}
          onRunTool={(tool) => void runTrayTool(tool)}
          onEditTools={() => {
            setSettingsOpen(true)
            setArchiveOpen(false)
          }}
          onEnterFocus={() => void enterFocus()}
          onHoverCard={setDropTargetId}
          onDropOnCard={(cardId, tomato) => {
            setDropTargetId(null)
            startPomodoro(cardId, tomato.minutes, tomato.label)
          }}
          onDropNothing={() => {
            setDropTargetId(null)
            notify('把番茄拖到某张卡片上才开始计时')
          }}
          onCancel={() => {
            setPomodoro(null)
            setRemaining(0)
            notify('已取消番茄钟')
          }}
        />
        ) : null}
      </div>
    </div>
  )
}
