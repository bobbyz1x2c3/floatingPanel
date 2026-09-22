import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { observeMaximized } from '../lib/platform'
import { NeuButton, NeuField } from './controls'
import {
  IconArchive,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconGrid,
  IconMaximize,
  IconMinus,
  IconMonitor,
  IconMoon,
  IconPin,
  IconRestoreWindow,
  IconSearch,
  IconSliders,
  IconSun,
} from './icons'
import type { ThemeMode } from '../lib/types'

export interface TopBarProps {
  isDesktop: boolean
  platformLabel: string
  cardCount: number
  archivedCount: number
  matchCount: number
  query: string
  onQueryChange: (value: string) => void
  theme: ThemeMode
  allCollapsed: boolean
  settingsOpen: boolean
  archiveOpen: boolean
  alwaysOnTop: boolean
  /** 查到新版本时，设置按钮上亮一个小圆点。 */
  hasUpdate: boolean
  onArrange: () => void
  onToggleCollapseAll: () => void
  onCycleTheme: () => void
  onToggleArchive: () => void
  onToggleSettings: () => void
  onToggleAlwaysOnTop: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  searchRef?: RefObject<HTMLInputElement | null>
}

const THEME_LABEL: Record<ThemeMode, string> = {
  light: '浅色主题',
  dark: '深色主题',
  system: '跟随系统',
}

export function TopBar({
  isDesktop,
  platformLabel,
  cardCount,
  archivedCount,
  matchCount,
  query,
  onQueryChange,
  theme,
  allCollapsed,
  settingsOpen,
  archiveOpen,
  alwaysOnTop,
  hasUpdate,
  onArrange,
  onToggleCollapseAll,
  onCycleTheme,
  onToggleArchive,
  onToggleSettings,
  onToggleAlwaysOnTop,
  onMinimize,
  onMaximize,
  onClose,
  searchRef,
}: TopBarProps) {
  const summary = `${platformLabel} · ${cardCount} 张卡片 · 已归档 ${archivedCount}`
  const [maximized, setMaximized] = useState(false)

  useEffect(() => observeMaximized(setMaximized), [])

  /*
    drag-region 用 "deep"：整条菜单栏里凡是不落在按钮 / 输入框上的地方都能拖动窗口。
    标成 bare 的只对元素自己生效，留白的地方照样拖不动，所以这里交给容器。
  */
  return (
    <header className="topbar" data-tauri-drag-region="deep">
      <div className="topbar__side topbar__side--left">
        <div className="topbar__brand" title={summary}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3.4"
                y="6.2"
                width="14.4"
                height="11"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M7.6 3.4h10.6a2.8 2.8 0 0 1 2.8 2.8v9.4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                opacity="0.55"
              />
            </svg>
          </span>
          <h1 className="topbar__title">悬浮卡片</h1>
        </div>
      </div>

      <div className="topbar__center">
        <div className="search">
          <span className="search__icon" aria-hidden="true">
            <IconSearch size={16} />
          </span>
          <NeuField
            ref={searchRef}
            value={query}
            placeholder={cardCount > 0 ? `搜索 ${cardCount} 张卡片…` : '搜索卡片…'}
            aria-label="搜索卡片"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="search__clear"
              aria-label="清空搜索"
              title="清空搜索"
              onClick={() => onQueryChange('')}
            >
              <IconClose size={14} />
            </button>
          ) : null}
        </div>
        {query.trim() ? (
          <span className="nm-chip topbar__hits" aria-live="polite">
            <span className="nm-chip__dot" style={{ background: 'var(--nm-accent)' }} />
            {matchCount} / {cardCount}
          </span>
        ) : null}
      </div>

      <div className="topbar__side topbar__side--right">
        <NeuButton
          iconOnly
          size="sm"
          aria-label="整理布局"
          title="按象限重新排列：优先填满每格里的空位"
          onClick={onArrange}
          disabled={cardCount === 0}
        >
          <IconGrid size={16} />
        </NeuButton>

        <NeuButton
          iconOnly
          size="sm"
          aria-label={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
          title={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
          onClick={onToggleCollapseAll}
          disabled={cardCount === 0}
        >
          {allCollapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
        </NeuButton>

        <NeuButton
          iconOnly
          size="sm"
          aria-label={THEME_LABEL[theme]}
          title={THEME_LABEL[theme]}
          onClick={onCycleTheme}
        >
          {theme === 'light' ? (
            <IconSun size={16} />
          ) : theme === 'dark' ? (
            <IconMoon size={16} />
          ) : (
            <IconMonitor size={16} />
          )}
        </NeuButton>

        <NeuButton
          size="sm"
          active={archiveOpen}
          aria-label={`归档 ${archivedCount} 张卡片`}
          title={`归档 · 已归档 ${archivedCount} 张`}
          onClick={onToggleArchive}
        >
          <IconArchive size={16} />
          <span className="topbar__label">归档</span>
          <span className={`topbar__badge${archivedCount > 0 ? ' is-live' : ''}`}>
            {archivedCount}
          </span>
        </NeuButton>

        <NeuButton
          iconOnly
          size="sm"
          active={settingsOpen}
          aria-label={hasUpdate ? '外观与窗口设置（有新版本）' : '外观与窗口设置'}
          title={hasUpdate ? '外观与窗口设置 · 有新版本可用' : '外观与窗口设置'}
          onClick={onToggleSettings}
        >
          <IconSliders size={16} />
          {hasUpdate ? <span className="topbar__dot" aria-hidden="true" /> : null}
        </NeuButton>

        <span className="topbar__divider" aria-hidden="true" />

        <NeuButton
          iconOnly
          size="sm"
          active={alwaysOnTop}
          disabled={!isDesktop}
          aria-label="窗口置顶"
          title={isDesktop ? '窗口始终置顶' : '窗口置顶仅桌面端可用'}
          onClick={onToggleAlwaysOnTop}
        >
          <IconPin size={16} />
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          disabled={!isDesktop}
          aria-label="最小化"
          title={isDesktop ? '最小化窗口' : '仅桌面端可用'}
          onClick={onMinimize}
        >
          <IconMinus size={16} />
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          disabled={!isDesktop}
          aria-label={maximized ? '还原窗口' : '最大化'}
          title={isDesktop ? (maximized ? '还原窗口' : '最大化窗口') : '仅桌面端可用'}
          onClick={onMaximize}
        >
          {maximized ? <IconRestoreWindow size={15} /> : <IconMaximize size={15} />}
        </NeuButton>
        <NeuButton
          iconOnly
          size="sm"
          variant="danger"
          disabled={!isDesktop}
          aria-label="关闭"
          title={isDesktop ? '关闭窗口' : '仅桌面端可用'}
          onClick={onClose}
        >
          <IconClose size={16} />
        </NeuButton>
      </div>
    </header>
  )
}
