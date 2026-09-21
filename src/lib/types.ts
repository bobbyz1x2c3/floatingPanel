export type CardTone = 'sky' | 'rose' | 'mint' | 'amber' | 'violet' | 'graphite'

export type ThemeMode = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop'

export interface Attachment {
  id: string
  name: string
  kind: 'image' | 'file'
  src: string
  size: number
}

export interface CardData {
  id: string
  title: string
  body: string
  tone: CardTone
  quadrant: Quadrant
  attachments: Attachment[]
  x: number
  y: number
  width: number
  height: number
  z: number
  collapsed: boolean
  createdAt: number
  updatedAt: number
}

export interface ArchivedCard extends CardData {
  archivedAt: number
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
  archived: ArchivedCard[]
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
export const CARD_MIN_HEIGHT = 150
export const CARD_MAX_WIDTH = 780
export const CARD_MAX_HEIGHT = 700
export const GRID_STEP = 26

export const ZONE_WIDTH = 560
export const ZONE_HEIGHT = 400
export const ZONE_INSET = 16

export const CANVAS_MIN_WIDTH = ZONE_WIDTH * 2
export const CANVAS_MIN_HEIGHT = ZONE_HEIGHT * 2

export const QUADRANTS: Quadrant[] = ['schedule', 'do', 'drop', 'delegate']

export interface QuadrantMeta {
  key: Quadrant
  title: string
  hint: string
  position: string
  tone: CardTone
  column: 0 | 1
  row: 0 | 1
}

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
  schedule: {
    key: 'schedule',
    title: '重要 · 不紧急',
    hint: '计划去做',
    position: '左上',
    tone: 'sky',
    column: 0,
    row: 0,
  },
  do: {
    key: 'do',
    title: '紧急 · 重要',
    hint: '立刻去做',
    position: '右上',
    tone: 'rose',
    column: 1,
    row: 0,
  },
  drop: {
    key: 'drop',
    title: '不重要 · 不紧急',
    hint: '有空再说',
    position: '左下',
    tone: 'graphite',
    column: 0,
    row: 1,
  },
  delegate: {
    key: 'delegate',
    title: '紧急 · 不重要',
    hint: '交给别人',
    position: '右下',
    tone: 'amber',
    column: 1,
    row: 1,
  },
}

export function quadrantOrigin(quadrant: Quadrant): { x: number; y: number } {
  const meta = QUADRANT_META[quadrant]
  return { x: meta.column * ZONE_WIDTH, y: meta.row * ZONE_HEIGHT }
}

export function quadrantFromPoint(x: number, y: number): Quadrant {
  const column = x >= ZONE_WIDTH ? 1 : 0
  const row = y >= ZONE_HEIGHT ? 1 : 0
  if (column === 0) return row === 0 ? 'schedule' : 'drop'
  return row === 0 ? 'do' : 'delegate'
}

export function isQuadrant(value: unknown): value is Quadrant {
  return typeof value === 'string' && (QUADRANTS as string[]).includes(value)
}

export function isTone(value: unknown): value is CardTone {
  return typeof value === 'string' && (TONES as string[]).includes(value)
}
