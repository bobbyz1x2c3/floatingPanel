import { isDesktop } from './platform'

/**
 * 音频响应：跟着电脑正在播放的声音做频谱动效。
 *
 * 声音是在 Rust 那侧用 WASAPI 回环抓的（见 src-tauri/src/audio.rs），
 * 抓到的音频只在本地算成 28 个 0~1 的数值再发过来，界面上拿到的是数值不是声音。
 */

/** 频谱柱子的数量，和 Rust 里的 BANDS 对齐。 */
export const AUDIO_BANDS = 28
export const SPECTRUM_EVENT = 'nemu://spectrum'

export interface SpectrumFrame {
  bands: number[]
  level: number
}

const EMPTY: SpectrumFrame = { bands: Array.from({ length: AUDIO_BANDS }, () => 0), level: 0 }

async function invoke<T>(command: string): Promise<T | null> {
  if (!isDesktop) return null
  try {
    const core = await import('@tauri-apps/api/core')
    return (await core.invoke<T>(command)) ?? null
  } catch {
    return null
  }
}

/** 这个平台支不支持（目前只有 Windows 有回环捕获）。 */
export async function audioAvailable(): Promise<boolean> {
  return (await invoke<boolean>('audio_available')) === true
}

/** 开始抓系统声音。返回 false 表示没起来（设备占用、平台不支持等）。 */
export async function startAudio(): Promise<boolean> {
  if (!isDesktop) return false
  try {
    const core = await import('@tauri-apps/api/core')
    await core.invoke('audio_start')
    return true
  } catch {
    return false
  }
}

export async function stopAudio(): Promise<void> {
  await invoke('audio_stop')
}

export const idleFrame = EMPTY

/** 订阅频谱数据；返回取消订阅的函数。 */
export async function watchSpectrum(onFrame: (frame: SpectrumFrame) => void): Promise<() => void> {
  if (!isDesktop) return () => {}
  try {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen<SpectrumFrame>(SPECTRUM_EVENT, (event) => {
      const payload = event.payload
      if (!payload || !Array.isArray(payload.bands)) return
      onFrame({
        bands: payload.bands.map((value) => (typeof value === 'number' ? value : 0)),
        level: typeof payload.level === 'number' ? payload.level : 0,
      })
    })
  } catch {
    return () => {}
  }
}
