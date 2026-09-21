import { NeuButton } from './controls'
import { IconClose, IconMinus, IconPin } from './icons'

export interface TitleBarProps {
  isDesktop: boolean
  platformLabel: string
  alwaysOnTop: boolean
  cardCount: number
  onToggleAlwaysOnTop: () => void
  onMinimize: () => void
  onClose: () => void
}

export function TitleBar({
  isDesktop,
  platformLabel,
  alwaysOnTop,
  cardCount,
  onToggleAlwaysOnTop,
  onMinimize,
  onClose,
}: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <span className="brand-mark" data-tauri-drag-region aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
        <div className="brand-text" data-tauri-drag-region>
          <h1 className="brand-text__title" data-tauri-drag-region>
            悬浮卡片
          </h1>
          <p className="brand-text__meta" data-tauri-drag-region>
            {platformLabel} · <span className="titlebar__meta-full">{cardCount} 张卡片</span>
          </p>
        </div>
      </div>

      <div className="titlebar__spacer" data-tauri-drag-region />

      <div className="titlebar__tools">
        <NeuButton
          iconOnly
          active={alwaysOnTop}
          disabled={!isDesktop}
          aria-label="窗口置顶"
          title={isDesktop ? '窗口始终置顶' : '窗口置顶仅桌面端可用'}
          onClick={onToggleAlwaysOnTop}
        >
          <IconPin size={17} />
        </NeuButton>
        <NeuButton
          iconOnly
          disabled={!isDesktop}
          aria-label="最小化"
          title={isDesktop ? '最小化窗口' : '仅桌面端可用'}
          onClick={onMinimize}
        >
          <IconMinus size={17} />
        </NeuButton>
        <NeuButton
          iconOnly
          variant="danger"
          disabled={!isDesktop}
          aria-label="关闭"
          title={isDesktop ? '关闭窗口' : '仅桌面端可用'}
          onClick={onClose}
        >
          <IconClose size={17} />
        </NeuButton>
      </div>
    </header>
  )
}
