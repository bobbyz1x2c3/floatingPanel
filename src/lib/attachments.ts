import { createId } from './id'
import { imageFileToDataUrl } from './image'
import { isImageName } from './links'
import { readFileAsDataUrl, toFileHref } from './platform'
import type { Attachment } from './types'

/** 单张卡片最多保留的附件数量。 */
export const MAX_ATTACHMENTS = 12

export function createAttachment(input: Omit<Attachment, 'id'>): Attachment {
  return { id: createId(), ...input }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isImageName(file.name)
}

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 浏览器/桌面共用的拖入或粘贴：图片转为内嵌图，其它文件留下可打开的链接。 */
export async function fileToAttachment(file: File): Promise<Attachment | null> {
  if (isImageFile(file)) {
    try {
      const src = await imageFileToDataUrl(file)
      if (src) {
        return createAttachment({
          name: file.name || '粘贴的图片',
          kind: 'image',
          src,
          size: file.size,
        })
      }
    } catch {
      return null
    }
    return null
  }

  let src = ''
  try {
    src = URL.createObjectURL(file)
  } catch {
    src = ''
  }
  return createAttachment({ name: file.name || '附件', kind: 'file', src, size: file.size })
}

/** 桌面端从系统拖入：拿到的是真实路径，图片直接内嵌，其它文件留下 file:// 链接。 */
export async function pathToAttachment(path: string): Promise<Attachment | null> {
  const name = fileNameFromPath(path)
  if (isImageName(name)) {
    const src = await readFileAsDataUrl(path)
    if (src) return createAttachment({ name, kind: 'image', src, size: 0 })
    return createAttachment({ name, kind: 'file', src: toFileHref(path), size: 0 })
  }
  return createAttachment({ name, kind: 'file', src: toFileHref(path), size: 0 })
}

export function mergeAttachments(current: Attachment[], incoming: Attachment[]): Attachment[] {
  const seen = new Set(current.map((item) => item.id))
  const fresh = incoming.filter((item) => !seen.has(item.id))
  return [...current, ...fresh].slice(0, MAX_ATTACHMENTS)
}
