export type GenerationMode = 'txt2img' | 'img2img' | 'cover' | 'icon' | '3d' | 'gif'

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'gif' | 'ico'

export interface PromptItem {
  id: string
  title: string
  prompt: string
  promptZh?: string
  promptEn?: string
  language?: 'zh' | 'en' | 'bilingual'
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
  apiPath?: string
  apiProtocol?: 'openai-chat' | 'anthropic-messages' | 'openai-images' | 'dashscope-wanxiang' | 'openai-image-edits' | 'multimodal-chat' | 'mgtv-storyboard' | 'openai-audio-speech'
  apiKey: string
  apiSecret?: string
  model: string
  kind: 'image' | 'text' | 'tts'
  isPrimary: boolean
  status: 'untested' | 'connected' | 'failed'
  lastCheckedAt?: string
}

export interface ModelCatalogItem {
  id: string
  name: string
  kind: 'image' | 'text' | 'tts' | 'unknown'
  source: 'remote' | 'builtin'
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
  modeOptions?: Record<string, string | number | boolean>
}

export interface TextPolishInput {
  prompt: string
  modeLabel: string
  style: string
  task?: 'polish' | 'translate-to-english'
}

export interface TextPolishResult {
  prompt: string
  modelName: string
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
  isFavorite?: boolean
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
  modeOptions?: Record<string, string | number | boolean>
  status: TaskStatus
  error?: string
  errorDetails?: Record<string, string | number | boolean | null>
  isFavorite?: boolean
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
  defaultImageModelId: string
  defaultGenerationSize: number
  defaultBatchSize: number
  defaultStyle: string
  autoSaveHistory: boolean
  includePromptMetadata: boolean
}
