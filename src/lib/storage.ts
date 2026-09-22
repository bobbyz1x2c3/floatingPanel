import {
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  QUADRANTS,
  QUADRANT_META,
  TONES,
  isQuadrant,
  isTone,
} from './types'
import type {
  ArchivedCard,
  Attachment,
  BoardState,
  CardData,
  CardTone,
  Quadrant,
  Settings,
  ThemeMode,
} from './types'

const STORAGE_KEY = 'nemu-float.board.v1'
const MAX_ATTACHMENTS = 12
const MAX_ATTACHMENT_CHARS = 4_000_000
const MAX_ARCHIVED = 300

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  accent: 'sky',
  bgTransparency: 0.58,
  grain: 0.5,
  frost: 62,
  snapToGrid: false,
  showGrid: false,
  alwaysOnTop: true,
  soundOnComplete: true,
  audioReactive: false,
  autoCheckUpdate: true,
  pomodoroShort: 15,
  pomodoroLong: 30,
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, num))
}

function readTone(value: unknown, fallback: CardTone): CardTone {
  return isTone(value) ? value : fallback
}

function readQuadrant(value: unknown, fallback: Quadrant): Quadrant {
  return isQuadrant(value) ? value : fallback
}

function readTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'light'
}

function readAttachment(raw: unknown): Attachment | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const src = typeof source.src === 'string' ? source.src : ''
  if (!src || src.length > MAX_ATTACHMENT_CHARS) return null
  const kind = source.kind === 'image' ? 'image' : 'file'
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `att-${src.length}-${Math.random().toString(36).slice(2, 8)}`,
    name: typeof source.name === 'string' && source.name ? source.name : kind === 'image' ? '图片' : '附件',
    kind,
    src,
    size: clampNumber(source.size, 0, Number.MAX_SAFE_INTEGER, 0),
  }
}

function readAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(readAttachment)
    .filter((item): item is Attachment => item !== null)
    .slice(0, MAX_ATTACHMENTS)
}

function readCard(raw: unknown, index: number): CardData | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (typeof source.id !== 'string' || source.id.length === 0) return null
  const now = Date.now()
  // 四象限之前的旧存档没有 quadrant，按顺序补一个，并让配色跟着象限走。
  const hasQuadrant = isQuadrant(source.quadrant)
  const quadrant = readQuadrant(source.quadrant, QUADRANTS[index % QUADRANTS.length] as Quadrant)
  return {
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '未命名卡片',
    body: typeof source.body === 'string' ? source.body : '',
    tone: hasQuadrant ? readTone(source.tone, QUADRANT_META[quadrant].tone) : QUADRANT_META[quadrant].tone,
    quadrant,
    attachments: readAttachments(source.attachments),
    x: clampNumber(source.x, -4000, 8000, 24 + index * 28),
    y: clampNumber(source.y, -4000, 8000, 24 + index * 28),
    width: clampNumber(source.width, CARD_MIN_WIDTH, 900, 340),
    height: clampNumber(source.height, CARD_MIN_HEIGHT, 800, 230),
    z: clampNumber(source.z, 1, 999999, index + 1),
    collapsed: source.collapsed === true,
    pomodoros: clampNumber(source.pomodoros, 0, 999, 0),
    createdAt: clampNumber(source.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: clampNumber(source.updatedAt, 0, Number.MAX_SAFE_INTEGER, now),
  }
}

function readArchived(raw: unknown, index: number): ArchivedCard | null {
  const card = readCard(raw, index)
  if (!card) return null
  const source = raw as Record<string, unknown>
  return { ...card, archivedAt: clampNumber(source.archivedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()) }
}

export function parseState(raw: unknown): BoardState | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  if (!Array.isArray(source.cards)) return null
  // version 1 = 四象限之前的存档：卡片位置需要重新按象限排布。
  const legacyLayout = source.cards.some(
    (card) =>
      !card ||
      typeof card !== 'object' ||
      !isQuadrant((card as Record<string, unknown>).quadrant),
  )
  const cards = source.cards
    .map((card, index) => readCard(card, index))
    .filter((card): card is CardData => card !== null)
  const archived = Array.isArray(source.archived)
    ? source.archived
        .map((card, index) => readArchived(card, index))
        .filter((card): card is ArchivedCard => card !== null)
        .slice(0, MAX_ARCHIVED)
    : []
  const settingsRaw =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Record<string, unknown>)
      : {}
  return {
    version: legacyLayout ? 1 : 2,
    cards,
    archived,
    settings: {
      theme: readTheme(settingsRaw.theme),
      accent: readTone(settingsRaw.accent, DEFAULT_SETTINGS.accent),
      bgTransparency: clampNumber(settingsRaw.bgTransparency, 0, 0.85, DEFAULT_SETTINGS.bgTransparency),
      grain: clampNumber(settingsRaw.grain, 0, 0.9, DEFAULT_SETTINGS.grain),
      frost: clampNumber(settingsRaw.frost, 0, 100, DEFAULT_SETTINGS.frost),
      snapToGrid: settingsRaw.snapToGrid === true,
      showGrid: settingsRaw.showGrid === true,
      alwaysOnTop: settingsRaw.alwaysOnTop !== false,
      soundOnComplete: settingsRaw.soundOnComplete !== false,
      audioReactive: settingsRaw.audioReactive === true,
      autoCheckUpdate: settingsRaw.autoCheckUpdate !== false,
      pomodoroShort: clampNumber(settingsRaw.pomodoroShort, 1, 180, DEFAULT_SETTINGS.pomodoroShort),
      pomodoroLong: clampNumber(settingsRaw.pomodoroLong, 1, 300, DEFAULT_SETTINGS.pomodoroLong),
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

export function saveState(state: BoardState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, activeId: undefined }))
    return true
  } catch {
    return false
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}

export { TONES }
