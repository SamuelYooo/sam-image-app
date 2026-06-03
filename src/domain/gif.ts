import { createCanvas, isCanvasSupported, loadImageFromDataUrl } from './canvas'
import { bytesToDataUrl } from './canvas'
import { medianCutPalette } from './postprocess'

/* ─────────────────────────── 公共类型 ─────────────────────────── */

export type GifLoopMode = 'seamless' | 'pingpong' | 'once'

export interface GifFrame {
  /** 帧的 RGBA 像素数据（已按 GIF 调色板量化） */
  rgba: Uint8ClampedArray
  /** 帧的延迟（1/100 秒） */
  delayCs: number
}

export interface GifEncodeOptions {
  width: number
  height: number
  /** 调色板颜色数（2-256） */
  paletteColors?: number
  /** 循环次数，0 = 无限循环 */
  loops?: number
}

export interface SynthesizeFramesOptions extends GifEncodeOptions {
  durationSeconds: number
  frameRate: number
  loopMode: GifLoopMode
}

/* ─────────────────────────── 编码器主入口 ─────────────────────────── */

/**
 * 把帧序列编码成 GIF89a 字节流。纯 TypeScript，零外部依赖。
 * 步骤：全局中位切分生成统一调色板 → 映射像素 → LZW 压缩 → 写入文件结构。
 */
export function encodeGif(frames: GifFrame[], options: GifEncodeOptions): Uint8Array {
  if (!frames.length) throw new Error('GIF 编码失败：至少需要 1 帧')
  const width = options.width
  const height = options.height
  const paletteColors = Math.max(2, Math.min(256, options.paletteColors ?? 64))
  const loops = options.loops ?? 0

  // 1. 合并所有像素做中位切分，生成统一调色板
  const merged = new Uint8ClampedArray(width * height * frames.length * 4)
  let cursor = 0
  for (const frame of frames) {
    if (frame.rgba.length !== width * height * 4) {
      throw new Error('GIF 编码失败：帧尺寸不匹配')
    }
    merged.set(frame.rgba, cursor)
    cursor += frame.rgba.length
  }
  const palette = medianCutPalette(merged, paletteColors) ?? [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]

  // 2. 量化每帧到调色板索引
  const indexedFrames: Array<{ indices: Uint8Array; delayCs: number }> = frames.map((frame) => {
    const indices = quantizeToPalette(frame.rgba, palette)
    return { indices, delayCs: frame.delayCs }
  })

  // 3. 写文件
  return writeGifFile({ width, height, palette, loops, frames: indexedFrames })
}

interface GifFileInput {
  width: number
  height: number
  palette: Array<{ r: number; g: number; b: number }>
  loops: number
  frames: Array<{ indices: Uint8Array; delayCs: number }>
}

