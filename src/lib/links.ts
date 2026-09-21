const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"'）】，。；]+)/gi

export interface TextSegment {
  type: 'text' | 'link'
  value: string
  href?: string
}

export function normalizeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

export function splitTextByLinks(text: string): TextSegment[] {
  if (!text) return []
  const segments: TextSegment[] = []
  let cursor = 0
  URL_PATTERN.lastIndex = 0
  let match = URL_PATTERN.exec(text)
  while (match) {
    const value = match[0]
    const start = match.index
    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) })
    }
    segments.push({ type: 'link', value, href: normalizeHref(value) })
    cursor = start + value.length
    match = URL_PATTERN.exec(text)
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) })
  }
  return segments
}

export function listLinks(text: string): TextSegment[] {
  return splitTextByLinks(text).filter((segment) => segment.type === 'link')
}

export function findLinkAt(text: string, index: number): TextSegment | null {
  if (!text || index < 0 || index > text.length) return null
  URL_PATTERN.lastIndex = 0
  let match = URL_PATTERN.exec(text)
  while (match) {
    const start = match.index
    const end = start + match[0].length
    if (index >= start && index <= end) {
      return { type: 'link', value: match[0], href: normalizeHref(match[0]) }
    }
    match = URL_PATTERN.exec(text)
  }
  return null
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name)
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** WebKit 还在用带前缀的老接口，Chromium 已支持标准的 caretPositionFromPoint。 */
type LegacyCaretDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function offsetInside(container: Node, parent: Node, offset: number): number {
  if (container === parent) return offset
  if (container.nodeType === Node.TEXT_NODE && container.parentNode === parent) return offset
  return -1
}

/**
 * 把屏幕坐标换算成文本框里的字符下标。
 * Chromium 走 caretPositionFromPoint，WebKit 走 caretRangeFromPoint。
 */
export function caretIndexFromPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const doc = element.ownerDocument
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(clientX, clientY)
    if (position) {
      const index = offsetInside(position.offsetNode, element, position.offset)
      if (index >= 0) return index
    }
  }
  const legacy = doc as LegacyCaretDocument
  if (typeof legacy.caretRangeFromPoint === 'function') {
    const range = legacy.caretRangeFromPoint(clientX, clientY)
    if (range) {
      const index = offsetInside(range.startContainer, element, range.startOffset)
      if (index >= 0) return index
    }
  }
  return -1
}
