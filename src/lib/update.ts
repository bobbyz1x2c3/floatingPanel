import { isDesktop } from './platform'

/**
 * 自动更新。
 *
 * 走的是 Tauri 官方的 updater 插件：配置在 src-tauri/tauri.conf.json 的 plugins.updater，
 * 里面写好了更新清单地址（GitHub Release 里的 latest.json）。
 * 公钥已经随应用打包，检查失败会在这里转成人话；签名、清单和网络错误都交给 UI 显示。
 */

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'available'; version: string; notes: string }
  | { status: 'installing'; percent: number }
  | { status: 'error'; message: string }

export const IDLE_UPDATE: UpdateState = { status: 'idle' }

/** 当前 app 版本（tauri.conf.json 里的 version）。 */
export async function appVersion(): Promise<string> {
  if (!isDesktop) return '—'
  try {
    const app = await import('@tauri-apps/api/app')
    return await app.getVersion()
  } catch {
    return '—'
  }
}

type PendingUpdate = {
  version: string
  body?: string
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>
}

/** 记住最近一次检查到的更新，点「下载并安装」时接着用它。 */
let pending: PendingUpdate | null = null

function readable(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/empty public key|public key/i.test(text)) return '还没配置更新公钥'
  if (/signature|verify|minisign/i.test(text)) return '安装包签名对不上，已拒绝，请到发布页手动下载'
  if (/release JSON|valid release/i.test(text)) return '更新清单还没发布'
  if (/network|dns|connect|timed? ?out|request/i.test(text)) return '网络不通，稍后再试'
  if (/404/.test(text)) return '更新清单还没发布'
  return text.slice(0, 120)
}

export async function checkUpdate(): Promise<UpdateState> {
  if (!isDesktop) return { status: 'error', message: '仅桌面端可用' }
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) {
      pending = null
      return { status: 'latest' }
    }
    pending = update as unknown as PendingUpdate
    return { status: 'available', version: update.version, notes: update.body ?? '' }
  } catch (error) {
    pending = null
    return { status: 'error', message: readable(error) }
  }
}

/** 下载并安装，装完重启。onProgress 收到的是 0~100。 */
export async function installUpdate(onProgress: (percent: number) => void): Promise<boolean> {
  if (!isDesktop || !pending) return false
  try {
    let total = 0
    let done = 0
    await pending.downloadAndInstall((event: unknown) => {
      const payload = event as { event?: string; data?: { contentLength?: number; chunkLength?: number } }
      if (payload.event === 'Started') {
        total = payload.data?.contentLength ?? 0
        onProgress(0)
      } else if (payload.event === 'Progress') {
        done += payload.data?.chunkLength ?? 0
        onProgress(total > 0 ? Math.min(99, Math.round((done / total) * 100)) : 0)
      } else if (payload.event === 'Finished') {
        onProgress(100)
      }
    })
    const process = await import('@tauri-apps/plugin-process')
    await process.relaunch()
    return true
  } catch {
    return false
  }
}