function writeGifFile(input: GifFileInput): Uint8Array {
  const { width, height, palette, loops, frames } = input
  const paletteCount = palette.length
  // 调色板颜色数必须是 2 的幂（GIF 规范）
  const palettePow2 = nextPow2(paletteCount)

  const writer = new ByteWriter()
  // Header
  writer.writeString('GIF89a')
  // Logical Screen Descriptor
  writer.writeUint16(width)
  writer.writeUint16(height)
  // packed: global color table flag (1) | color resolution (1) | sort flag (0) | size of GCT
  const gctSizeField = Math.log2(palettePow2) - 1
  writer.writeByte(0x80 | (0 << 4) | gctSizeField)
  writer.writeByte(0) // background color index
  writer.writeByte(0) // pixel aspect ratio
  // Global Color Table
  for (let i = 0; i < palettePow2; i++) {
    const color = palette[i] ?? { r: 0, g: 0, b: 0 }
    writer.writeByte(color.r)
    writer.writeByte(color.g)
    writer.writeByte(color.b)
  }

  // Netscape Application Extension (loop)
  if (loops >= 0) {
    writer.writeByte(0x21)
    writer.writeByte(0xff)
    writer.writeByte(0x0b)
    writer.writeString('NETSCAPE2.0')
    writer.writeByte(0x03)
    writer.writeByte(0x01)
    writer.writeUint16(loops)
    writer.writeByte(0x00)
  }

  // 每帧
  for (const frame of frames) {
    // Graphic Control Extension
    writer.writeByte(0x21)
    writer.writeByte(0xf9)
    writer.writeByte(0x04)
    // packed: reserved(3) | disposal(3) | user input(1) | transparent(1)
    writer.writeByte(0x04) // disposal = restore to background, no transparent
    writer.writeUint16(frame.delayCs)
    writer.writeByte(0) // transparent color index
    writer.writeByte(0)

    // Image Descriptor
    writer.writeByte(0x2c)
    writer.writeUint16(0) // left
    writer.writeUint16(0) // top
    writer.writeUint16(width)
    writer.writeUint16(height)
    // packed: LCT flag (0) | interlace (0) | sort (0) | reserved (2)
    writer.writeByte(0)

    // LZW
    const minCodeSize = Math.max(2, gctSizeField + 1) // GIF 规范要求 LZW min code size >= 2
    writer.writeByte(minCodeSize)
    const lzwBytes = lzwCompress(frame.indices, minCodeSize, palettePow2)
    writeSubBlocks(writer, lzwBytes)
    writer.writeByte(0) // block terminator
  }

  // Trailer
  writer.writeByte(0x3b)
  return writer.toUint8Array()
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/* ─────────────────────────── 中位切分 → 索引 ─────────────────────────── */

function quantizeToPalette(rgba: Uint8ClampedArray, palette: Array<{ r: number; g: number; b: number }>): Uint8Array {
  const indices = new Uint8Array(rgba.length / 4)
  const cache = new Map<number, number>()
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    const r = rgba[i]; const g = rgba[i + 1]; const b = rgba[i + 2]
    const key = ((r & 0xf8) << 8) | ((g & 0xf8) << 3) | (b >> 3)
    let idx = cache.get(key)
    if (idx === undefined) {
      idx = nearestPaletteIndex(r, g, b, palette)
      cache.set(key, idx)
    }
    indices[j] = idx
  }
  return indices
}

function nearestPaletteIndex(r: number, g: number, b: number, palette: Array<{ r: number; g: number; b: number }>): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < palette.length; i += 1) {
    const c = palette[i]
    const dr = c.r - r; const dg = c.g - g; const db = c.b - b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}

/* ─────────────────────────── LZW 压缩 ─────────────────────────── */

function lzwCompress(indices: Uint8Array, minCodeSize: number, clearCodeMax: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const maxCode = clearCodeMax - 1

  const bitBuf = new BitWriter()
  let codeSize = minCodeSize + 1
  bitBuf.writeBits(clearCode, codeSize)

  const dict = new Map<string, number>()
  let prefix = ''

  const emit = (code: number) => {
    bitBuf.writeBits(code, codeSize)
    // 提升 codeSize 阈值：nextCode 即将用尽当前位宽
    if (nextCode > maxCode) {
      bitBuf.writeBits(clearCode, codeSize)
      codeSize = minCodeSize + 1
      nextCode = eoiCode + 1
      dict.clear()
    } else if (nextCode >= (1 << codeSize) && nextCode < maxCode) {
      codeSize = Math.min(12, codeSize + 1)
    }
  }
  let nextCode = eoiCode + 1

  for (let i = 0; i < indices.length; i += 1) {
    const k = indices[i]
    const candidate = prefix === '' ? String(k) : `${prefix},${k}`
    if (dict.has(candidate)) {
      prefix = candidate
    } else {
      if (prefix === '') {
        emit(k)
      } else {
        const existing = dict.get(prefix)
        if (existing !== undefined) {
          emit(existing)
        } else {
          // 极端退化：prefix 是裸像素，emit(k) 即可
          emit(k)
        }
        if (nextCode <= maxCode) {
          dict.set(candidate, nextCode)
          nextCode += 1
        }
      }
      prefix = String(k)
    }
  }
  if (prefix !== '') {
    const trailing = dict.get(prefix)
    emit(trailing ?? Number(prefix))
  }
  bitBuf.writeBits(eoiCode, codeSize)
  bitBuf.flush()
  return bitBuf.toUint8Array()
}

