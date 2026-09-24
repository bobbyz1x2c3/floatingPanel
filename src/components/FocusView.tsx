import tomatoSmall from '../../assets/tomato-small.png'
import tomatoBig from '../../assets/tomato-big.png'
import type { CSSProperties } from 'react'
import { FOCUS_WINDOW_PADDING_X, FOCUS_WINDOW_PADDING_Y, focusOrderedCards, focusStackOffset } from '../lib/focus'
import type {
  FocusCardTransition,
  FocusDirection,
  FocusPhase,
} from '../lib/focus'
import type { Attachment, CardData } from '../lib/types'
import { CardView } from './CardView'
import { IconChevronLeft, IconChevronRight } from './focusIcons'
import { IconClose, IconPin } from './icons'
import { TrayButton } from './TomatoBar'

export interface FocusViewProps {
  cards: CardData[]
  currentId: string | null
  transition: {
    previousId: string
    direction: FocusDirection
    sizeChange: boolean
  } | null
  phase: FocusPhase
  now: number
  alwaysOnTop: boolean
  shortMinutes: number
  longMinutes: number
  timerCardId: string | null
  remainingLabel: string | null
  audioReactive: boolean
  barHidden: boolean
  onSelectCard: (id: string) => void
  onUpdate: (id: string, patch: Partial<CardData>, touch?: boolean) => void
  onRemove: (id: string) => void
  onArchive: (id: string) => void
  onComplete: (id: string) => void
  onPreview: (attachment: Attachment) => void
  onNotify: (message: string) => void
  onToggleAlwaysOnTop: () => void
  onPrevious: () => void
  onNext: () => void
  onStartPomodoro: (minutes: number, label: string) => void
  onExit: () => void
}

function transitionFor(
  cardId: string,
  currentId: string | null,
  transition: FocusViewProps['transition'],
): FocusCardTransition {
  if (!transition) return null
  if (cardId === currentId) return `enter-${transition.direction}`
  if (cardId === transition.previousId) return `leave-${transition.direction}`
  return null
}

export function FocusView({
  cards,
  currentId,
  transition,
  phase,
  now,
  alwaysOnTop,
  shortMinutes,
  longMinutes,
  timerCardId,
  remainingLabel,
  audioReactive,
  barHidden,
  onSelectCard,
  onUpdate,
  onRemove,
  onArchive,
  onComplete,
  onPreview,
  onNotify,
  onToggleAlwaysOnTop,
  onPrevious,
  onNext,
  onStartPomodoro,
  onExit,
}: FocusViewProps) {
  const ordered = focusOrderedCards(cards)
  const currentIndex = Math.max(0, ordered.findIndex((card) => card.id === currentId))
  const currentCard = ordered[currentIndex]
  const sharedWidth = currentCard?.width ?? 0
  const sharedHeight = currentCard?.height ?? 0
  const stageWidth = sharedWidth + FOCUS_WINDOW_PADDING_X
  const exiting = phase === 'exiting'
  const currentHeight = exiting ? (currentCard?.collapsed ? 58 : currentCard?.height ?? sharedHeight) : sharedHeight
  const stageHeight = currentHeight + FOCUS_WINDOW_PADDING_Y

  return (
    <div
      className="focus-view"
      style={{
        '--focus-card-height': `${stageHeight}px`,
        '--focus-card-width': `${stageWidth}px`,
      } as CSSProperties}
    >
      <div
        className={`focus-stage focus-stage--${phase}`}
        role="region"
        aria-label="专注模式卡片"
      >
        {cards.map((card) => {
          const orderedIndex = Math.max(
            0,
            ordered.findIndex((item) => item.id === card.id),
          )
          const count = ordered.length
          const distance = Math.min((orderedIndex - currentIndex + count) % count, 3)
          const offset = focusStackOffset(orderedIndex, currentIndex, count)
          const isCurrent = card.id === currentId
          const transitionClass = transitionFor(card.id, currentId, transition)
          return (
            <CardView
              key={card.id}
              card={card}
              now={now}
              active={isCurrent}
              dimmed={false}
              matched={false}
              dropTarget={false}
              snap={false}
              zone={{ width: card.width, height: card.height }}
              onChange={(patch, touch) => onUpdate(card.id, patch, touch)}
              onBringToFront={() => onSelectCard(card.id)}
              onRemove={() => onRemove(card.id)}
              onArchive={() => onArchive(card.id)}
              onComplete={onComplete}
              onPreview={onPreview}
              onNotify={onNotify}
              timing={timerCardId === card.id}
              focusMode
              focusCurrent={isCurrent}
              focusDepth={distance}
              focusOffsetX={offset.x}
              focusOffsetY={offset.y}
              focusTransition={transitionClass}
              focusSizeChange={Boolean(transition?.sizeChange && isCurrent)}
              displayWidth={exiting ? card.width : sharedWidth}
              displayHeight={exiting ? (card.collapsed ? 58 : card.height) : sharedHeight}
              focusExiting={exiting}
              backgroundClock={timerCardId === card.id ? remainingLabel : null}
              audioBackground={audioReactive && isCurrent}
            />
          )
        })}
      </div>

      <FocusBar
        phase={phase}
        hidden={barHidden}
        alwaysOnTop={alwaysOnTop}
        shortMinutes={shortMinutes}
        longMinutes={longMinutes}
        onToggleAlwaysOnTop={onToggleAlwaysOnTop}
        onPrevious={onPrevious}
        onNext={onNext}
        onStartPomodoro={onStartPomodoro}
        onExit={onExit}
      />
    </div>
  )
}

