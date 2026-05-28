import type { GeneratedAsset, GenerationInput, GenerationTask } from '@/types/domain'
import { createId, hashString } from './ids'

const MODE_LABELS: Record<GenerationInput['mode'], string> = {
  txt2img: 'T2I',
  img2img: 'I2I',
  cover: 'COVER',
  icon: 'ICON',
  '3d': '3D',
  gif: 'GIF',
}

const MODE_COLORS: Record<GenerationInput['mode'], [string, string]> = {
  txt2img: ['#1f6bff', '#7c3aed'],
  img2img: ['#10b981', '#38bdf8'],
  cover: ['#ff4d8d', '#ffb86b'],
  icon: ['#111827', '#60a5fa'],
  '3d': ['#6366f1', '#f97316'],
  gif: ['#14b8a6', '#a3e635'],
}

export function validateGenerationInput(input: GenerationInput): void {
  if (!input.prompt.trim()) throw new Error('请输入正向提示词')
  if (!input.modelId.trim()) throw new Error('请选择图像模型')
  if (!Number.isFinite(input.width) || input.width < 128 || input.width > 4096) throw new Error('宽度必须在 128 到 4096 之间')
  if (!Number.isFinite(input.height) || input.height < 128 || input.height > 4096) throw new Error('高度必须在 128 到 4096 之间')
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 4) throw new Error('批量数量必须在 1 到 4 之间')
  if (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 80) throw new Error('生成步数必须在 1 到 80 之间')
}

export function createLocalGeneration(input: GenerationInput): GenerationTask {
  validateGenerationInput(input)
  const createdAt = new Date().toISOString()
  const id = createId('task')
  const assets = Array.from({ length: input.batchSize }, (_, index) => createPreviewAsset(id, input, index, createdAt))

  return {
    id,
    ...input,
    status: 'completed',
    assets,
    createdAt,
  }
}

function createPreviewAsset(taskId: string, input: GenerationInput, index: number, createdAt: string): GeneratedAsset {
  const seed = hashString(`${input.prompt}-${input.seed}-${index}`)
  const [start, end] = MODE_COLORS[input.mode]
  const label = MODE_LABELS[input.mode]
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    '<defs>',
    `<linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient>`,
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter>',
    '</defs>',
    '<rect width="100%" height="100%" fill="url(#g)"/>',
    `<circle cx="${input.width * 0.24}" cy="${input.height * 0.2}" r="${Math.min(input.width, input.height) * 0.18}" fill="rgba(255,255,255,.22)"/>`,
    `<circle cx="${input.width * 0.78}" cy="${input.height * 0.72}" r="${Math.min(input.width, input.height) * 0.22}" fill="rgba(255,255,255,.12)"/>`,
    `<rect x="${input.width * 0.12}" y="${input.height * 0.14}" width="${input.width * 0.76}" height="${input.height * 0.72}" rx="${Math.min(input.width, input.height) * 0.04}" fill="rgba(6,17,31,.42)" stroke="rgba(255,255,255,.32)" filter="url(#shadow)"/>`,
    `<text x="50%" y="45%" text-anchor="middle" fill="rgba(237,243,255,.94)" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.max(28, Math.min(input.width, input.height) * 0.085)}" font-weight="800">${escapeXml(label)}</text>`,
    `<text x="50%" y="55%" text-anchor="middle" fill="rgba(237,243,255,.74)" font-family="Cascadia Mono, monospace" font-size="${Math.max(14, Math.min(input.width, input.height) * 0.026)}">SAMIMAGE 3.0 · ${seed.toUpperCase()}</text>`,
    `<text x="50%" y="64%" text-anchor="middle" fill="rgba(237,243,255,.82)" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.max(16, Math.min(input.width, input.height) * 0.03)}">${escapeXml(input.prompt.slice(0, 36))}</text>`,
    '</svg>',
  ].join('')

  return {
    id: createId('asset'),
    taskId,
    title: `${modeTitle(input.mode)} ${index + 1}`,
    width: input.width,
    height: input.height,
    format: 'svg',
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    createdAt,
  }
}

function modeTitle(mode: GenerationInput['mode']): string {
  return {
    txt2img: '文生图',
    img2img: '图生图',
    cover: '封面图',
    icon: 'ICON',
    '3d': '3D 图',
    gif: 'GIF 动图',
  }[mode]
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
