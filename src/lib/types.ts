export type CardTone = 'sky' | 'rose' | 'mint' | 'amber' | 'violet' | 'graphite'

export type ThemeMode = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop'

/** 下方托盘里可以挂的快捷方式。 */
export type TrayToolKind = 'action' | 'open' | 'command'

export interface TrayTool {
  id: string
  /** 一个 emoji 或者一两个字符。 */
  icon: string
  label: string
  kind: TrayToolKind
  /** action：动作名；open：网址或路径；command：命令行。 */
  value: string
}

/** 内置动作（TrayTool.kind === 'action' 时可用的值）。 */
export const TRAY_ACTIONS: { value: string; label: string }[] = [
  { value: 'arrange', label: '整理布局' },
  { value: 'archive', label: '打开归档' },
  { value: 'settings', label: '打开设置' },
  { value: 'new-card', label: '新建卡片' },
  { value: 'collapse-all', label: '收起全部' },
]

export const TRAY_KIND_LABELS: Record<TrayToolKind, string> = {
  action: '内置动作',
  open: '打开链接 / 文件',
  command: '执行命令',
}

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
  /** 已经打完的番茄钟个数（只做标记，不影响完成 / 归档状态）。 */
  pomodoros: number
  createdAt: number
  updatedAt: number
}

export interface ArchivedCard extends CardData {
  archivedAt: number
}

export interface Settings {
  theme: ThemeMode
  accent: CardTone
  /** 面板背景的透明度 0~0.85（0 = 完全不透明，越大越透）。只影响玻璃底，卡片和文字不受影响。 */
  bgTransparency: number
  grain: number
  frost: number
  snapToGrid: boolean
  showGrid: boolean
  alwaysOnTop: boolean
  soundOnComplete: boolean
  /** 跟着电脑播放的声音做频谱动效（桌面端）。 */
  audioReactive: boolean
  /** 启动后自动检查更新。 */
  autoCheckUpdate: boolean
  /** 小番茄多少分钟。 */
  pomodoroShort: number
  /** 大番茄多少分钟。 */
  pomodoroLong: number
  /** 下方托盘上的快捷方式。 */
  trayTools: TrayTool[]
  /** 联机用的 MQTT broker（WebSocket 地址）。 */
  onlineBroker: string
  /** 上次加入的房间号，下次打开预填。 */
  lastRoom: string
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

export const CARD_MIN_WIDTH = 250
export const CARD_MIN_HEIGHT = 168
export const CARD_MAX_WIDTH = 780
export const CARD_MAX_HEIGHT = 700
export const GRID_STEP = 26

/** 象限最小尺寸：窗口再小也不会挤到看不清。 */
export const ZONE_MIN_WIDTH = 320
export const ZONE_MIN_HEIGHT = 250
export const ZONE_INSET = 16
/** 卡片摆放的上边界：让出每个象限顶上的一行标题。 */
export const ZONE_CONTENT_TOP = 62

export interface ZoneSize {
  width: number
  height: number
}

/** 四象限随窗口自适应：每格占可视区的一半，但不小于最小值。 */
export function zoneSizeFor(viewportWidth: number, viewportHeight: number): ZoneSize {
  // 用 floor 而不是 round：两格加起来必须小于等于可视区，
  // 否则画布会比可视区宽出 1px，凭空多出一条横向滚动条。
  return {
    width: Math.max(ZONE_MIN_WIDTH, Math.floor(viewportWidth / 2)),
    height: Math.max(ZONE_MIN_HEIGHT, Math.floor(viewportHeight / 2)),
  }
}

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

export function quadrantOrigin(quadrant: Quadrant, zone: ZoneSize): { x: number; y: number } {
  const meta = QUADRANT_META[quadrant]
  return { x: meta.column * zone.width, y: meta.row * zone.height }
}

export function quadrantFromPoint(x: number, y: number, zone: ZoneSize): Quadrant {
  const column = x >= zone.width ? 1 : 0
  const row = y >= zone.height ? 1 : 0
  if (column === 0) return row === 0 ? 'schedule' : 'drop'
  return row === 0 ? 'do' : 'delegate'
}

export function isQuadrant(value: unknown): value is Quadrant {
  return typeof value === 'string' && (QUADRANTS as string[]).includes(value)
}

export function isTone(value: unknown): value is CardTone {
  return typeof value === 'string' && (TONES as string[]).includes(value)
}
