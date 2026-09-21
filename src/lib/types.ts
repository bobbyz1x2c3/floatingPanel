export type CardTone = 'sky' | 'rose' | 'mint' | 'amber' | 'violet' | 'graphite'

export type ThemeMode = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export interface CardData {
  id: string
  title: string
  body: string
  tone: CardTone
  x: number
  y: number
  width: number
  height: number
  z: number
  pinned: boolean
  collapsed: boolean
  createdAt: number
  updatedAt: number
}

export interface Settings {
  theme: ThemeMode
  accent: CardTone
  panelOpacity: number
  grain: number
  frost: number
  snapToGrid: boolean
  showGrid: boolean
  alwaysOnTop: boolean
  dimOnBlur: boolean
  blurBehind: boolean
}

export interface BoardState {
  version: number
  cards: CardData[]
  settings: Settings
  nextZ: number
  activeId: string | null
}

export const TONES: CardTone[] = ['sky', 'rose', 'mint', 'amber', 'violet', 'graphite']

export const TONE_LABELS: Record<CardTone, string> = {
  sky: '天蓝',
  rose: '玫瑰',
  mint: '薄荷',
  amber: '琥珀',
  violet: '紫罗兰',
  graphite: '石墨',
}

export const CARD_MIN_WIDTH = 230
export const CARD_MIN_HEIGHT = 132
export const CARD_MAX_WIDTH = 780
export const CARD_MAX_HEIGHT = 700
export const GRID_STEP = 26