interface FocusBarProps {
  phase: FocusPhase
  hidden: boolean
  alwaysOnTop: boolean
  shortMinutes: number
  longMinutes: number
  onToggleAlwaysOnTop: () => void
  onPrevious: () => void
  onNext: () => void
  onStartPomodoro: (minutes: number, label: string) => void
  onExit: () => void
}

function FocusBar({
  phase,
  hidden,
  alwaysOnTop,
  shortMinutes,
  longMinutes,
  onToggleAlwaysOnTop,
  onPrevious,
  onNext,
  onStartPomodoro,
  onExit,
}: FocusBarProps) {
  return (
    <div
      className={`focus-bar${hidden ? ' is-hidden' : ''}${phase === 'exiting' ? ' is-exiting' : ''}`}
      role="toolbar"
      aria-label="专注模式控制"
    >
      <div className="focus-bar__inner">
        <TrayButton
          label={alwaysOnTop ? '取消窗口置顶' : '切换窗口置顶'}
          tone="ghost"
          active={alwaysOnTop}
          onClick={onToggleAlwaysOnTop}
        >
          <IconPin size={18} />
        </TrayButton>
        <TrayButton label="上一张卡片" tone="ghost" onClick={onPrevious}>
          <IconChevronLeft size={18} />
        </TrayButton>
        <TrayButton label="下一张卡片" tone="ghost" onClick={onNext}>
          <IconChevronRight size={18} />
        </TrayButton>
        <span className="focus-bar__rule" aria-hidden="true" />
        <TrayButton
          label={`小番茄 ${shortMinutes} 分钟`}
          tone="tomato"
          size="lg"
          onClick={() => onStartPomodoro(shortMinutes, '小番茄')}
        >
          <img src={tomatoSmall} alt="" draggable={false} />
        </TrayButton>
        <TrayButton
          label={`大番茄 ${longMinutes} 分钟`}
          tone="tomato"
          size="lg"
          onClick={() => onStartPomodoro(longMinutes, '大番茄')}
        >
          <img src={tomatoBig} alt="" draggable={false} />
        </TrayButton>
        <span className="focus-bar__rule" aria-hidden="true" />
        <TrayButton label="退出专注模式" tone="ghost" onClick={onExit}>
          <IconClose size={18} />
        </TrayButton>
      </div>
    </div>
  )
}
