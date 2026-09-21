import { CARD_MIN_HEIGHT, CARD_MIN_WIDTH, TONES } from './types'
import type { BoardState, CardData, CardTone, Settings, ThemeMode } from './types'

const STORAGE_KEY = 'nemu-float.board.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  accent: 'sky',
  panelOpacity: 1,
  grain: 0.5,
  frost: 62,
  snapToGrid: false,
  showGrid: false,
  alwaysOnTop: true,
  dimOnBlur: true,
  blurBehind: true,
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, num))
}

function readTone(value: unknown, fallback: CardTone): CardTone {
  return typeof value === 'string' && (TONES as string[]).includes(value)
    ? (value as CardTone)
    : fallback
}

function readTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'light'
}

function readCard(raw: unknown, index: number): CardData | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (typeof source.id !== 'string' || source.id.length === 0) return null
  const now = Date.now()
  const width = clampNumber(source.width, CARD_MIN_WIDTH, 900, 320)
  const height = clampNumber(source.height, CARD_MIN_HEIGHT, 800, 220)
  return {
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '未命名卡片',
    body: typeof source.body === 'string' ? source.body : '',
    tone: readTone(source.tone, TONES[index % TONES.length] as CardTone),
    x: clampNumber(source.x, -4000, 8000, 24 + index * 28),
    y: clampNumber(source.y, -4000, 8000, 24 + index * 28),
    width,
    height,
    z: clampNumber(source.z, 1, 999999, index + 1),
    pinned: source.pinned === true,
    collapsed: source.collapsed === true,
    createdAt: clampNumber(source.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: clampNumber(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, now),
  }
}

export function parseState(raw: unknown): BoardState | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (!Array.isArray(source.cards)) return null
  const cards = source.cards
    .map((card, index) => readCard(card, index))
    .filter((card): card is CardData => card !== null)
  const settingsRaw =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Record<string, unknown>)
      : {}
  return {
    version: 1,
    cards,
    settings: {
      theme: readTheme(settingsRaw.theme),
      accent: readTone(settingsRaw.accent, DEFAULT_SETTINGS.accent),
      panelOpacity: clampNumber(settingsRaw.panelOpacity, 0.55, 1, 1),
      grain: clampNumber(settingsRaw.grain, 0, 0.9, DEFAULT_SETTINGS.grain),
      frost: clampNumber(settingsRaw.frost, 0, 100, DEFAULT_SETTINGS.frost),
      snapToGrid: settingsRaw.snapToGrid === true,
      showGrid: settingsRaw.showGrid === true,
      alwaysOnTop: settingsRaw.alwaysOnTop !== false,
      dimOnBlur: settingsRaw.dimOnBlur !== false,
      blurBehind: settingsRaw.blurBehind === true,
    },
    nextZ: clampNumber(source.nextZ, 1, 999999, cards.length + 1),
    activeId: null,
  }
}

export function loadState(): BoardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveState(state: BoardState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, activeId: undefined }),
    )
  } catch {
    return
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}
