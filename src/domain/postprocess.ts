import type { ExportFormat } from '@/types/domain'
import { createCanvas, isCanvasSupported, loadImageFromDataUrl } from './canvas'

/** 后处理算子类型（纯描述，运行时由 PostProcessStep 携带实际参数） */
export type PostProcessKind =
  | 'pixelate'
  | 'roundedCorners'
  | 'circleCrop'
  | 'resample'
  | 'grayscale'
  | 'paletteReduce'
  | 'backgroundFill'

/** 单个后处理步骤 */
export interface PostProcessStep {
  kind: PostProcessKind
  /** 算法相关参数 */
  params: Record<string, string | number>
}

export interface PostProcessResult {
  dataUrl: string
  width: number
  height: number
  format: ExportFormat
}

/**
 * 顺序执行一组 Canvas 后处理步骤；任一算子失败或环境不支持 Canvas 时降级返回原图。
 */
export async function applyPostProcessPipeline(
  input: { dataUrl: string; width: number; height: number; format: ExportFormat },
  steps: PostProcessStep[],
): Promise<PostProcessResult> {
  if (!steps.length) return { ...input }
  if (!isCanvasSupported()) return { ...input }

  let current: PostProcessResult = { ...input }
  for (const step of steps) {
    const next = await runStep(current, step)
    if (next) current = next
  }
  return current
}

async function runStep(input: PostProcessResult, step: PostProcessStep): Promise<PostProcessResult | null> {
  try {
    switch (step.kind) {
      case 'pixelate':
        return await runPixelate(input, step.params.pixelSize as number)
      case 'roundedCorners':
        return await runRoundedCorners(input, step.params.radiusPct as number)
      case 'circleCrop':
        return await runCircleCrop(input)
      case 'resample':
        return await runResample(input, step.params.scale as number)
      case 'grayscale':
        return await runGrayscale(input)
      case 'paletteReduce':
        return await runPaletteReduce(input, step.params.colors as number)
      case 'backgroundFill':
        return await runBackgroundFill(input, String(step.params.color ?? 'transparent'))
      default:
        return input
    }
  } catch {
    return null
  }
}

/** 像素化：先降采样到 (宽/pixelSize) × (高/pixelSize)，再 nearest-neighbor 放大回原尺寸 */
async function runPixelate(input: PostProcessResult, pixelSize: number): Promise<PostProcessResult | null> {
  const size = Math.max(1, Math.round(pixelSize))
  if (size <= 1) return null
  const image = await loadImageFromDataUrl(input.dataUrl)
  const w = input.width
  const h = input.height
  const smallW = Math.max(1, Math.round(w / size))
  const smallH = Math.max(1, Math.round(h / size))

  // 降采样
  const { canvas: down, context: downCtx } = createCanvas(smallW, smallH)
  downCtx.imageSmoothingEnabled = true
  downCtx.drawImage(image, 0, 0, smallW, smallH)

  // nearest-neighbor 放大回原尺寸
  const { canvas: out, context: outCtx } = createCanvas(w, h)
  outCtx.imageSmoothingEnabled = false
  outCtx.drawImage(down, 0, 0, smallW, smallH, 0, 0, w, h)
  return { dataUrl: out.toDataURL('image/png'), width: w, height: h, format: input.format }
}

/** 圆角裁剪：使用 destination-in + 圆角路径 */
async function runRoundedCorners(input: PostProcessResult, radiusPct: number): Promise<PostProcessResult | null> {
  const image = await loadImageFromDataUrl(input.dataUrl)
  const { canvas, context } = createCanvas(input.width, input.height)
  context.drawImage(image, 0, 0, input.width, input.height)
  const radius = (radiusPct / 100) * Math.min(input.width, input.height) / 2
  const safeRadius = Math.max(0, Math.min(radius, Math.min(input.width, input.height) / 2))
  if (safeRadius <= 0) return null
  context.globalCompositeOperation = 'destination-in'
  context.beginPath()
  context.moveTo(safeRadius, 0)
  context.lineTo(input.width - safeRadius, 0)
  context.quadraticCurveTo(input.width, 0, input.width, safeRadius)
  context.lineTo(input.width, input.height - safeRadius)
  context.quadraticCurveTo(input.width, input.height, input.width - safeRadius, input.height)
  context.lineTo(safeRadius, input.height)
  context.quadraticCurveTo(0, input.height, 0, input.height - safeRadius)
  context.lineTo(0, safeRadius)
  context.quadraticCurveTo(0, 0, safeRadius, 0)
  context.closePath()
  context.fill()
  context.globalCompositeOperation = 'source-over'
  return { dataUrl: canvas.toDataURL('image/png'), width: input.width, height: input.height, format: input.format }
}

