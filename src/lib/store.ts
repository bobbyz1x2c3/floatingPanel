import { createId } from './id'
import { DEFAULT_SETTINGS } from './storage'
import {
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  GRID_STEP,
  QUADRANT_META,
  ZONE_HEIGHT,
  ZONE_INSET,
  ZONE_WIDTH,
  quadrantOrigin,
} from './types'
import type { Attachment, BoardState, CardData, Quadrant, Settings } from './types'

export type BoardAction =
  | { type: 'hydrate'; state: BoardState }
  | {
      type: 'add'
      quadrant?: Quadrant
      x?: number
      y?: number
      title?: string
      body?: string
      attachments?: Attachment[]
    }
  | { type: 'update'; id: string; patch: Partial<CardData>; touch?: boolean }
  | { type: 'remove'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'blur' }
  | { type: 'toggleCollapse'; id: string }
  | { type: 'collapseAll'; value: boolean }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'arrange' }
  | { type: 'clear' }
  | { type: 'restoreExamples' }
  | { type: 'archive'; id: string }
  | { type: 'restoreArchived'; id: string }
  | { type: 'deleteArchived'; id: string }
  | { type: 'clearArchived' }

export const CARD_DEFAULT_WIDTH = 330
export const CARD_DEFAULT_HEIGHT = 238

const STACK_GAP = 16

export function snapValue(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_STEP) * GRID_STEP : Math.round(value)
}

export function clampCardSize(width: number, height: number): [number, number] {
  return [
    Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, Math.round(width))),
    Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, Math.round(height))),
  ]
}

function cascade(quadrant: Quadrant, index: number): { x: number; y: number } {
  const origin = quadrantOrigin(quadrant)
  const step = (index % 3) * 26
  return { x: origin.x + ZONE_INSET + step, y: origin.y + ZONE_INSET + step }
}

interface CardSeed {
  title: string
  body: string
  quadrant: Quadrant
  x: number
  y: number
  width: number
  height: number
}

const EXAMPLE_SEEDS: CardSeed[] = [
  {
    title: '欢迎使用悬浮卡片',
    body: '按住卡片标题栏拖动，跨过中间的分界线就会自动换象限。右下角小手柄可以改变大小，内容都会自动保存在本地。',
    quadrant: 'do',
    x: ZONE_WIDTH + 24,
    y: 24,
    width: 356,
    height: 246,
  },
  {
    title: '重要 · 不紧急',
    body: '左上角放需要长期推进的事。把卡片拖到这里，颜色会自动变成天蓝。',
    quadrant: 'schedule',
    x: 24,
    y: 24,
    width: 330,
    height: 218,
  },
  {
    title: '拖进来一张图片试试',
    body: '图片可以直接粘贴，也可以从文件夹拖进卡片；其它文件会变成一个链接，按住 Ctrl 点击就能打开。网址也能被识别：https://tauri.app',
    quadrant: 'delegate',
    x: ZONE_WIDTH + 24,
    y: ZONE_HEIGHT + 24,
    width: 380,
    height: 268,
  },
  {
    title: '完成后点确认',
    body: '卡片下方的对勾按钮会把这张卡片归档，右上角的「归档」里能看到归档时间和数量。',
    quadrant: 'drop',
    x: 24,
    y: ZONE_HEIGHT + 24,
    width: 344,
    height: 226,
  },
]

function buildCard(
  seed: Partial<CardSeed> & { z: number; quadrant: Quadrant; attachments?: Attachment[] },
): CardData {
  const now = Date.now()
  const [width, height] = clampCardSize(
    seed.width ?? CARD_DEFAULT_WIDTH,
    seed.height ?? CARD_DEFAULT_HEIGHT,
  )
  return {
    id: createId(),
    title: seed.title ?? '新卡片',
    body: seed.body ?? '',
    tone: QUADRANT_META[seed.quadrant].tone,
    quadrant: seed.quadrant,
    attachments: seed.attachments ?? [],
    x: Math.round(seed.x ?? 24),
    y: Math.round(seed.y ?? 24),
    width,
    height,
    z: seed.z,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  }
}

function exampleCards(): CardData[] {
  return EXAMPLE_SEEDS.map((seed, index) =>
    buildCard({ ...seed, quadrant: seed.quadrant, z: index + 1 }),
  )
}

export function createInitialState(): BoardState {
  const cards = exampleCards()
  return {
    version: 2,
    cards,
    archived: [],
    settings: { ...DEFAULT_SETTINGS },
    nextZ: cards.length + 1,
    activeId: null,
  }
}

export function emptyState(): BoardState {
  return {
    version: 2,
    cards: [],
    archived: [],
    settings: { ...DEFAULT_SETTINGS },
    nextZ: 1,
    activeId: null,
  }
}

