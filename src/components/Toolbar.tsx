import type { RefObject } from 'react'
import { NeuButton, NeuField } from './controls'
import { IconChevronDown, IconChevronUp, IconClose, IconGrid, IconMonitor, IconMoon, IconPlus, IconSearch, IconSliders, IconSun } from './icons'
import type { CardTone, ThemeMode } from '../lib/types'

export interface ToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  cardCount: number
  matchCount: number
  theme: ThemeMode
  accent: CardTone
  allCollapsed: boolean
  settingsOpen: boolean
  onAdd: () => void
  onArrange: () => void
  onToggleCollapseAll: () => void
  onCycleTheme: () => void
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
  theme,
  accent,
  allCollapsed,
  settingsOpen,
  onAdd,
  onArrange,
  onToggleCollapseAll,
  onCycleTheme,
  onToggleSettings,
  searchRef,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <NeuButton variant="primary" onClick={onAdd} data-tone={accent}>
        <IconPlus size={17} />
        新建卡片
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
        <span className="nm-chip" aria-live="polite">
          <span className="nm-chip__dot" style={{ background: 'var(--nm-accent)' }} />
          {matchCount} / {cardCount} 命中
        </span>
      ) : null}

      <NeuButton
        aria-label="整理布局"
        title="按内容整理布局"
        onClick={onArrange}
        disabled={cardCount === 0}
      >
        <IconGrid size={16} />
        整理
      </NeuButton>

      <NeuButton
        aria-label={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
        title={allCollapsed ? '展开全部卡片' : '收起全部卡片'}
        onClick={onToggleCollapseAll}
        disabled={cardCount === 0}
      >
        {allCollapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
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
