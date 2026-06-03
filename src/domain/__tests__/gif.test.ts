import { describe, expect, it } from 'vitest'
import {
  encodeGif,
  isGifBytes,
  type GifFrame,
} from '../gif'
import { medianCutPalette } from '../postprocess'

function solidFrame(color: [number, number, number], width: number, height: number, delayCs = 8): GifFrame {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255
  }
  return { rgba: data, delayCs }
}

describe('GIF encoder basics', () => {
  it('produces a GIF89a header', () => {
    const frame = solidFrame([255, 0, 0], 4, 4)
    const bytes = encodeGif([frame], { width: 4, height: 4, paletteColors: 8, loops: 0 })
    expect(bytes.length).toBeGreaterThan(0)
    expect(isGifBytes(bytes)).toBe(true)
  })

  it('includes a NETSCAPE2.0 application extension for loop control', () => {
    const frame = solidFrame([0, 0, 255], 2, 2)
    const bytes = encodeGif([frame], { width: 2, height: 2, paletteColors: 4, loops: 5 })
    const str = String.fromCharCode(...bytes)
    expect(str).toContain('NETSCAPE2.0')
  })

  it('encodes a graphic control extension with delay per frame', () => {
    const frames: GifFrame[] = [
      solidFrame([255, 0, 0], 2, 2, 10),
      solidFrame([0, 255, 0], 2, 2, 20),
    ]
    const bytes = encodeGif(frames, { width: 2, height: 2, paletteColors: 4, loops: 0 })
    // GCE 引入符 (0x21 0xf9 0x04) 应出现两次
    const signature = [0x21, 0xf9, 0x04]
    let count = 0
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] === signature[0] && bytes[i + 1] === signature[1] && bytes[i + 2] === signature[2]) {
        count += 1
      }
    }
    expect(count).toBe(2)
  })

  it('rejects frames with mismatched dimensions', () => {
    const a = solidFrame([0, 0, 0], 4, 4)
    const b = solidFrame([0, 0, 0], 4, 2) // 错误尺寸
    expect(() => encodeGif([a, b], { width: 4, height: 4 })).toThrow(/尺寸不匹配/)
  })

  it('refuses to encode an empty frame list', () => {
    expect(() => encodeGif([], { width: 2, height: 2 })).toThrow(/至少需要 1 帧/)
  })
})

describe('median cut palette', () => {
  it('returns at least 1 color for a non-empty input', () => {
    const pixels = new Uint8ClampedArray(4 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200; pixels[i + 1] = 100; pixels[i + 2] = 50
    }
    const palette = medianCutPalette(pixels, 4)
    expect(palette).not.toBeNull()
    expect(palette!.length).toBeGreaterThanOrEqual(1)
  })

  it('returns null for an empty input', () => {
    const empty = new Uint8ClampedArray(0)
    expect(medianCutPalette(empty, 4)).toBeNull()
  })
})
