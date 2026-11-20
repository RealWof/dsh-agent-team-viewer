/**
 * Draw the 180×180 raster icon the plugin market requires (its cards refuse
 * SVG). No dependencies: the PNG is encoded by hand with Node's zlib.
 *
 * Run: node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 180

/** Round a value to a byte. */
const clamp = value => Math.max(0, Math.min(255, Math.round(value)))

/** Whether a pixel lies inside a rounded rectangle. */
function inRoundRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x >= right || y < top || y >= bottom) return false
  const nearX = x < left + radius ? left + radius : (x > right - radius ? right - radius : x)
  const nearY = y < top + radius ? top + radius : (y > bottom - radius ? bottom - radius : y)
  if (nearX === x || nearY === y) return true
  return (x - nearX) ** 2 + (y - nearY) ** 2 <= radius * radius
}

const pixels = new Uint8Array(SIZE * SIZE * 4)

/** Paint one rounded rect with a solid colour. */
function paint(left, top, width, height, radius, [r, g, b, a = 255]) {
  for (let y = Math.floor(top); y < Math.ceil(top + height); y += 1) {
    for (let x = Math.floor(left); x < Math.ceil(left + width); x += 1) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue
      if (!inRoundRect(x + 0.5, y + 0.5, left, top, width, height, radius)) continue
      const index = (y * SIZE + x) * 4
      const alpha = a / 255
      pixels[index] = clamp(r * alpha + pixels[index] * (1 - alpha))
      pixels[index + 1] = clamp(g * alpha + pixels[index + 1] * (1 - alpha))
      pixels[index + 2] = clamp(b * alpha + pixels[index + 2] * (1 - alpha))
      pixels[index + 3] = clamp(255 * alpha + pixels[index + 3] * (1 - alpha))
    }
  }
}

// Frame, rail and three columns: the same silhouette as the package icon.
paint(6, 6, 168, 168, 38, [15, 23, 42])
paint(24, 30, 132, 10, 5, [125, 211, 252])
paint(24, 56, 8, 92, 4, [56, 189, 248])
paint(50, 56, 34, 64, 8, [56, 189, 248])
paint(96, 56, 34, 44, 8, [56, 189, 248])
paint(142, 56, 14, 26, 7, [34, 197, 94])
paint(24, 128, 132, 4, 2, [56, 189, 248, 120])

/* --- PNG encoding ------------------------------------------------------ */

const table = (() => {
  const values = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    values[n] = c >>> 0
  }
  return values
})()

/** CRC32 of a buffer. */
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** One PNG chunk. */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8
header[9] = 6
header[10] = 0
header[11] = 0
header[12] = 0

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(join(root, 'assets'), { recursive: true })
writeFileSync(join(root, 'assets', 'icon-180.png'), png)
console.log(`assets/icon-180.png: ${SIZE}x${SIZE}, ${png.length} bytes`)
