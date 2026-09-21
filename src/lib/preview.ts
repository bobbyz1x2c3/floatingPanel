import { createId } from './id'

/**
 * 图片预览窗是独立的系统窗口，它和主面板之间没有共享的内存，
 * 于是用 localStorage 传递这一张图：主面板写进去，预览窗按 id 读出来。
 * 只保留最近一份，避免历史图片把 localStorage 撑满。
 */
const PREFIX = 'nemu-float.preview.'

export interface PreviewPayload {
  name: string
  src: string
}

function clearOld(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PREFIX)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    /* 隐私模式下拿不到也无所谓 */
  }
}

export function putPreviewPayload(payload: PreviewPayload): string | null {
  const id = createId()
  try {
    clearOld()
    localStorage.setItem(PREFIX + id, JSON.stringify(payload))
    return id
  } catch {
    return null
  }
}

export function readPreviewPayload(id: string): PreviewPayload | null {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PreviewPayload
    if (typeof parsed?.src !== 'string') return null
    return { name: typeof parsed.name === 'string' ? parsed.name : '图片', src: parsed.src }
  } catch {
    return null
  }
}

/** 从 location.search 里取出预览 id。 */
export function previewIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('preview')
  return id && id.trim() ? id.trim() : null
}
