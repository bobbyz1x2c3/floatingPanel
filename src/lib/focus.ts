import type { CardData } from './types'

/** 专注模式底部控制条占掉的高度：窗口高度 = 当前卡片高度 + 这个值。 */
export const FOCUS_BAR_HEIGHT = 88
/** 当前卡片左右各留 12px，叠在后面的卡片可以从边缘露出来。 */
export const FOCUS_WINDOW_PADDING_X = 24
/** 桌面端窗口在专注模式下允许收缩到的最小逻辑尺寸。 */
export const FOCUS_MIN_WIDTH = 250
export const FOCUS_MIN_HEIGHT = 168

export type FocusDirection = 'next' | 'previous'
export type FocusPhase = 'idle' | 'entering' | 'active' | 'exiting'
export type FocusCardTransition =
  | 'enter-next'
  | 'enter-previous'
  | 'leave-next'
  | 'leave-previous'
  | null

export function focusOrderedCards(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
}

export function focusCardIdInDirection(
  cards: CardData[],
  currentId: string | null,
  direction: FocusDirection,
): string | null {
  const ordered = focusOrderedCards(cards)
  if (ordered.length === 0) return null
  if (ordered.length === 1 || !currentId) return ordered[0]?.id ?? null
  const index = ordered.findIndex((card) => card.id === currentId)
  if (index < 0) return ordered[0]?.id ?? null
  const step = direction === 'next' ? 1 : -1
  return ordered[(index + step + ordered.length) % ordered.length]?.id ?? null
}

export function focusStackSize(card: CardData): { width: number; height: number } {
  return {
    width: Math.ceil(card.width + FOCUS_WINDOW_PADDING_X),
    height: Math.ceil(card.height + FOCUS_BAR_HEIGHT),
  }
}

/** 非当前卡片只偏移一小段，既看得出是一叠，也不会互相完全盖死。 */
export function focusStackOffset(
  cardIndex: number,
  currentIndex: number,
  count: number,
): { x: number; y: number } {
  if (count <= 1 || cardIndex === currentIndex) return { x: 0, y: 0 }
  const forward = (cardIndex - currentIndex + count) % count
  const distance = Math.min(forward <= count / 2 ? forward : count - forward, 3)
  const side = forward <= count / 2 ? 1 : -1
  return {
    x: side * distance * 7,
    y: side * distance * 6,
  }
}
