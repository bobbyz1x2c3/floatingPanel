import { createId } from './id'
import { DEFAULT_SETTINGS } from './storage'
import {
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  GRID_STEP,
  QUADRANTS,
  QUADRANT_META,
  ZONE_CONTENT_TOP,
  ZONE_INSET,
  quadrantOrigin,
} from './types'
import type { Attachment, BoardState, CardData, Quadrant, Settings, ZoneSize } from './types'

export type BoardAction =
  | { type: 'hydrate'; state: BoardState }
  | {
      type: 'add'
      zone: ZoneSize
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
  | { type: 'arrange'; zone: ZoneSize }
  | { type: 'rezone'; from: ZoneSize; to: ZoneSize }
  | { type: 'clear' }
  | { type: 'restoreExamples'; zone: ZoneSize }
  | { type: 'archive'; id: string }
  | { type: 'restoreArchived'; id: string; zone: ZoneSize }
  | { type: 'deleteArchived'; id: string }
  | { type: 'clearArchived' }
  | { type: 'pomodoroDone'; id: string }

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

function cascade(quadrant: Quadrant, index: number, zone: ZoneSize): { x: number; y: number } {
  const origin = quadrantOrigin(quadrant, zone)
  const step = (index % 3) * 26
  return { x: origin.x + ZONE_INSET + step, y: origin.y + ZONE_CONTENT_TOP + step }
}

interface CardSeed {
  title: string
  body: string
  quadrant: Quadrant
  width: number
  height: number
}

/** 示例卡片先按一个名义象限尺寸摆好，App 挂载后会按真实窗口重新整理。 */
const SEED_ZONE: ZoneSize = { width: 560, height: 400 }

const EXAMPLE_SEEDS: CardSeed[] = [
  {
    title: '欢迎使用悬浮卡片',
    body: '在画布空白处双击就能新建一张卡片，卡片会落在双击所在的象限里。\n\n按住卡片标题栏拖动，跨过中间的分界线就会自动换象限。从卡片任意一条边或角落往里拖就能改变大小，内容都会自动保存在本地。',
    quadrant: 'do',
    width: 356,
    height: 262,
  },
  {
    title: '重要 · 不紧急',
    body: '左上角放需要长期推进的事。把卡片拖到这里，颜色会自动变成天蓝。',
    quadrant: 'schedule',
    width: 330,
    height: 218,
  },
  {
    title: '拖进来一张图片试试',
    body: '图片可以直接粘贴，也可以从文件夹拖进卡片。文件和文件夹会变成一个链接，按住 Ctrl 点击就能打开；拖到画布空白处、甚至拖到菜单栏上，都会顺手新建一张卡片。网址也能被识别：https://tauri.app',
    quadrant: 'delegate',
    width: 380,
    height: 288,
  },
  {
    title: '完成后点确认',
    body: '点卡片上的「完成」按钮就会归档，并播放一声提示音；右上角的「归档」里能看到归档时间和数量。',
    quadrant: 'drop',
    width: 344,
    height: 226,
  },
]

interface BuildSeed extends Partial<CardSeed> {
  z: number
  quadrant: Quadrant
  x?: number
  y?: number
  attachments?: Attachment[]
  pomodoros?: number
}

function buildCard(seed: BuildSeed): CardData {
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
    pomodoros: seed.pomodoros ?? 0,
    createdAt: now,
    updatedAt: now,
  }
}

function exampleCards(): CardData[] {
  const seen = new Map<Quadrant, number>()
  return EXAMPLE_SEEDS.map((seed, index) => {
    const nth = seen.get(seed.quadrant) ?? 0
    seen.set(seed.quadrant, nth + 1)
    const spot = cascade(seed.quadrant, nth, SEED_ZONE)
    return buildCard({ ...seed, x: spot.x, y: spot.y, z: index + 1 })
  })
}