function withFront(state: BoardState, id: string): BoardState {
  const nextZ = state.nextZ + 1
  return {
    ...state,
    nextZ,
    activeId: id,
    cards: state.cards.map((card) => (card.id === id ? { ...card, z: nextZ } : card)),
  }
}

function arrangeCards(cards: CardData[]): CardData[] {
  if (cards.length === 0) return cards
  const zoneWidth = ZONE_WIDTH - ZONE_INSET * 2
  const cursors = new Map<Quadrant, number>()
  const placed = new Map<string, { x: number; y: number; width: number }>()
  const ordered = [...cards].sort((a, b) => a.createdAt - b.createdAt)

  for (const card of ordered) {
    const origin = quadrantOrigin(card.quadrant)
    const width = Math.min(card.width, zoneWidth)
    const cursor = cursors.get(card.quadrant) ?? ZONE_INSET
    placed.set(card.id, { x: origin.x + ZONE_INSET, y: origin.y + cursor, width })
    cursors.set(card.quadrant, cursor + card.height + STACK_GAP)
  }

  return cards.map((card) => {
    const spot = placed.get(card.id)
    return spot ? { ...card, x: spot.x, y: spot.y, width: spot.width } : card
  })
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'add': {
      const quadrant = action.quadrant ?? 'schedule'
      const index = state.cards.filter((card) => card.quadrant === quadrant).length
      const spot = cascade(quadrant, index)
      const nextZ = state.nextZ + 1
      const card = buildCard({
        title: action.title ?? '新卡片',
        body: action.body ?? '',
        attachments: action.attachments,
        quadrant,
        x: action.x ?? spot.x,
        y: action.y ?? spot.y,
        z: nextZ,
      })
      return { ...state, cards: [...state.cards, card], nextZ, activeId: card.id }
    }

    case 'update': {
      const patch: Partial<CardData> = { ...action.patch }
      const current = state.cards.find((card) => card.id === action.id)
      if (!current) return state
      if (patch.width !== undefined || patch.height !== undefined) {
        const [width, height] = clampCardSize(
          patch.width ?? current.width,
          patch.height ?? current.height,
        )
        patch.width = width
        patch.height = height
      }
      if (patch.quadrant && patch.quadrant !== current.quadrant) {
        patch.tone = QUADRANT_META[patch.quadrant].tone
      }
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.id
            ? { ...card, ...patch, updatedAt: action.touch === false ? card.updatedAt : Date.now() }
            : card,
        ),
      }
    }

    case 'remove': {
      const cards = state.cards.filter((card) => card.id !== action.id)
      return {
        ...state,
        cards,
        activeId: state.activeId === action.id ? null : state.activeId,
      }
    }

    case 'focus': {
      const target = state.cards.find((card) => card.id === action.id)
      if (!target) return state
      const topZ = state.cards.reduce((max, card) => Math.max(max, card.z), 0)
      if (target.z >= topZ && state.activeId === action.id) return state
      return withFront(state, action.id)
    }

    case 'blur':
      return state.activeId === null ? state : { ...state, activeId: null }

    case 'toggleCollapse':
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.id ? { ...card, collapsed: !card.collapsed } : card,
        ),
      }

    case 'collapseAll':
      return {
        ...state,
        cards: state.cards.map((card) => ({ ...card, collapsed: action.value })),
      }

    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'arrange':
      return { ...state, version: 2, cards: arrangeCards(state.cards) }

    case 'clear':
      return { ...state, cards: [], activeId: null }

    case 'restoreExamples': {
      const cards = exampleCards()
      return { ...state, cards, nextZ: cards.length + 1, activeId: null }
    }

    case 'archive': {
      const card = state.cards.find((item) => item.id === action.id)
      if (!card) return state
      const archived = [{ ...card, archivedAt: Date.now() }, ...state.archived].slice(0, 300)
      return {
        ...state,
        cards: state.cards.filter((item) => item.id !== action.id),
        archived,
        activeId: state.activeId === action.id ? null : state.activeId,
      }
    }

    case 'restoreArchived': {
      const card = state.archived.find((item) => item.id === action.id)
      if (!card) return state
      const { archivedAt, ...restored } = card
      void archivedAt
      const index = state.cards.filter((item) => item.quadrant === restored.quadrant).length
      const spot = cascade(restored.quadrant, index)
      const nextZ = state.nextZ + 1
      const revived: CardData = { ...restored, x: spot.x, y: spot.y, z: nextZ, updatedAt: Date.now() }
      return {
        ...state,
        cards: [...state.cards, revived],
        archived: state.archived.filter((item) => item.id !== action.id),
        nextZ,
        activeId: revived.id,
      }
    }

    case 'deleteArchived':
      return { ...state, archived: state.archived.filter((item) => item.id !== action.id) }

    case 'clearArchived':
      return { ...state, archived: [] }

    default:
      return state
  }
}
