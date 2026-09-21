interface DragDropPosition {
  x: number
  y: number
}

type DragDropEvent =
  | { type: 'enter'; paths: string[]; position: DragDropPosition }
  | { type: 'over'; position: DragDropPosition }
  | { type: 'drop'; paths: string[]; position: DragDropPosition }
  | { type: 'leave' }

type AppWindow = {
  minimize: () => Promise<void>
  close: () => Promise<void>
  toggleMaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  setAlwaysOnTop: (value: boolean) => Promise<void>
  setEffects?: (effects: unknown) => Promise<void>
  onResized?: (handler: () => void) => Promise<() => void>
  onDragDropEvent?: (handler: (event: { payload: DragDropEvent }) => void) => Promise<() => void>
}

export interface NativeDrop {
  kind: 'over' | 'leave' | 'drop'
  paths: string[]
  x: number
  y: number
}

export const isDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const platformLabel: string = isDesktop ? '桌面悬浮窗' : '浏览器模式'

/** 打开链接/文件时使用的修饰键，按平台显示。 */
export const openModifier: string =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'

async function resolveWindow(): Promise<AppWindow | null> {
  if (!isDesktop) return null
  try {
    const api = await import('@tauri-apps/api/window')
    return api.getCurrentWindow() as unknown as AppWindow
  } catch {
    return null
  }
}

interface InvokeResult<T> {
  ok: boolean
  value: T | null
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<InvokeResult<T>> {
  if (!isDesktop) return { ok: false, value: null }
  try {
    const core = await import('@tauri-apps/api/core')
    const value = await core.invoke<T>(command, args)
    return { ok: true, value: value ?? null }
  } catch {
    return { ok: false, value: null }
  }
}

async function run(action: (win: AppWindow) => Promise<void>): Promise<boolean> {
  const win = await resolveWindow()
  if (!win) return false
  try {
    await action(win)
    return true
  } catch {
    return false
  }
}

export function minimizeWindow(): Promise<boolean> {
  return run((win) => win.minimize())
}

export function closeWindow(): Promise<boolean> {
  return run((win) => win.close())
}

export function toggleMaximizeWindow(): Promise<boolean> {
  return run((win) => win.toggleMaximize())
}

/** 订阅窗口最大化状态，用来切换“最大化 / 还原”的图标。 */
export function observeMaximized(onChange: (value: boolean) => void): () => void {
  let dispose: (() => void) | null = null
  let cancelled = false

  void resolveWindow().then(async (win) => {
    if (!win || typeof win.onResized !== 'function') return
    const sync = async () => {
      try {
        onChange(await win.isMaximized())
      } catch {
        /* 拿不到就保持原状 */
      }
    }
    try {
      const off = await win.onResized(() => void sync())
      if (cancelled) {
        off()
        return
      }
      dispose = off
      void sync()
    } catch {
      dispose = null
    }
  })

  return () => {
    cancelled = true
    if (dispose) dispose()
  }
}

export function applyAlwaysOnTop(value: boolean): Promise<boolean> {
  return run((win) => win.setAlwaysOnTop(value))
}

export function applyBlurBehind(enabled: boolean): Promise<boolean> {
  return run(async (win) => {
    if (typeof win.setEffects !== 'function') throw new Error('effects unsupported')
    await win.setEffects(enabled ? { effects: ['acrylic'], state: 'active' } : { effects: [] })
  })
}

/** 桌面端把本地文件读成 data URL，浏览器端返回 null。 */
export async function readFileAsDataUrl(path: string): Promise<string | null> {
  const result = await invoke<string>('read_file_data_url', { path })
  return result.ok ? result.value : null
}

function openViaWindow(target: string): boolean {
  try {
    return window.open(target, '_blank', 'noopener,noreferrer') !== null
  } catch {
    return false
  }
}

/**
 * 打开外部目标。
 * 本地路径与 http 链接交给系统浏览器/默认程序；blob 与 data 只能在页面内打开。
 */
export async function openTarget(target: string): Promise<boolean> {
  if (!target) return false
  if (target.startsWith('blob:') || target.startsWith('data:')) return openViaWindow(target)
  if (isDesktop) {
    const result = await invoke<void>('open_target', { target })
    return result.ok
  }
  return openViaWindow(target)
}

export function watchNativeDrop(handler: (drop: NativeDrop) => void): () => void {
  let dispose: (() => void) | null = null
  let cancelled = false

  void resolveWindow().then(async (win) => {
    if (!win || typeof win.onDragDropEvent !== 'function') return
    try {
      const ratio = window.devicePixelRatio || 1
      const off = await win.onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'leave') {
          handler({ kind: 'leave', paths: [], x: 0, y: 0 })
          return
        }
        if (payload.type !== 'drop' && payload.type !== 'over') return
        handler({
          kind: payload.type,
          paths: payload.type === 'drop' ? (payload.paths ?? []) : [],
          x: payload.position.x / ratio,
          y: payload.position.y / ratio,
        })
      })
      if (cancelled) {
        off()
        return
      }
      dispose = off
    } catch {
      dispose = null
    }
  })

  return () => {
    cancelled = true
    if (dispose) dispose()
  }
}

export function toFileHref(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

/**
 * 打开图片预览窗口。
 * 桌面端开一个真正的 Tauri 窗口（和主面板互不干扰），浏览器端开一个弹出窗口。
 * onClosed 在主面板需要知道“预览还开着没有”时用到（比如决定要不要淡化面板）。
 */
export async function openPreviewWindow(
  payloadId: string,
  title: string,
  onClosed?: () => void,
): Promise<boolean> {
  const url = `index.html?preview=${encodeURIComponent(payloadId)}`
  if (!isDesktop) {
    try {
      const popup = window.open(url, `nemu-preview-${payloadId}`, 'popup=yes,width=1000,height=760')
      if (!popup) return false
      if (onClosed) {
        const timer = window.setInterval(() => {
          if (!popup.closed) return
          window.clearInterval(timer)
          onClosed()
        }, 600)
      }
      return true
    } catch {
      return false
    }
  }
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const win = new WebviewWindow(`preview-${payloadId}`, {
      url,
      title,
      width: 1000,
      height: 760,
      minWidth: 420,
      minHeight: 320,
      resizable: true,
      maximizable: true,
      decorations: false,
      transparent: true,
      shadow: true,
      alwaysOnTop: true,
      center: true,
      dragDropEnabled: false,
    })
    return await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(true), 4000)
      const settle = (ok: boolean) => {
        window.clearTimeout(timer)
        resolve(ok)
      }
      void win.once('tauri://created', () => {
        if (onClosed) void win.once('tauri://destroyed', () => onClosed())
        settle(true)
      })
      void win.once('tauri://error', () => settle(false))
    })
  } catch {
    return false
  }
}
