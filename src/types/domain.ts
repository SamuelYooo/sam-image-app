export type GenerationMode = 'txt2img' | 'img2img' | 'cover' | 'icon' | '3d' | 'gif'

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'gif'

export interface PromptItem {
  id: string
  title: string
  prompt: string
  source: 'builtin' | 'custom' | 'glidea' | 'EvoLinkAI' | 'freestylefly'
  sourceId: string
  category: string
  subCategory: string
  author: string
  tags: string[]
  preview: string
  refImages: string[]
  createdAt: string
}

export interface ModelProfile {
  id: string
  name: string
  provider: 'openai-compatible' | 'local-preview'
  endpoint: string
  apiKey: string
  model: string
  kind: 'image' | 'text'
  isPrimary: boolean
  status: 'untested' | 'connected' | 'failed'
  lastCheckedAt?: string
}

export interface GenerationInput {
  mode: GenerationMode
  prompt: string
  negativePrompt: string
  modelId: string
  width: number
  height: number
  batchSize: number
  steps: number
  seed: number
  style: string
  referenceImage?: string
}

export interface GeneratedAsset {
  id: string
  taskId: string
  title: string
  width: number
  height: number
  format: ExportFormat
  dataUrl: string
  localPath?: string
  createdAt: string
}

export interface GenerationTask {
  id: string
  mode: GenerationMode
  prompt: string
  negativePrompt: string
  modelId: string
  width: number
  height: number
  batchSize: number
  steps: number
  seed: number
  style: string
  status: TaskStatus
  error?: string
  assets: GeneratedAsset[]
  createdAt: string
}

export interface CoverPreset {
  id: string
  name: string
  width: number
  height: number
  enabled: boolean
  custom: boolean
}

export interface AppSettings {
  defaultOutputDir: string
  defaultExportFormat: ExportFormat
  autoSaveHistory: boolean
  includePromptMetadata: boolean
  theme: 'dark'
}
