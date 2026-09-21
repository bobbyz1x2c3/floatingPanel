const MAX_EDGE = 1024
const QUALITY = 0.78

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

async function encodeCanvas(source: ImageBitmap | HTMLImageElement): Promise<string | null> {
  const width = source.width
  const height = source.height
  if (!width || !height) return null
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, 0, 0, canvas.width, canvas.height)

  for (const type of ['image/webp', 'image/jpeg']) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, QUALITY)
    })
    if (blob && blob.size > 0) return blobToDataUrl(blob)
  }
  return canvas.toDataURL('image/jpeg', QUALITY)
}

async function shrink(dataUrl: string): Promise<string> {
  try {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    const encoded = await encodeCanvas(bitmap)
    bitmap.close()
    return encoded ?? dataUrl
  } catch {
    return dataUrl
  }
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  const raw = await blobToDataUrl(file)
  return shrink(raw)
}

export async function imageDataUrlToThumbnail(dataUrl: string): Promise<string> {
  return shrink(dataUrl)
}
