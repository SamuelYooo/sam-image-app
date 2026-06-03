import type { ExportFormat } from '@/types/domain'

/** 后处理/导出过程中传递的统一图片数据结构 */
export interface ExportAssetData {
  dataUrl: string
  format: ExportFormat
  width: number
  height: number
  bundleSizes?: number[]
}

export const rasterExportMime: Record<'png' | 'jpg' | 'webp', string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

export const icoBundleSizes = [16, 32, 48, 64, 128, 256, 512] as const

/** 当前运行环境是否支持 Canvas 2D（happy-dom 等测试环境能力受限时返回 false） */
export function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext && canvas.getContext('2d'))
  } catch {
    return false
  }
}

/** 创建一个带 2D context 的离屏 canvas；环境不支持时抛错，调用方需自行降级 */
export function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持图片处理（Canvas 2D 不可用）')
  return { canvas, context }
}

export async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片渲染失败'))
  })
  image.src = dataUrl
  await loaded
  return image
}

export async function rasterizeDataUrl(
  dataUrl: string,
  width: number,
  height: number,
  format: 'png' | 'jpg' | 'webp',
  canvasFilter?: string,
): Promise<string> {
  const image = await loadImageFromDataUrl(dataUrl)
  const { canvas, context } = createCanvas(width, height)

  if (format === 'jpg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (canvasFilter && canvasFilter !== 'none') context.filter = canvasFilter
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  context.filter = 'none'

  return canvas.toDataURL(rasterExportMime[format], 0.92)
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('ICO 导出失败：无法生成 PNG 帧')
  return new Uint8Array(await blob.arrayBuffer())
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

export function buildIcoFile(frames: Array<{ size: number; bytes: Uint8Array }>): Uint8Array {
  const headerSize = 6
  const entrySize = 16
  const totalBytes = frames.reduce((sum, frame) => sum + frame.bytes.length, 0)
  const output = new Uint8Array(headerSize + entrySize * frames.length + totalBytes)
  const view = new DataView(output.buffer)

  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, frames.length, true)

  let dataOffset = headerSize + entrySize * frames.length
  frames.forEach((frame, index) => {
    const entryOffset = headerSize + index * entrySize
    const sizeByte = frame.size >= 256 ? 0 : frame.size
    output[entryOffset] = sizeByte
    output[entryOffset + 1] = sizeByte
    output[entryOffset + 2] = 0
    output[entryOffset + 3] = 0
    view.setUint16(entryOffset + 4, 1, true)
    view.setUint16(entryOffset + 6, 32, true)
    view.setUint32(entryOffset + 8, frame.bytes.length, true)
    view.setUint32(entryOffset + 12, dataOffset, true)
    output.set(frame.bytes, dataOffset)
    dataOffset += frame.bytes.length
  })

  return output
}

export async function createIcoDataUrl(
  dataUrl: string,
  width: number,
  height: number,
  requestedSizes?: number[],
): Promise<ExportAssetData> {
  const maxSize = Math.max(16, Math.min(width, height))
  const candidateSizes = requestedSizes?.length
    ? Array.from(new Set(requestedSizes.map((size) => Math.round(size)).filter((size) => size >= 16)))
    : [...icoBundleSizes]
  const bundleSizes = candidateSizes.filter((size) => size <= maxSize).sort((left, right) => left - right)
  const sizes = bundleSizes.length ? bundleSizes : [Math.max(16, maxSize)]
  const image = await loadImageFromDataUrl(dataUrl)
  const frames: Array<{ size: number; bytes: Uint8Array }> = []

  for (const size of sizes) {
    const { canvas, context } = createCanvas(size, size)
    context.clearRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)
    frames.push({ size, bytes: await canvasToPngBytes(canvas) })
  }

  const bytes = buildIcoFile(frames)
  return {
    dataUrl: bytesToDataUrl(bytes, 'image/x-icon'),
    format: 'ico',
    width,
    height,
    bundleSizes: sizes.slice(),
  }
}