/** 圆形裁剪：取中心正方形，套 destination-in 圆 */
async function runCircleCrop(input: PostProcessResult): Promise<PostProcessResult | null> {
  const image = await loadImageFromDataUrl(input.dataUrl)
  const side = Math.min(input.width, input.height)
  const offsetX = Math.floor((input.width - side) / 2)
  const offsetY = Math.floor((input.height - side) / 2)
  const { canvas, context } = createCanvas(side, side)
  context.drawImage(image, offsetX, offsetY, side, side, 0, 0, side, side)
  context.globalCompositeOperation = 'destination-in'
  context.beginPath()
  context.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2)
  context.closePath()
  context.fill()
  context.globalCompositeOperation = 'source-over'
  return { dataUrl: canvas.toDataURL('image/png'), width: side, height: side, format: input.format }
}

/** 重采样：imageSmoothingEnabled 开启的简单高质量缩放（非 AI 超分） */
async function runResample(input: PostProcessResult, scale: number): Promise<PostProcessResult | null> {
  const factor = Number(scale)
  if (!Number.isFinite(factor) || factor <= 0) return null
  const w = Math.max(1, Math.round(input.width * factor))
  const h = Math.max(1, Math.round(input.height * factor))
  const image = await loadImageFromDataUrl(input.dataUrl)
  const { canvas, context } = createCanvas(w, h)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, w, h)
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h, format: input.format }
}

/** 灰度：直接用 globalCompositeOperation 不可靠，逐像素扫描可靠 */
async function runGrayscale(input: PostProcessResult): Promise<PostProcessResult | null> {
  const image = await loadImageFromDataUrl(input.dataUrl)
  const { canvas, context } = createCanvas(input.width, input.height)
  context.drawImage(image, 0, 0, input.width, input.height)
  try {
    const data = context.getImageData(0, 0, input.width, input.height)
    const pixels = data.data
    for (let i = 0; i < pixels.length; i += 4) {
      // 加权灰度，ITU-R BT.601
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      pixels[i] = gray
      pixels[i + 1] = gray
      pixels[i + 2] = gray
    }
    context.putImageData(data, 0, 0)
  } catch {
    // getImageData 在 cross-origin 图片上会抛错；降级到 CSS 滤镜
    return runResample(input, 1).then(async (resampled) => {
      if (!resampled) return null
      // 二次重绘 + filter 是唯一不依赖 getImageData 的兜底
      const { canvas, context } = createCanvas(resampled.width, resampled.height)
      context.filter = 'grayscale(100%)'
      const image2 = await loadImageFromDataUrl(resampled.dataUrl)
      context.drawImage(image2, 0, 0)
      context.filter = 'none'
      return { dataUrl: canvas.toDataURL('image/png'), width: resampled.width, height: resampled.height, format: input.format }
    })
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: input.width, height: input.height, format: input.format }
}

/** 调色板量化：中位切分到 N 色，再做最近色映射。最小 N = 2，最大 N = 256。 */
async function runPaletteReduce(input: PostProcessResult, colors: number): Promise<PostProcessResult | null> {
  const n = Math.max(2, Math.min(256, Math.round(Number(colors) || 16)))
  const image = await loadImageFromDataUrl(input.dataUrl)
  const { canvas, context } = createCanvas(input.width, input.height)
  context.drawImage(image, 0, 0, input.width, input.height)
  try {
    const data = context.getImageData(0, 0, input.width, input.height)
    const palette = medianCutPalette(data.data, n)
    if (!palette) return null
    mapToPalette(data.data, palette)
    context.putImageData(data, 0, 0)
  } catch {
    return null
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: input.width, height: input.height, format: input.format }
}

/** 背景填充：透明底时填充纯色；纯色 / 透明两种语义 */
async function runBackgroundFill(input: PostProcessResult, color: string): Promise<PostProcessResult | null> {
  const image = await loadImageFromDataUrl(input.dataUrl)
  const { canvas, context } = createCanvas(input.width, input.height)
  if (color === 'transparent') {
    // 不填充：保持原图（如果原图本身有 alpha 通道则保留）
    context.drawImage(image, 0, 0, input.width, input.height)
  } else {
    context.fillStyle = color
    context.fillRect(0, 0, input.width, input.height)
    context.drawImage(image, 0, 0, input.width, input.height)
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: input.width, height: input.height, format: input.format }
}