export function createInitialState(): BoardState {
  const cards = exampleCards()
  return {
    // 1 = 还没按真实窗口排布过，App 挂载后会补一次 arrange。
    version: 1,
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

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 收起状态的卡片大概多高，和 app.css 里的 .card.is-collapsed 对应。 */
const COLLAPSED_HEIGHT = 78

/** 两个矩形之间至少留出 gap 的空隙才算“不打架”。 */
function apart(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

function heightOf(card: CardData): number {
  return card.collapsed ? COLLAPSED_HEIGHT : card.height
}

/**
 * 在某一格里按“从上往下、从左往右”的顺序找第一个放得下的位置。
 *
 * 候选位置来自已经摆好的卡片：每一行的上边界，以及每张卡片右侧、下侧再让开一个缝的位置。
 * 于是被删掉的卡片留下的空当会被后来的卡片补上，而不是一直往下堆一列。
 * 第一遍要求整张卡片都在格内（不跨过分界线）；实在放不下才允许落到格子下面，
 * 那一遍不再限制下边界，溢出的卡片同样会左右并排。
 */
function findSpot(
  card: CardData,
  quadrant: Quadrant,
  zone: ZoneSize,
  placed: Rect[],
): Rect {
  const origin = quadrantOrigin(quadrant, zone)
  const left = origin.x + ZONE_INSET
  const top = origin.y + ZONE_CONTENT_TOP
  const innerWidth = Math.max(CARD_MIN_WIDTH, zone.width - ZONE_INSET * 2)
  const bottom = origin.y + zone.height - ZONE_INSET
  const width = Math.min(card.width, innerWidth)
  const height = heightOf(card)

  const search = (insideOnly: boolean): Rect | null => {
    const rows = [top, ...placed.map((item) => item.y + item.height + STACK_GAP)]
      .filter((y) => y >= top && (!insideOnly || y + height <= bottom))
      .sort((a, b) => a - b)
    const columns = [left, ...placed.map((item) => item.x + item.width + STACK_GAP)]
      .filter((x) => x >= left && x + width <= left + innerWidth)
      .sort((a, b) => a - b)
    for (const y of rows) {
      for (const x of columns) {
        const candidate: Rect = { x, y, width, height }
        if (placed.every((item) => apart(candidate, item, STACK_GAP))) return candidate
      }
    }
    return null
  }

  return search(true) ?? search(false) ?? { x: left, y: bottom, width, height }
}

/**
 * 给整块板子排位置。按象限从上到下、从左到右依次处理，所有卡片共用一份“已占位置”，
 * 所以满出来的卡片不会压到下面那一格的卡片上。
 */
function packBoard(cards: CardData[], zone: ZoneSize): Map<string, Rect> {
  const groups = new Map<Quadrant, CardData[]>()
  // 先来后到：整理的结果只跟创建顺序有关，多按几次「整理」不会来回跳。
  for (const card of [...cards].sort((a, b) => a.createdAt - b.createdAt)) {
    const list = groups.get(card.quadrant)
    if (list) list.push(card)
    else groups.set(card.quadrant, [card])
  }

  const placed: Rect[] = []
  const spots = new Map<string, Rect>()
  for (const quadrant of QUADRANTS) {
    for (const card of groups.get(quadrant) ?? []) {
      const rect = findSpot(card, quadrant, zone, placed)
      placed.push(rect)
      spots.set(card.id, rect)
    }
  }
  return spots
}

function arrangeCards(cards: CardData[], zone: ZoneSize): CardData[] {
  if (cards.length === 0) return cards
  const spots = packBoard(cards, zone)
  return cards.map((card) => {
    const spot = spots.get(card.id)
    return spot ? { ...card, x: spot.x, y: spot.y, width: spot.width } : card
  })
}

/** 新卡片没给坐标时，直接塞进这一格里第一个空位。 */
function freeSpotFor(
  cards: CardData[],
  quadrant: Quadrant,
  zone: ZoneSize,
  width: number,
  height: number,
): { x: number; y: number; width: number } | null {
  const probe: CardData = {
    id: '__probe__',
    title: '',
    body: '',
    tone: QUADRANT_META[quadrant].tone,
    quadrant,
    attachments: [],
    x: 0,
    y: 0,
    width,
    height,
    z: 0,
    collapsed: false,
    pomodoros: 0,
    // 排到最后：新卡片只占现成的空位，不会把已有的卡片挤走。
    createdAt: Number.MAX_SAFE_INTEGER,
    updatedAt: 0,
  }
  const spot = packBoard([...cards, probe], zone).get(probe.id)
  return spot ? { x: spot.x, y: spot.y, width: spot.width } : null
}

/**
 * 象限尺寸变了（窗口缩放）：每张卡片按它自己所属象限做等比位移。
 * 卡片在那一格里的相对位置保持不变，所以不会出现“右上角的卡片被窗口一拉就跑到左上角”。
 * 刻意不取整，避免连续拖动窗口时误差一步步累积。
 */
function rezoneCards(cards: CardData[], from: ZoneSize, to: ZoneSize): CardData[] {
  if (from.width <= 0 || from.height <= 0) return cards
  const scaleX = to.width / from.width
  const scaleY = to.height / from.height
  if (scaleX === 1 && scaleY === 1) return cards
  return cards.map((card) => {
    const before = quadrantOrigin(card.quadrant, from)
    const after = quadrantOrigin(card.quadrant, to)
    return {
      ...card,
      x: after.x + (card.x - before.x) * scaleX,
      y: after.y + (card.y - before.y) * scaleY,
    }
  })
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'hydrate':
      return action.state

    case 'add': {
      const quadrant = action.quadrant ?? 'schedule'
      const nextZ = state.nextZ + 1
      // 没指定坐标时，先在这一格里找空位，找不到才退回角上的层叠位置。
      const free =
        action.x === undefined || action.y === undefined
          ? freeSpotFor(state.cards, quadrant, action.zone, CARD_DEFAULT_WIDTH, CARD_DEFAULT_HEIGHT)
          : null
      const fallback = cascade(
        quadrant,
        state.cards.filter((card) => card.quadrant === quadrant).length,
        action.zone,
      )
      const card = buildCard({
        title: action.title ?? '新卡片',
        body: action.body ?? '',
        attachments: action.attachments,
        quadrant,
        x: action.x ?? free?.x ?? fallback.x,
        y: action.y ?? free?.y ?? fallback.y,
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
      return { ...state, version: 2, cards: arrangeCards(state.cards, action.zone) }

    case 'rezone':
      return { ...state, cards: rezoneCards(state.cards, action.from, action.to) }

    case 'clear':
      return { ...state, cards: [], activeId: null }

    case 'restoreExamples': {
      // 示例卡片也走同一套排布，落到真实的窗口尺寸里。
      const cards = arrangeCards(exampleCards(), action.zone)
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
      // 从归档恢复：优先占现成的空位，位子实在没有了才按层叠位置放。
      const free = freeSpotFor(
        state.cards,
        restored.quadrant,
        action.zone,
        restored.width,
        restored.height,
      )
      const spot = free ?? cascade(restored.quadrant, index, action.zone)
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