class BitWriter {
  private bytes: number[] = []
  private current = 0
  private bitCount = 0

  writeBits(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i -= 1) {
      const bit = (value >> i) & 1
      this.current = (this.current << 1) | bit
      this.bitCount += 1
      if (this.bitCount === 8) {
        this.bytes.push(this.current & 0xff)
        this.current = 0
        this.bitCount = 0
      }
    }
  }

  flush(): void {
    if (this.bitCount > 0) {
      this.current <<= 8 - this.bitCount
      this.bytes.push(this.current & 0xff)
      this.current = 0
      this.bitCount = 0
    }
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

class ByteWriter {
  private bytes: number[] = []
  writeByte(b: number): void { this.bytes.push(b & 0xff) }
  writeUint16(v: number): void { this.bytes.push(v & 0xff, (v >> 8) & 0xff) }
  writeString(s: string): void {
    for (let i = 0; i < s.length; i += 1) this.bytes.push(s.charCodeAt(i) & 0xff)
  }
  toUint8Array(): Uint8Array { return new Uint8Array(this.bytes) }
}

/** GIF 子块格式：每块 1 字节长度 + N 字节数据，0 长度块终止 */
function writeSubBlocks(writer: ByteWriter, data: Uint8Array): void {
  let offset = 0
  while (offset < data.length) {
    const chunkSize = Math.min(255, data.length - offset)
    writer.writeByte(chunkSize)
    for (let i = 0; i < chunkSize; i += 1) writer.writeByte(data[offset + i])
    offset += chunkSize
  }
}

/* ─────────────────────────── 帧合成（高层 API） ─────────────────────────── */

export interface SynthesizeSourceImage {
  dataUrl: string
  width: number
  height: number
}

/**
 * 把一组静态源图（1 张）合成循环 GIF 帧序列。
 * - 单图：Ken Burns 缩放/平移循环
 * - 多图：交叉淡入
 * - pingpong：正向+反向播放
 * - once：单次
 */
export async function synthesizeLoopFrames(
  images: SynthesizeSourceImage[],
  options: SynthesizeFramesOptions,
): Promise<GifFrame[]> {
  if (!images.length) throw new Error('GIF 合成失败：至少需要 1 张源图')
  if (!isCanvasSupported()) throw new Error('当前环境不支持 GIF 合成（Canvas 2D 不可用）')

  const { width, height, durationSeconds, frameRate, loopMode } = options
  const totalFrames = Math.max(2, Math.min(60, Math.round(durationSeconds * frameRate)))
  const delayCs = Math.max(2, Math.round(100 / frameRate))

  // 源图预加载并按目标尺寸居中渲染
  const sources = await Promise.all(
    images.map(async (img) => {
      const image = await loadImageFromDataUrl(img.dataUrl)
      const { context } = createCanvas(width, height)
      // 等比缩放 + 居中绘制
      const scale = Math.max(width / image.width, height / image.height)
      const drawW = image.width * scale
      const drawH = image.height * scale
      context.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH)
      return context.getImageData(0, 0, width, height)
    }),
  )

  const frames: GifFrame[] = []
  const interpolated = interpolateFrames(sources, totalFrames, loopMode, width, height)

  for (const data of interpolated) {
    frames.push({ rgba: data.data, delayCs })
  }
  return frames
}

/**
 * 多源图按帧序号线性插值；单源图时实施 Ken Burns 缩放。
 */