/* ──────────────────────────── 调色板算法 ──────────────────────────── */

interface RGB { r: number; g: number; b: number }

function quantizeChannel(value: number): number {
  // 把 0-255 量化到 5 bit，简化后续分桶
  return (value >> 3) << 3
}

function bucketKey(r: number, g: number, b: number): number {
  return (quantizeChannel(r) << 16) | (quantizeChannel(g) << 8) | quantizeChannel(b)
}

/** 中位切分法生成 N 色调色板 */
export function medianCutPalette(pixels: Uint8ClampedArray, paletteSize: number): RGB[] | null {
  if (pixels.length < 4) return null
  type Box = { pixels: number[]; rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number }
  const boxes: Box[] = []
  const initialPixels: number[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    initialPixels.push(i)
  }
  if (!initialPixels.length) return null
  boxes.push(makeBox(initialPixels, pixels))

  while (boxes.length < paletteSize) {
    // 找最大方差的 box 切分
    let target: Box | null = null
    let bestRange = -1
    for (const box of boxes) {
      const range = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin)
      if (range > bestRange) {
        bestRange = range
        target = box
      }
    }
    if (!target || bestRange <= 0) break
    const index = boxes.indexOf(target)
    boxes.splice(index, 1)
    const { left, right } = splitBox(target, pixels)
    if (left.pixels.length) boxes.push(left)
    if (right.pixels.length) boxes.push(right)
  }
  return boxes.map((box) => averageColor(box.pixels, pixels))
}

function makeBox(pixelIndices: number[], pixels: Uint8ClampedArray): {
  pixels: number[]; rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number
} {
  let rMin = 255; let rMax = 0; let gMin = 255; let gMax = 0; let bMin = 255; let bMax = 0
  for (const i of pixelIndices) {
    const r = pixels[i]; const g = pixels[i + 1]; const b = pixels[i + 2]
    if (r < rMin) rMin = r; if (r > rMax) rMax = r
    if (g < gMin) gMin = g; if (g > gMax) gMax = g
    if (b < bMin) bMin = b; if (b > bMax) bMax = b
  }
  return { pixels: pixelIndices, rMin, rMax, gMin, gMax, bMin, bMax }
}

function splitBox(box: { pixels: number[]; rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number }, pixels: Uint8ClampedArray): { left: ReturnType<typeof makeBox>; right: ReturnType<typeof makeBox> } {
  const rRange = box.rMax - box.rMin
  const gRange = box.gMax - box.gMin
  const bRange = box.bMax - box.bMin
  const channel = rRange >= gRange && rRange >= bRange ? 'r' : gRange >= bRange ? 'g' : 'b'
  const sorted = box.pixels.slice().sort((a, b) => pixels[a + channelOffset(channel)] - pixels[b + channelOffset(channel)])
  const mid = Math.floor(sorted.length / 2)
  return {
    left: makeBox(sorted.slice(0, mid), pixels),
    right: makeBox(sorted.slice(mid), pixels),
  }
}

function channelOffset(channel: 'r' | 'g' | 'b'): number {
  return channel === 'r' ? 0 : channel === 'g' ? 1 : 2
}

function averageColor(pixelIndices: number[], pixels: Uint8ClampedArray): RGB {
  let r = 0; let g = 0; let b = 0
  for (const i of pixelIndices) {
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]
  }
  const count = Math.max(1, pixelIndices.length)
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
}

function mapToPalette(pixels: Uint8ClampedArray, palette: RGB[]): void {
  // 用 5-bit 桶做一次缓存，O(N) 量化
  const cache = new Map<number, RGB>()
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]; const g = pixels[i + 1]; const b = pixels[i + 2]
    const key = bucketKey(r, g, b)
    let target = cache.get(key)
    if (!target) {
      target = nearestColor(r, g, b, palette)
      cache.set(key, target)
    }
    pixels[i] = target.r; pixels[i + 1] = target.g; pixels[i + 2] = target.b
  }
}

function nearestColor(r: number, g: number, b: number, palette: RGB[]): RGB {
  let best: RGB = palette[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const c of palette) {
    const dr = c.r - r; const dg = c.g - g; const db = c.b - b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}
