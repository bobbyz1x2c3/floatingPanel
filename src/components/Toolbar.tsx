import type { RefObject } from 'react'
import { NeuButton, NeuField } from './controls'
import {
  IconArchive,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconGrid,
  IconMonitor,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSliders,
  IconSun,
} from './icons'
import type { CardTone, ThemeMode } from '../lib/types'

export interface ToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  cardCount: number
  matchCount: number
  archivedCount: number
  theme: ThemeMode
  accent: CardTone
  allCollapsed: boolean
  settingsOpen: boolean
  archiveOpen: boolean
  onAdd: () => void
  onArrange: () => void
  onToggleCollapseAll: () => void
  onCycleTheme: () => void
  onToggleArchive: () => void
  onToggleSettings: () => void
  searchRef?: RefObject<HTMLInputElement | null>
}

const THEME_LABEL: Record<ThemeMode, string> = {
  light: '浅色主题',
  dark: '深色主题',
  system: '跟随系统',
}

export function Toolbar({
  query,
  onQueryChange,
  cardCount,
  matchCount,
  archivedCount,
  theme,
  accent,
  allCollapsed,
  settingsOpen,
  archiveOpen,
  onAdd,
  onArrange,
  onToggleCollapseAll,
  onCycleTheme,
  onToggleArchive,
  onToggleSettings,
  searchRef,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <NeuButton variant="primary" className="toolbar__add" onClick={onAdd} data-tone={accent}>
        <IconPlus size={17} />
        <span className="toolbar__label">新建</span>
      </NeuButton>

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

      <div className="toolbar__spacer" />

      {query.trim() ? (
        <span className="nm-chip toolbar__hits" aria-live="polite">
          <span className="nm-chip__dot" style={{ background: 'var(--nm-accent)' }} />
          {matchCount} / {cardCount}
        </span>
      ) : null}

      <NeuButton
        className="toolbar__arrange"
        aria-label="整理布局"
        title="按象限重新排列卡片"
        onClick={onArrange}
        disabled={cardCount === 0}
      >
        <IconGrid size={16} />
        <span className="toolbar__label">整理</span>
      </NeuButton>

      <NeuButton
        iconOnly
        aria-label={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
        title={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
        onClick={onToggleCollapseAll}
        disabled={cardCount === 0}
      >
        {allCollapsed ? <IconChevronDown size={17} /> : <IconChevronUp size={17} />}
      </NeuButton>

      <NeuButton
        iconOnly
        aria-label={THEME_LABEL[theme]}
        title={THEME_LABEL[theme]}
        onClick={onCycleTheme}
      >
        {theme === 'light' ? (
          <IconSun size={17} />
        ) : theme === 'dark' ? (
          <IconMoon size={17} />
        ) : (
          <IconMonitor size={17} />
        )}
      </NeuButton>

      <NeuButton
        active={archiveOpen}
        aria-label={`归档 ${archivedCount} 张卡片`}
        title={`归档 · 已归档 ${archivedCount} 张`}
        onClick={onToggleArchive}
      >
        <IconArchive size={17} />
        <span className="toolbar__label">归档</span>
        <span className={`toolbar__badge${archivedCount > 0 ? ' is-live' : ''}`}>
          {archivedCount}
        </span>
      </NeuButton>

      <NeuButton
        iconOnly
        active={settingsOpen}
        aria-label="外观与窗口设置"
        title="外观与窗口设置"
        onClick={onToggleSettings}
      >
        <IconSliders size={17} />
      </NeuButton>
    </div>
  )
}
