type AppWindow = {
  minimize: () => Promise<void>
  close: () => Promise<void>
  setAlwaysOnTop: (value: boolean) => Promise<void>
  setEffects?: (effects: unknown) => Promise<void>
}

export const isDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const platformLabel: string = isDesktop ? '桌面悬浮窗' : '浏览器模式'

async function resolveWindow(): Promise<AppWindow | null> {
  if (!isDesktop) return null
  try {
    const api = await import('@tauri-apps/api/window')
    return api.getCurrentWindow() as unknown as AppWindow
  } catch {
    return null
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

export function applyAlwaysOnTop(value: boolean): Promise<boolean> {
  return run((win) => win.setAlwaysOnTop(value))
}

export function applyBlurBehind(enabled: boolean): Promise<boolean> {
  return run(async (win) => {
    if (typeof win.setEffects !== 'function') {
      throw new Error('effects unsupported')
    }
    await win.setEffects(enabled ? { effects: ['mica', 'acrylic'] } : { effects: [] })
  })
}
