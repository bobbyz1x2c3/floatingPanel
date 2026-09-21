import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Board } from './components/Board'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import {
  applyAlwaysOnTop,
  applyBlurBehind,
  closeWindow,
  isDesktop,
  minimizeWindow,
  platformLabel,
} from './lib/platform'
import { clearState, loadState, saveState } from './lib/storage'
import { boardReducer, createInitialState } from './lib/store'
import type { CardData, Settings } from './lib/types'
import './styles/tokens.css'
import './styles/neumorphism.css'
import './styles/app.css'

const PERSIST_DELAY = 320
const TICK_INTERVAL = 30000

function resolveInitialState() {
  return loadState() ?? createInitialState()
}

export function App() {
  const [state, dispatch] = useReducer(boardReducer, null, resolveInitialState)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [systemDark, setSystemDark] = useState(false)
  const [windowFocused, setWindowFocused] = useState(true)
  const toastTimer = useRef<number | null>(null)
  const confirmTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const { cards, settings } = state

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    const timer = window.setTimeout(() => saveState(state), PERSIST_DELAY)
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL)
    return () => window.clearInterval(handle)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(query.matches)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
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

  const addCard = useCallback(() => {
    const offset = (cards.length % 6) * 26
    dispatch({ type: 'add', x: 30 + offset, y: 26 + offset })
    setQuery('')
  }, [cards.length])

  const addCardAt = useCallback((x: number, y: number) => {
    dispatch({ type: 'add', x, y })
  }, [])

  const updateCard = useCallback(
    (id: string, patch: Partial<CardData>, touch?: boolean) => {
      dispatch({ type: 'update', id, patch, touch })
    },
    [],
  )

  const arrange = useCallback(() => {
    const usable = window.innerWidth - 96
    const columns = Math.max(1, Math.min(6, Math.floor(usable / 372)))
    dispatch({ type: 'arrange', columns })
    notify('已按内容整理布局')
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
        card.body.toLowerCase().includes(needle),
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
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
        setSettingsOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addCard])

  const isDimmed = settings.dimOnBlur && !windowFocused && !settingsOpen

  return (
    <div className={`shell${isDimmed ? ' is-dimmed' : ''}`}>
      <div className="panel">
        <TitleBar
          isDesktop={isDesktop}
          platformLabel={platformLabel}
          alwaysOnTop={settings.alwaysOnTop}
          cardCount={cards.length}
          onToggleAlwaysOnTop={() => patchSettings({ alwaysOnTop: !settings.alwaysOnTop })}
          onMinimize={() => void minimizeWindow()}
          onClose={() => void closeWindow()}
        />

        <Toolbar
          searchRef={searchRef}
          query={query}
          onQueryChange={setQuery}
          cardCount={cards.length}
          matchCount={matchCount}
          theme={settings.theme}
          accent={settings.accent}
          allCollapsed={allCollapsed}
          settingsOpen={settingsOpen}
          onAdd={addCard}
          onArrange={arrange}
          onToggleCollapseAll={() =>
            dispatch({ type: 'collapseAll', value: !allCollapsed })
          }
          onCycleTheme={cycleTheme}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />

        <Board
          cards={cards}
          activeId={state.activeId}
          query={query}
          snap={settings.snapToGrid}
          showGrid={settings.showGrid}
          now={now}
          onAddAt={addCardAt}
          onUpdate={updateCard}
          onFocus={(id) => dispatch({ type: 'focus', id })}
          onRemove={(id) => {
            dispatch({ type: 'remove', id })
            notify('已删除卡片')
          }}
          onCycleTone={(id) => dispatch({ type: 'cycleTone', id })}
          onTogglePin={(id) => dispatch({ type: 'togglePin', id })}
          onBlurBoard={() => {
            dispatch({ type: 'blur' })
            setSettingsOpen(false)
          }}
        />

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

        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  )
}
