/** 番茄钟相关的小工具。 */

/** 拖番茄用的自定义拖放类型，带上它就说明这次拖动来自番茄钟面板。 */
export const TOMATO_MIME = 'application/x-nemufloat-tomato'

export interface TomatoDrop {
  minutes: number
  label: string
}

/** 把 dataTransfer 里的番茄解析出来，不是番茄就返回 null。 */
export function readTomatoDrop(event: DragEvent): TomatoDrop | null {
  const raw = event.dataTransfer?.getData(TOMATO_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TomatoDrop
    if (typeof parsed?.minutes !== 'number' || parsed.minutes <= 0) return null
    return { minutes: parsed.minutes, label: typeof parsed.label === 'string' ? parsed.label : '番茄' }
  } catch {
    return null
  }
}

/** 剩余毫秒 → `mm:ss`（超过一小时给 `h:mm:ss`）。 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