function interpolateFrames(
  sources: ImageData[],
  totalFrames: number,
  loopMode: GifLoopMode,
  width: number,
  height: number,
): ImageData[] {
  const frames: ImageData[] = []
  if (sources.length === 1) {
    // Ken Burns：1.0 → 1.1 缩放后回到 1.0
    const source = sources[0]
    for (let i = 0; i < totalFrames; i += 1) {
      const t = i / Math.max(1, totalFrames - 1)
      const scale = 1 + 0.1 * Math.sin(t * Math.PI * 2)
      frames.push(kenBurnsFrame(source, scale, width, height))
    }
  } else {
    // 多源图：交叉淡入循环
    const count = sources.length
    for (let i = 0; i < totalFrames; i += 1) {
      const t = (i / totalFrames) * count
      const index = Math.floor(t) % count
      const next = (index + 1) % count
      const alpha = t - Math.floor(t)
      frames.push(blendFrames(sources[index], sources[next], alpha, width, height))
    }
  }
  if (loopMode === 'pingpong' && frames.length > 2) {
    // 追加反向帧（首尾去重）
    for (let i = frames.length - 2; i > 0; i -= 1) {
      frames.push(copyImageData(frames[i]))
    }
  }
  return frames
}

function kenBurnsFrame(source: ImageData, scale: number, width: number, height: number): ImageData {
  const out = new ImageData(width, height)
  // 计算放大区域并居中
  const sw = Math.max(1, Math.round(source.width / scale))
  const sh = Math.max(1, Math.round(source.height / scale))
  const sx = Math.floor((source.width - sw) / 2)
  const sy = Math.floor((source.height - sh) / 2)
  // 重采样：源 (sx,sy,sw,sh) → 输出全幅
  bilinearSample(source, sx, sy, sw, sh, out, 0, 0, width, height)
  return out
}

function blendFrames(a: ImageData, b: ImageData, alpha: number, width: number, height: number): ImageData {
  const out = new ImageData(width, height)
  const ap = a.data; const bp = b.data; const op = out.data
  const inv = 1 - alpha
  for (let i = 0; i < op.length; i += 4) {
    op[i] = ap[i] * inv + bp[i] * alpha
    op[i + 1] = ap[i + 1] * inv + bp[i + 1] * alpha
    op[i + 2] = ap[i + 2] * inv + bp[i + 2] * alpha
    op[i + 3] = 255
  }
  return out
}

function copyImageData(src: ImageData): ImageData {
  const copy = new ImageData(src.width, src.height)
  copy.data.set(src.data)
  return copy
}

function bilinearSample(
  src: ImageData, sx: number, sy: number, sw: number, sh: number,
  dst: ImageData, dx: number, dy: number, dw: number, dh: number,
): void {
  const xRatio = sw / dw
  const yRatio = sh / dh
  for (let y = 0; y < dh; y += 1) {
    const srcY = sy + y * yRatio
    const y0 = Math.floor(srcY)
    const y1 = Math.min(src.height - 1, y0 + 1)
    const wy = srcY - y0
    for (let x = 0; x < dw; x += 1) {
      const srcX = sx + x * xRatio
      const x0 = Math.floor(srcX)
      const x1 = Math.min(src.width - 1, x0 + 1)
      const wx = srcX - x0
      const i00 = (y0 * src.width + x0) * 4
      const i01 = (y0 * src.width + x1) * 4
      const i10 = (y1 * src.width + x0) * 4
      const i11 = (y1 * src.width + x1) * 4
      const oi = ((dy + y) * dst.width + (dx + x)) * 4
      for (let c = 0; c < 4; c += 1) {
        const top = src.data[i00 + c] * (1 - wx) + src.data[i01 + c] * wx
        const bot = src.data[i10 + c] * (1 - wx) + src.data[i11 + c] * wx
        dst.data[oi + c] = top * (1 - wy) + bot * wy
      }
    }
  }
}

/* ─────────────────────────── 一站式便利 API ─────────────────────────── */

/** 一步完成：源图 → 真动图 data URL */
export async function synthesizeGifDataUrl(
  images: SynthesizeSourceImage[],
  options: SynthesizeFramesOptions,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const frames = await synthesizeLoopFrames(images, options)
  const bytes = encodeGif(frames, options)
  return {
    dataUrl: bytesToDataUrl(bytes, 'image/gif'),
    width: options.width,
    height: options.height,
  }
}

export function isGifBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x39 || bytes[4] === 0x37) && bytes[5] === 0x61
}
