import { createId } from './id'
import { DEFAULT_SETTINGS } from './storage'
import {
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  GRID_STEP,
  TONES,
} from './types'
import type { BoardState, CardData, CardTone, Settings } from './types'

export type BoardAction =
  | { type: 'hydrate'; state: BoardState }
  | { type: 'add'; x?: number; y?: number; tone?: CardTone; title?: string; body?: string }
  | { type: 'update'; id: string; patch: Partial<CardData>; touch?: boolean }
  | { type: 'remove'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'blur' }
  | { type: 'cycleTone'; id: string }
  | { type: 'togglePin'; id: string }
  | { type: 'toggleCollapse'; id: string }
  | { type: 'collapseAll'; value: boolean }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'arrange'; columns: number }
  | { type: 'clear' }
  | { type: 'restoreExamples' }

export const CARD_DEFAULT_WIDTH = 330
export const CARD_DEFAULT_HEIGHT = 232

const LAYOUT_GAP = 22
const LAYOUT_PAD = 18

export function snapValue(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_STEP) * GRID_STEP : Math.round(value)
}

export function clampCardSize(width: number, height: number): [number, number] {
  return [
    Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, Math.round(width))),
    Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, Math.round(height))),
  ]
}

interface CardSeed {
  title: string
  body: string
  tone: CardTone
  x: number
  y: number
  width: number
  height: number
}

const EXAMPLE_SEEDS: CardSeed[] = [
  {
    title: '欢迎使用悬浮卡片',
    body: '按住卡片标题栏即可拖动，拖动右下角的小手柄可以改变大小。所有内容都会自动保存在本地。',
    tone: 'sky',
    x: 18,
    y: 18,
    width: 348,
    height: 236,
  },
  {
    title: '置顶与收起',
    body: '点击图钉把卡片钉在最上层，点箭头收起卡片，让桌面瞬间清爽。',
    tone: 'mint',
    x: 396,
    y: 34,
    width: 316,
    height: 208,
  },
  {
    title: '一份代码，处处悬浮',
    body: 'Windows、macOS、Linux 桌面端由 Tauri 打包成原生悬浮窗；同一套界面也能直接在浏览器和移动端运行。',
    tone: 'violet',
    x: 176,
    y: 286,
    width: 372,
    height: 214,
  },
]

function buildCard(seed: Partial<CardSeed> & { z: number }): CardData {
  const now = Date.now()
  const [width, height] = clampCardSize(
    seed.width ?? CARD_DEFAULT_WIDTH,
    seed.height ?? CARD_DEFAULT_HEIGHT,
  )
  return {
    id: createId(),
    title: seed.title ?? '新卡片',
    body: seed.body ?? '',
    tone: seed.tone ?? 'sky',
    x: Math.round(seed.x ?? 24),
    y: Math.round(seed.y ?? 24),
    width,
    height,
    z: seed.z,
    pinned: false,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  }
}

function exampleCards(): CardData[] {
  return EXAMPLE_SEEDS.map((seed, index) => buildCard({ ...seed, z: index + 1 }))
}

export function createInitialState(): BoardState {
  const cards = exampleCards()
  return {
    version: 1,
    cards,
    settings: { ...DEFAULT_SETTINGS },
    nextZ: cards.length + 1,
    activeId: null,
  }
}

export function emptyState(): BoardState {
  return {
    version: 1,
    cards: [],
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

function arrangeCards(cards: CardData[], columns: number): CardData[] {
  if (cards.length === 0) return cards
  const columnCount = Math.max(1, Math.min(6, Math.round(columns)))
  const widest = cards.reduce((max, card) => Math.max(max, card.width), CARD_MIN_WIDTH)
  const cellWidth = Math.min(430, Math.max(270, widest))
  const heights = new Array<number>(columnCount).fill(LAYOUT_PAD)
  const ordered = [...cards].sort((a, b) => a.createdAt - b.createdAt)
  const placed = new Map<string, { x: number; y: number }>()

  for (const card of ordered) {
    let target = 0
    for (let index = 1; index < columnCount; index += 1) {
      if (heights[index] < heights[target]) target = index
    }
    const x = LAYOUT_PAD + target * (cellWidth + LAYOUT_GAP)
    const y = heights[target]
    placed.set(card.id, { x, y })
    heights[target] = y + card.height + LAYOUT_GAP
  }

  return cards.map((card) => {
    const spot = placed.get(card.id)
    return spot ? { ...card, x: spot.x, y: spot.y, width: cellWidth } : card
  })
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'add': {
      const nextZ = state.nextZ + 1
      const card = buildCard({
        title: action.title ?? '新卡片',
        body: action.body ?? '',
        tone: action.tone ?? state.settings.accent,
        x: action.x ?? 36 + (state.cards.length % 5) * 30,
        y: action.y ?? 36 + (state.cards.length % 5) * 30,
        z: nextZ,
      })
      return { ...state, cards: [...state.cards, card], nextZ, activeId: card.id }
    }

    case 'update': {
      const patch = { ...action.patch }
      if (patch.width !== undefined || patch.height !== undefined) {
        const current = state.cards.find((card) => card.id === action.id)
        if (current) {
          const [width, height] = clampCardSize(
            patch.width ?? current.width,
            patch.height ?? current.height,
          )
          patch.width = width
          patch.height = height
        }
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

    case 'cycleTone': {
      return {
        ...state,
        cards: state.cards.map((card) => {
          if (card.id !== action.id) return card
          const index = TONES.indexOf(card.tone)
          const tone = TONES[(index + 1) % TONES.length] as CardTone
          return { ...card, tone, updatedAt: Date.now() }
        }),
      }
    }

    case 'togglePin': {
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.id ? { ...card, pinned: !card.pinned } : card,
        ),
      }
    }

    case 'toggleCollapse': {
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.id ? { ...card, collapsed: !card.collapsed } : card,
        ),
      }
    }

    case 'collapseAll':
      return {
        ...state,
        cards: state.cards.map((card) => ({ ...card, collapsed: action.value })),
      }

    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'arrange':
      return { ...state, cards: arrangeCards(state.cards, action.columns) }

    case 'clear':
      return { ...state, cards: [], activeId: null }

    case 'restoreExamples': {
      const cards = exampleCards()
      return { ...state, cards, nextZ: cards.length + 1, activeId: null }
    }

    default:
      return state
  }
}
