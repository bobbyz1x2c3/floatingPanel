import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/icon-source.png')

const pixels = new Float32Array(SIZE * SIZE * 4)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function sdRoundRect(px, py, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(px - cx) - (halfWidth - radius)
  const qy = Math.abs(py - cy) - (halfHeight - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

function roundRectMask(cx, cy, halfWidth, halfHeight, radius) {
  const mask = new Float32Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const distance = sdRoundRect(x + 0.5, y + 0.5, cx, cy, halfWidth, halfHeight, radius)
      mask[y * SIZE + x] = clamp(0.5 - distance, 0, 1)
    }
  }
  return mask
}

function boxBlur(source, radius) {
  if (radius < 1) return source
  const radiusInt = Math.round(radius)
  const size = SIZE * SIZE
  let input = source
  let output = new Float32Array(size)

  for (let pass = 0; pass < 3; pass += 1) {
    for (let y = 0; y < SIZE; y += 1) {
      const row = y * SIZE
      let sum = 0
      for (let x = -radiusInt; x <= radiusInt; x += 1) {
        sum += input[row + clamp(x, 0, SIZE - 1)]
      }
      for (let x = 0; x < SIZE; x += 1) {
        output[row + x] = sum / (radiusInt * 2 + 1)
        sum -= input[row + clamp(x - radiusInt, 0, SIZE - 1)]
        sum += input[row + clamp(x + radiusInt + 1, 0, SIZE - 1)]
      }
    }

    const temp = input
    input = output
    output = temp

    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0
      for (let y = -radiusInt; y <= radiusInt; y += 1) {
        sum += input[clamp(y, 0, SIZE - 1) * SIZE + x]
      }
      for (let y = 0; y < SIZE; y += 1) {
        output[y * SIZE + x] = sum / (radiusInt * 2 + 1)
        sum -= input[clamp(y - radiusInt, 0, SIZE - 1) * SIZE + x]
        sum += input[clamp(y + radiusInt + 1, 0, SIZE - 1) * SIZE + x]
      }
    }

    const secondTemp = input
    input = output
    output = secondTemp
  }

  return input
}

function shiftedMask(mask, dx, dy, scale = 1) {
  const result = new Float32Array(SIZE * SIZE)
  const shiftX = Math.round(dx)
  const shiftY = Math.round(dy)
  for (let y = 0; y < SIZE; y += 1) {
    const sourceY = clamp(y - shiftY, 0, SIZE - 1)
    for (let x = 0; x < SIZE; x += 1) {
      const sourceX = clamp(x - shiftX, 0, SIZE - 1)
      result[y * SIZE + x] = mask[sourceY * SIZE + sourceX] * scale
    }
  }
  return result
}

function composite(mask, [red, green, blue], alphaScale) {
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const alpha = mask[index] * alphaScale
    if (alpha <= 0.0005) continue
    const offset = index * 4
    const destAlpha = pixels[offset + 3]
    const outAlpha = alpha + destAlpha * (1 - alpha)
    if (outAlpha <= 0) continue
    const keep = (destAlpha * (1 - alpha)) / outAlpha
    const add = alpha / outAlpha
    pixels[offset] = pixels[offset] * keep + red * add
    pixels[offset + 1] = pixels[offset + 1] * keep + green * add
    pixels[offset + 2] = pixels[offset + 2] * keep + blue * add
    pixels[offset + 3] = outAlpha
  }
}

function gradientMask(mask, topLeft, bottomRight) {
  const channelTop = topLeft
  const channelBottom = bottomRight
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x
      const coverage = mask[index]
      if (coverage <= 0.0005) continue
      const t = clamp((x + y) / (SIZE * 2), 0, 1)
      compositeFromIndex(index, coverage, [
        channelTop[0] + (channelBottom[0] - channelTop[0]) * t,
        channelTop[1] + (channelBottom[1] - channelTop[1]) * t,
        channelTop[2] + (channelBottom[2] - channelTop[2]) * t,
      ])
    }
  }
}

function compositeFromIndex(index, alpha, [red, green, blue]) {
  const offset = index * 4
  const destAlpha = pixels[offset + 3]
  const outAlpha = alpha + destAlpha * (1 - alpha)
  if (outAlpha <= 0) return
  const keep = (destAlpha * (1 - alpha)) / outAlpha
  const add = alpha / outAlpha
  pixels[offset] = pixels[offset] * keep + red * add
  pixels[offset + 1] = pixels[offset + 1] * keep + green * add
  pixels[offset + 2] = pixels[offset + 2] * keep + blue * add
  pixels[offset + 3] = outAlpha
}

const BASE_INSET = 118
const BASE_RADIUS = 236
const baseMask = roundRectMask(
  SIZE / 2,
  SIZE / 2,
  SIZE / 2 - BASE_INSET,
  SIZE / 2 - BASE_INSET,
  BASE_RADIUS,
)
const baseBlur = boxBlur(baseMask, 14)

composite(shiftedMask(baseBlur, 22, 26), [0.129, 0.145, 0.196], 0.34)
gradientMask(baseMask, [0.929, 0.945, 0.973], [0.784, 0.812, 0.878])

const CARD_HALF_WIDTH = 208
const CARD_HALF_HEIGHT = 150
const CARD_RADIUS = 54
const cardMask = roundRectMask(SIZE / 2, SIZE / 2, CARD_HALF_WIDTH, CARD_HALF_HEIGHT, CARD_RADIUS)
const cardBlur = boxBlur(cardMask, 20)

composite(shiftedMask(cardBlur, 26, 30), [0.145, 0.165, 0.224], 0.5)
composite(shiftedMask(cardBlur, -14, -16), [1, 1, 1], 0.55)
gradientMask(cardMask, [1, 1, 1], [0.906, 0.929, 0.973])

const barColors = [
  [0.353, 0.486, 0.98],
  [0.612, 0.655, 0.745],
  [0.612, 0.655, 0.745],
]
const barWidths = [252, 292, 176]
const barTop = SIZE / 2 - 62

barWidths.forEach((width, index) => {
  const centerY = barTop + index * 52
  const halfWidth = width / 2
  const barMask = roundRectMask(
    SIZE / 2 - 118 + halfWidth,
    centerY,
    halfWidth,
    13,
    13,
  )
  composite(barMask, barColors[index], 1)
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y += 1) {
  const rowStart = y * (SIZE * 4 + 1)
  raw[rowStart] = 0
  for (let x = 0; x < SIZE; x += 1) {
    const offset = (y * SIZE + x) * 4
    const target = rowStart + 1 + x * 4
    raw[target] = Math.round(clamp(pixels[offset], 0, 1) * 255)
    raw[target + 1] = Math.round(clamp(pixels[offset + 1], 0, 1) * 255)
    raw[target + 2] = Math.round(clamp(pixels[offset + 2], 0, 1) * 255)
    raw[target + 3] = Math.round(clamp(pixels[offset + 3], 0, 1) * 255)
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, png)
console.log(`icon source written: ${OUTPUT} (${(png.length / 1024).toFixed(1)} KiB)`)
