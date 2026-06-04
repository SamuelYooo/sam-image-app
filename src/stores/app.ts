import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isBlockedPromptCategory, mergePromptItems, normalizePromptImport, normalizePromptSync } from '@/domain/promptImport'
import { containsChineseText } from '@/domain/language'
import {
  defaultCoverPresets,
  defaultModels,
  defaultPrompts,
  modeAliases,
  modeLabels,
  stylePresets,
} from '@/data/catalog'
import { browserStorage } from '@/services/storage'
import { invokeOptional, isTauriRuntime } from '@/services/tauri'
import {
  buildIcoFile,
  bytesToDataUrl,
  canvasToPngBytes,
  createIcoDataUrl,
  createCanvas,
  loadImageFromDataUrl,
  rasterizeDataUrl,
  type ExportAssetData,
} from '@/domain/canvas'
import { buildZipFile } from '@/domain/zip'
import type {
  AppSettings,
  CoverPreset,
  GeneratedAsset,
  GenerationInput,
  GenerationMode,
  GenerationTask,
  ExportFormat,
  ModelCatalogItem,
  ModelProfile,
  PromptItem,
  TextPolishInput,
  TextPolishResult,
} from '@/types/domain'
import { createId } from '@/domain/ids'

const STORAGE_KEY = 'samimage.v3.state'
const fallbackGifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAQABAAACAkQBACH5BAAUAAAALAAAAAABAAEAAAICTAEAOw=='

interface PersistedState {
  models: ModelProfile[]
  prompts: PromptItem[]
  tasks: GenerationTask[]
  coverPresets: CoverPreset[]
  settings: AppSettings
  promptSync?: PromptSyncState
}

interface PromptSyncState {
  glidea?: PromptSyncResult
  EvoLinkAI?: PromptSyncResult
  freestylefly?: PromptSyncResult
}

interface PromptSyncResult {
  at: string
  count: number
  url: string
}

interface PromptSyncSource {
  key: 'glidea' | 'EvoLinkAI' | 'freestylefly'
  label: string
  repo: string
  candidates: string[]
}

const defaultState: PersistedState = {
  models: defaultModels,
  prompts: defaultPrompts,
  tasks: [],
  coverPresets: defaultCoverPresets,
  settings: {
    defaultOutputDir: 'D:\\SamImage\\Exports',
    defaultExportFormat: 'svg',
    defaultImageModelId: '',
    defaultGenerationSize: 1024,
    defaultBatchSize: 4,
    defaultStyle: '自然',
    autoSaveHistory: true,
    includePromptMetadata: true,
    theme: 'dark',
  },
}

const promptSyncSources: PromptSyncSource[] = [
  {
    key: 'glidea',
    label: 'Glide',
    repo: 'glidea/banana-prompt-quicker',
    candidates: [
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/master/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/public/prompts.json',
      'https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/data/prompts.json',
    ],
  },
  {
    key: 'EvoLinkAI',
    label: 'EvoLinkAI',
    repo: 'EvoLinkAI/awesome-gpt-image-2-API-and-Prompts',
    candidates: [
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/prompts.json',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/master/prompts.json',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/README.md',
      'https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/master/README.md',
    ],
  },
  {
    key: 'freestylefly',
    label: 'Freestylefly',
    repo: 'freestylefly/awesome-gpt-image-2',
    candidates: [
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/prompts.json',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/master/prompts.json',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/README.md',
      'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/master/README.md',
    ],
  },
]

function cloneDefault(): PersistedState {
  return JSON.parse(JSON.stringify(defaultState)) as PersistedState
}

function cloneDefaultCoverPresets(): CoverPreset[] {
  return JSON.parse(JSON.stringify(defaultCoverPresets)) as CoverPreset[]
}

function normalizeDefaultExportFormat(value: unknown): ExportFormat {
  return value === 'png' || value === 'jpg' || value === 'webp' || value === 'svg' ? value : 'svg'
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeStyle(value: unknown): string {
  return typeof value === 'string' && stylePresets.includes(value) ? value : '自然'
}

function normalizeDefaultImageModelId(value: unknown, modelList: ModelProfile[]): string {
  const imageModels = modelList.filter((model) => model.kind === 'image' && model.provider !== 'local-preview' && model.id !== 'local-preview')
  if (typeof value === 'string' && imageModels.some((model) => model.id === value)) return value
  return imageModels.find((model) => model.isPrimary)?.id ?? imageModels[0]?.id ?? ''
}

function defaultModelApiPath(kind: ModelProfile['kind']): string {
  if (kind === 'text') return 'v1/chat/completions'
  if (kind === 'tts') return 'v1/audio/speech'
  return 'v1/images/generations'
}

function defaultModelApiProtocol(kind: ModelProfile['kind']): NonNullable<ModelProfile['apiProtocol']> {
  if (kind === 'text') return 'openai-chat'
  if (kind === 'tts') return 'openai-audio-speech'
  return 'openai-images'
}

function splitLegacyEndpoint(endpoint: string, kind: ModelProfile['kind']): Pick<ModelProfile, 'endpoint' | 'apiPath'> {
  const fallback = {
    endpoint: endpoint.trim(),
    apiPath: defaultModelApiPath(kind),
  }
  if (!endpoint.trim()) return fallback

  try {
    const url = new URL(endpoint.trim())
    const segments = url.pathname.split('/').filter(Boolean)
    const openapiIndex = segments.findIndex((segment, index) => segment === 'openapi' && segments[index + 1] === 'v1' && segments[index + 2] === 'storyboard')
    if (openapiIndex >= 0) {
      const apiPath = segments.slice(openapiIndex).join('/')
      const baseSegments = segments.slice(0, openapiIndex)
      url.pathname = baseSegments.length ? `/${baseSegments.join('/')}` : '/'
      url.search = ''
      return {
        endpoint: url.toString().replace(/\/$/, ''),
        apiPath,
      }
    }

    const v1Index = segments.lastIndexOf('v1')
    if (v1Index < 0) {
      url.search = ''
      return { ...fallback, endpoint: url.toString().replace(/\/$/, '') }
    }

    const apiPath = segments.slice(v1Index).join('/')
    const baseSegments = segments.slice(0, v1Index)
    url.pathname = baseSegments.length ? `/${baseSegments.join('/')}` : '/'
    url.search = ''
    return {
      endpoint: url.toString().replace(/\/$/, ''),
      apiPath: apiPath || defaultModelApiPath(kind),
    }
  } catch {
    return fallback
  }
}

function normalizeModelProfile(model: ModelProfile): ModelProfile {
  const apiProtocol = model.apiProtocol ?? defaultModelApiProtocol(model.kind)
  if (typeof model.apiPath === 'string') {
    const split = splitLegacyEndpoint(model.endpoint, model.kind)
    return {
      ...model,
      endpoint: split.endpoint,
      apiPath: model.apiPath.trim().replace(/^\/+|\/+$/g, ''),
      apiProtocol,
    }
  }

  return {
    ...model,
    ...splitLegacyEndpoint(model.endpoint, model.kind),
    apiProtocol,
  }
}

function normalizeModelList(modelList: ModelProfile[]): ModelProfile[] {
  const visibleModels = modelList.filter((model) => model.provider !== 'local-preview' && model.id !== 'local-preview')
  return (visibleModels.length ? visibleModels : defaultModels).map(normalizeModelProfile)
}

function normalizePromptList(promptList?: PromptItem[]): PromptItem[] {
  const customPrompts = (promptList ?? []).filter((item) => {
    if (item.source === 'builtin') return false
    return ![item.category, item.subCategory, ...(item.tags ?? [])].some((value) => isBlockedPromptCategory(value))
  })
  return mergePromptItems(defaultPrompts, customPrompts)
}

function compactBrowserState(state: PersistedState): PersistedState {
  return {
    ...state,
    tasks: (state.tasks ?? []).map((task) => ({
      ...task,
      assets: task.assets.map((asset) => ({
        ...asset,
        dataUrl: '',
      })),
    })),
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error || fallback
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = record.message ?? record.error
    if (typeof message === 'string' && message.trim()) return message
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return fallback
}

function createGenerationErrorDetails(
  input: GenerationInput,
  error: unknown,
  model?: ModelProfile,
): Record<string, string | number | boolean | null> {
  const details: Record<string, string | number | boolean | null> = {
    errorMessage: errorMessage(error, '生成失败'),
    mode: input.mode,
    width: input.width,
    height: input.height,
    batchSize: input.batchSize,
    steps: input.steps,
    seed: input.seed,
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.kind === 'string') details.errorKind = record.kind
    if (typeof record.code === 'string' || typeof record.code === 'number') details.errorCode = record.code
  }

  if (model) {
    details.modelName = model.name
    details.modelId = model.id
    details.model = model.model
    details.provider = model.provider
    details.endpoint = model.endpoint
    details.apiPath = model.apiPath ?? null
    details.apiProtocol = model.apiProtocol ?? null
    details.apiSecret = model.apiSecret?.trim() ? '已填写' : null
    details.modelStatus = model.status
  } else {
    details.modelId = input.modelId || null
  }

  return details
}

function createFailedGenerationTask(input: GenerationInput, error: unknown, model?: ModelProfile): GenerationTask {
  return {
    id: createId('task'),
    mode: input.mode,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    modelId: input.modelId,
    width: input.width,
    height: input.height,
    batchSize: input.batchSize,
    steps: input.steps,
    seed: input.seed,
    style: input.style,
    modeOptions: input.modeOptions,
    status: 'failed',
    error: errorMessage(error, '生成失败'),
    errorDetails: createGenerationErrorDetails(input, error, model),
    isFavorite: false,
    assets: [],
    createdAt: new Date().toISOString(),
  }
}

export const useAppStore = defineStore('app', () => {
  const initial = compactBrowserState(browserStorage.read<PersistedState>(STORAGE_KEY, cloneDefault()))
  const initialModels = normalizeModelList(initial.models.length ? initial.models : defaultModels)
  const initialSettings = { ...defaultState.settings, ...initial.settings }
  initialSettings.defaultExportFormat = normalizeDefaultExportFormat(initialSettings.defaultExportFormat)
  initialSettings.defaultImageModelId = normalizeDefaultImageModelId(initialSettings.defaultImageModelId, initialModels)
  initialSettings.defaultGenerationSize = normalizeInteger(initialSettings.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
  initialSettings.defaultBatchSize = normalizeInteger(initialSettings.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
  initialSettings.defaultStyle = normalizeStyle(initialSettings.defaultStyle)
  const models = ref<ModelProfile[]>(initialModels)
  const prompts = ref<PromptItem[]>(normalizePromptList(initial.prompts))
  const tasks = ref<GenerationTask[]>(initial.tasks)
  const coverPresets = ref<CoverPreset[]>(initial.coverPresets.length ? initial.coverPresets : cloneDefaultCoverPresets())
  const promptSync = ref<PromptSyncState>(initial.promptSync ?? {})
  const settings = ref<AppSettings>(initialSettings)
  const toast = ref<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const activePrompt = ref('')
  const activeMode = ref<GenerationMode>('txt2img')

  const imageModels = computed(() => models.value.filter((model) => model.kind === 'image'))
  const textModels = computed(() => models.value.filter((model) => model.kind === 'text'))
  const ttsModels = computed(() => models.value.filter((model) => model.kind === 'tts'))
  const primaryImageModel = computed(() => imageModels.value.find((model) => model.isPrimary) ?? imageModels.value[0])
  const primaryTextModel = computed(() => textModels.value.find((model) => model.isPrimary) ?? textModels.value[0])
  const defaultImageModel = computed(() => imageModels.value.find((model) => model.id === settings.value.defaultImageModelId) ?? primaryImageModel.value)
  const enabledCoverPresets = computed(() => coverPresets.value.filter((preset) => preset.enabled))
  const recentTasks = computed(() => tasks.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8))
  const operationTasks = computed(() => tasks.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const historyTasks = computed(() => operationTasks.value.filter((task) => task.status === 'completed' && task.assets.length > 0))
  const historyAssetCount = computed(() => historyTasks.value.reduce((sum, task) => sum + task.assets.length, 0))
  const allAssets = computed(() => tasks.value.flatMap((task) => task.assets.map((asset) => ({ task, asset }))))
  const completedAssets = computed(() => allAssets.value.filter(({ task }) => task.status === 'completed'))
  const favoriteTasks = computed(() => tasks.value.filter((task) => task.isFavorite))
  const favoriteAssets = computed(() =>
    tasks.value
      .flatMap((task) => task.assets)
      .filter((asset) => asset.isFavorite),
  )

  function snapshotState(): PersistedState {
    return {
      models: models.value,
      prompts: prompts.value,
      tasks: tasks.value,
      coverPresets: coverPresets.value,
      promptSync: promptSync.value,
      settings: settings.value,
    }
  }

  function snapshotBrowserState(): PersistedState {
    return compactBrowserState(snapshotState())
  }

  function applyPersistedState(next: PersistedState): void {
    const nextModels = normalizeModelList(next.models?.length ? next.models : defaultModels)
    const nextSettings = { ...defaultState.settings, ...next.settings }
    nextSettings.defaultExportFormat = normalizeDefaultExportFormat(nextSettings.defaultExportFormat)
    nextSettings.defaultImageModelId = normalizeDefaultImageModelId(nextSettings.defaultImageModelId, nextModels)
    nextSettings.defaultGenerationSize = normalizeInteger(nextSettings.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
    nextSettings.defaultBatchSize = normalizeInteger(nextSettings.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
    nextSettings.defaultStyle = normalizeStyle(nextSettings.defaultStyle)

    models.value = nextModels
    prompts.value = normalizePromptList(next.prompts)
    tasks.value = next.tasks ?? []
    coverPresets.value = next.coverPresets?.length ? next.coverPresets : cloneDefaultCoverPresets()
    promptSync.value = next.promptSync ?? {}
    settings.value = nextSettings
  }

  function persist(): void {
    const snapshot = snapshotState()
    persistBrowserState(snapshotBrowserState())
    if (isTauriRuntime()) {
      void invokeOptional('save_app_state', { value: snapshot }).catch((error: unknown) => {
        console.warn('Failed to persist app state to Tauri', error)
      })
    }
  }

  function persistBrowserState(snapshot: PersistedState): void {
    try {
      browserStorage.write(STORAGE_KEY, snapshot)
    } catch (error) {
      console.warn('Failed to persist compact app state to browser storage; retrying after clearing legacy state', error)
      try {
        localStorage.removeItem(STORAGE_KEY)
        browserStorage.write(STORAGE_KEY, snapshot)
      } catch (retryError) {
        console.warn('Failed to persist compact app state to browser storage after clearing legacy state', retryError)
      }
    }
  }

  function notify(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    toast.value = { message, type }
    window.setTimeout(() => {
      if (toast.value?.message === message) toast.value = null
    }, 2400)
  }

  function repairDefaultImageModel(): void {
    settings.value.defaultImageModelId = normalizeDefaultImageModelId(settings.value.defaultImageModelId, models.value)
  }

  function resolveMode(value: string | null | undefined): GenerationMode {
    if (!value) return 'txt2img'
    if (value in modeLabels) return value as GenerationMode
    return modeAliases[value] ?? 'txt2img'
  }

  function setMode(mode: GenerationMode): void {
    activeMode.value = mode
  }

  function setActivePrompt(prompt: string): void {
    activePrompt.value = prompt
  }

  async function loadPersistedTasks(): Promise<void> {
    const backendState = await invokeOptional<PersistedState>('load_app_state').catch((error: unknown) => {
      console.warn('Failed to load app state from Tauri', error)
      return null
    })
    if (backendState) {
      applyPersistedState(backendState)
      persistBrowserState(snapshotBrowserState())
    }

    const backendTasks = await invokeOptional<GenerationTask[]>('list_generation_tasks', { limit: 500 }).catch((error: unknown) => {
      console.warn('Failed to load persisted tasks from Tauri', error)
      return null
    })
    if (!backendTasks?.length) return

    const existingIds = new Set(tasks.value.map((task) => task.id))
    const merged = [...backendTasks.filter((task) => !existingIds.has(task.id)), ...tasks.value]
    tasks.value = merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    persist()
  }

  async function generate(input: GenerationInput): Promise<GenerationTask> {
    const selectedImageModel = imageModels.value.find((model) => model.id === input.modelId)
    const validationMessage = imageGenerationValidationMessage(selectedImageModel)
    if (validationMessage) {
      const failedTask = createFailedGenerationTask(input, new Error(validationMessage), selectedImageModel)
      recordGenerationTask(failedTask)
      notify(validationMessage, 'error')
      throw new Error(validationMessage)
    }
    if (!isTauriRuntime()) {
      const message = '请在桌面版使用真实图像模型生成图片'
      const failedTask = createFailedGenerationTask(input, new Error(message), selectedImageModel)
      recordGenerationTask(failedTask)
      notify(message, 'error')
      throw new Error(message)
    }

    let task: GenerationTask
    try {
      const commandResult = await invokeOptional<GenerationTask>('create_generation_task', { input, model: selectedImageModel })
      if (!commandResult) throw new Error('Tauri 生成命令不可用')
      task = commandResult
    } catch (error) {
      const failedTask = createFailedGenerationTask(input, error, selectedImageModel)
      recordGenerationTask(failedTask)
      notify(failedTask.error ?? '生成失败', 'error')
      throw new Error(failedTask.error ?? '生成失败', { cause: error })
    }

    if (settings.value.autoSaveHistory) {
      recordGenerationTask(task)
      notify(`已生成 ${task.assets.length} 张${modeLabels[task.mode]}结果`)
    } else {
      notify(`已生成 ${task.assets.length} 张${modeLabels[task.mode]}结果，未保存到资产库`, 'info')
    }
    return task
  }

  function recordGenerationTask(task: GenerationTask): void {
    tasks.value = [task, ...tasks.value.filter((item) => item.id !== task.id)]
    persist()
  }

  function imageGenerationValidationMessage(model: ModelProfile | undefined): string | null {
    if (!model || model.provider === 'local-preview') return '请先配置并选择真实图像模型'
    if (!model.endpoint.trim()) return '请填写图像模型 API 地址'
    if (!model.apiKey.trim()) return '请填写图像模型 API Key'
    if (model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) return '请填写 MGTV 图像模型 Secret Key'
    if (!model.model.trim()) return '请填写图像模型 ID'
    return null
  }

  async function polishPrompt(input: TextPolishInput, modelId?: string): Promise<TextPolishResult> {
    const selectedTextModel = textModels.value.find((model) => model.id === modelId) ?? primaryTextModel.value
    if (isTauriRuntime()) {
      const result = await invokeOptional<TextPolishResult>('polish_prompt', { input, model: selectedTextModel })
      if (!result) throw new Error('Tauri 润色命令不可用')
      notify(`已使用 ${result.modelName} 润色提示词`)
      return result
    }

    const modelName = selectedTextModel?.name ?? '本地文本润色'
    if (input.task === 'translate-to-english') {
      const result = {
        prompt: [
          input.prompt.trim(),
          `${input.style} style`,
          'clear subject, stable composition, layered lighting, rich material details',
          `optimized for ${input.modeLabel} image generation`,
          `translated by ${modelName}`,
        ].join(', '),
        modelName,
      }
      notify(`已使用 ${result.modelName} 翻译为英文提示词`)
      return result
    }
    const result = {
      prompt: [
        input.prompt.trim() || '一个高质量的本地 AI 图像生成工作台界面',
        `${input.style}风格`,
        '主体明确，构图稳定，光线层次清晰，材质细节丰富',
        `适合${input.modeLabel}输出`,
        `由 ${modelName} 润色`,
      ].join('，'),
      modelName,
    }
    notify(`已使用 ${result.modelName} 润色提示词`)
    return result
  }

  function configuredTextModel(modelId?: string): ModelProfile | undefined {
    const selected = textModels.value.find((model) => model.id === modelId) ?? primaryTextModel.value
    if (!selected || selected.provider === 'local-preview') return undefined
    if (!selected.endpoint.trim() || !selected.apiKey.trim() || !selected.model.trim()) return undefined
    return selected
  }

  async function translatePromptToEnglish(input: TextPolishInput, modelId?: string): Promise<TextPolishResult> {
    if (!containsChineseText(input.prompt)) return { prompt: input.prompt, modelName: '无需翻译' }
    const selectedTextModel = configuredTextModel(modelId)
    if (!selectedTextModel) {
      throw new Error('检测到中文提示词，请先配置可用的文本模型用于自动翻译英文提示词')
    }
    const request: TextPolishInput = { ...input, task: 'translate-to-english' }
    if (isTauriRuntime()) {
      const result = await invokeOptional<TextPolishResult>('polish_prompt', { input: request, model: selectedTextModel })
      if (!result) throw new Error('Tauri 翻译命令不可用')
      notify(`已使用 ${result.modelName} 翻译为英文提示词`)
      return result
    }
    const result = await polishPrompt(request, selectedTextModel.id)
    notify(`已使用 ${result.modelName} 翻译为英文提示词`)
    return result
  }

  async function fetchModelCatalog(profile: ModelProfile): Promise<ModelCatalogItem[]> {
    if (!isTauriRuntime()) return []
    const result = await invokeOptional<ModelCatalogItem[]>('list_model_catalog', { profile })
    if (!result) throw new Error('Tauri 模型列表命令不可用')
    return result
  }

  function importPrompts(content: string, filename: string): number {
    return importPromptBatch([{ content, filename }])
  }

  function importPromptBatch(files: Array<{ content: string; filename: string }>): number {
    const imported = files.flatMap((file) => normalizePromptImport(file.content, file.filename))
    const before = prompts.value.length
    prompts.value = mergePromptItems(prompts.value, imported)
    persist()
    const count = prompts.value.length - before
    notify(count ? `已导入 ${count} 条提示词` : '没有新增提示词', count ? 'success' : 'info')
    return count
  }

  async function syncPromptSource(key: PromptSyncSource['key']): Promise<void> {
    const source = promptSyncSources.find((item) => item.key === key)
    if (!source) {
      notify('未知的同步来源', 'error')
      return
    }

    const backup = prompts.value.slice()
    let lastError: unknown = null

    for (const url of source.candidates) {
      try {
        const response = await fetch(url, { cache: 'no-cache' })
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`)
          continue
        }

        const content = await response.text()
        const imported = normalizePromptSync(content, key, url)
        if (!imported.length) {
          lastError = new Error('未解析到提示词')
          continue
        }

        const keep = prompts.value.filter((item) => item.source !== key)
        prompts.value = mergePromptItems(keep, imported)
        promptSync.value = {
          ...promptSync.value,
          [key]: {
            at: new Date().toISOString(),
            count: imported.length,
            url,
          },
        }
        persist()
        notify(`${source.label} 已同步 ${imported.length} 条提示词`)
        return
      } catch (error) {
        lastError = error
      }
    }

    prompts.value = backup
    persist()
    const message = lastError instanceof Error ? lastError.message : '网络错误'
    notify(`${source.label} 同步失败：${message}，已保留本地数据`, 'error')
  }

  function usePrompt(item: PromptItem): void {
    activePrompt.value = item.promptEn || item.prompt
    notify(`已应用提示词：${item.title}`)
  }

  function removePrompt(id: string): void {
    const target = prompts.value.find((item) => item.id === id)
    if (!target) return
    if (target.source === 'builtin') {
      notify('内置提示词不能删除', 'error')
      return
    }

    prompts.value = prompts.value.filter((item) => item.id !== id)
    persist()
    notify(`已删除提示词：${target.title}`)
  }

  function saveModel(profile: ModelProfile): void {
    const next = normalizeModelProfile(profile.id ? profile : { ...profile, id: createId('model') })
    if (next.provider === 'local-preview' || next.id === 'local-preview') {
      notify('本地预览模型已移除，请配置真实图像模型', 'error')
      return
    }
    if (next.isPrimary) {
      models.value = models.value.map((model) => (model.kind === next.kind ? { ...model, isPrimary: false } : model))
    }
    const index = models.value.findIndex((model) => model.id === next.id)
    if (index >= 0) models.value[index] = next
    else models.value.push(next)
    repairDefaultImageModel()
    persist()
    notify('模型配置已保存')
  }

  function setPrimaryImageModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'image')
    if (!target) {
      notify('请选择有效的图像模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'image' ? { ...model, isPrimary: model.id === id } : model
    ))
    settings.value.defaultImageModelId = id
    persist()
    notify(`已设为主模型：${target.name}`)
  }

  function setPrimaryTextModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'text')
    if (!target) {
      notify('请选择有效的文本模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'text' ? { ...model, isPrimary: model.id === id } : model
    ))
    persist()
    notify(`已设为主文本模型：${target.name}`)
  }

  function setPrimaryTtsModel(id: string): void {
    const target = models.value.find((model) => model.id === id && model.kind === 'tts')
    if (!target) {
      notify('请选择有效的语音模型', 'error')
      return
    }
    models.value = models.value.map((model) => (
      model.kind === 'tts' ? { ...model, isPrimary: model.id === id } : model
    ))
    persist()
    notify(`已设为主语音模型：${target.name}`)
  }

  function modelConnectionValidationMessage(model: ModelProfile): string | null {
    if (model.provider === 'local-preview') return null
    if (!model.endpoint.trim()) return model.kind === 'text' ? '请填写文本模型 API 地址' : '请填写 API 地址'
    if (!model.apiKey.trim()) return model.kind === 'text' ? '请填写文本模型 API Key' : '请填写 API Key'
    if (model.kind === 'image' && model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) return '请填写 MGTV 图像模型 Secret Key'
    if (model.kind === 'text' && !model.model.trim()) return '请填写文本模型 ID'
    if (model.kind === 'image' && !model.model.trim()) return '请填写图像模型 ID'
    return null
  }

  async function testModel(id: string): Promise<void> {
    const model = models.value.find((item) => item.id === id)
    if (!model) return
    const validationMessage = modelConnectionValidationMessage(model)
    if (validationMessage) {
      model.status = 'failed'
      model.lastCheckedAt = new Date().toISOString()
      persist()
      notify(validationMessage, 'error')
      return
    }
    if (!isTauriRuntime()) {
      model.status = 'untested'
      model.lastCheckedAt = new Date().toISOString()
      persist()
      notify('浏览器预览模式不能直连模型 API，请在桌面版检测连接', 'info')
      return
    }
    const result = await invokeOptional<{ ok: boolean; message: string }>('test_model_profile', { profile: model }).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : '模型连接检测失败',
    }))
    model.status = result?.ok ? 'connected' : 'failed'
    model.lastCheckedAt = new Date().toISOString()
    persist()
    notify(result?.message ?? (isTauriRuntime() ? '模型连接检测失败' : '浏览器预览模式无法直连模型 API'), result?.ok ? 'success' : 'error')
  }

  function removeModel(id: string): void {
    models.value = models.value.filter((model) => model.id !== id)
    if (!imageModels.value.some((model) => model.isPrimary)) {
      const first = imageModels.value[0]
      if (first) first.isPrimary = true
    }
    repairDefaultImageModel()
    persist()
    notify('模型已删除')
  }

  function saveSettings(next: Partial<AppSettings>): void {
    settings.value = { ...settings.value, ...next }
    settings.value.defaultExportFormat = normalizeDefaultExportFormat(settings.value.defaultExportFormat)
    settings.value.defaultImageModelId = normalizeDefaultImageModelId(settings.value.defaultImageModelId, models.value)
    settings.value.defaultGenerationSize = normalizeInteger(settings.value.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
    settings.value.defaultBatchSize = normalizeInteger(settings.value.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
    settings.value.defaultStyle = normalizeStyle(settings.value.defaultStyle)
    persist()
    notify('设置已保存')
  }

  function addCoverPreset(preset: Omit<CoverPreset, 'id' | 'custom'>): boolean {
    const rawWidth = Number(preset.width)
    const rawHeight = Number(preset.height)
    if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth < 128 || rawWidth > 4096 || rawHeight < 128 || rawHeight > 4096) {
      notify('请输入 128 到 4096 之间的有效尺寸', 'error')
      return false
    }
    const width = Math.round(rawWidth)
    const height = Math.round(rawHeight)

    coverPresets.value.push({ ...preset, width, height, id: createId('cover'), custom: true })
    persist()
    notify('封面预设已添加')
    return true
  }

  function setCoverPresetEnabled(id: string, enabled: boolean): void {
    const preset = coverPresets.value.find((item) => item.id === id)
    if (!preset) return
    preset.enabled = enabled
    persist()
    notify(enabled ? '封面预设已启用' : '封面预设已停用', 'info')
  }

  function removeCoverPreset(id: string): void {
    const preset = coverPresets.value.find((item) => item.id === id)
    if (preset && !preset.custom) {
      notify('内置封面预设不能删除，可在系统设置中停用', 'error')
      return
    }
    coverPresets.value = coverPresets.value.filter((preset) => preset.id !== id)
    persist()
    notify('封面预设已删除')
  }

  function resetCoverPresets(): void {
    coverPresets.value = cloneDefaultCoverPresets()
    persist()
    notify('已恢复默认封面预设')
  }

  async function resetDemoData(): Promise<void> {
    const fresh = cloneDefault()
    models.value = fresh.models
    prompts.value = fresh.prompts
    coverPresets.value = fresh.coverPresets
    settings.value = fresh.settings
    tasks.value = []
    activePrompt.value = ''
    await invokeOptional('clear_generation_tasks').catch((error: unknown) => {
      console.warn('Failed to clear persisted tasks from Tauri', error)
    })
    persist()
    notify('已恢复初始数据')
  }

  async function clearHistory(): Promise<void> {
    tasks.value = []
    await invokeOptional('clear_generation_tasks').catch((error: unknown) => {
      console.warn('Failed to clear persisted tasks from Tauri', error)
    })
    persist()
    notify('资产库已清空')
  }

  async function removeGeneratedAsset(taskId: string, assetId: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === taskId)
    if (!task) return

    const target = task.assets.find((asset) => asset.id === assetId)
    if (!target) return

    const nextAssets = task.assets.filter((asset) => asset.id !== assetId)
    if (nextAssets.length) {
      task.assets = nextAssets
    } else {
      tasks.value = tasks.value.filter((item) => item.id !== taskId)
    }

    await invokeOptional('delete_generation_asset', { taskId, assetId }).catch((error: unknown) => {
      console.warn('Failed to delete generated asset from Tauri', error)
    })
    persist()
    notify(`已删除图片：${target.title}`)
  }

  function toggleTaskFavorite(id: string): void {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    task.isFavorite = !task.isFavorite
    persist()
    notify(task.isFavorite ? `已收藏：${task.prompt}` : `已取消收藏：${task.prompt}`, task.isFavorite ? 'success' : 'info')
  }

  function toggleAssetFavorite(assetId: string): void {
    for (const task of tasks.value) {
      const asset = task.assets.find((item) => item.id === assetId)
      if (asset) {
        asset.isFavorite = !asset.isFavorite
        persist()
        notify(asset.isFavorite ? '已加入收藏' : '已取消收藏', asset.isFavorite ? 'success' : 'info')
        return
      }
    }
  }

  async function downloadAllAssets(
    format: ExportFormat = settings.value.defaultExportFormat,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string },
  ): Promise<void> {
    const taskAssets = completedAssets.value
    if (!taskAssets.length) {
      notify('暂无可导出的结果', 'info')
      return
    }

    for (const { task, asset } of taskAssets) {
      await downloadAsset(asset, format, 1, task, options)
    }
    notify(`已导出 ${taskAssets.length} 个结果`)
  }

  async function downloadAsset(
    asset: GeneratedAsset,
    format: ExportFormat = settings.value.defaultExportFormat,
    scale = 1,
    task?: GenerationTask,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string; customTitle?: string },
  ): Promise<void> {
    const exportScale = format === 'ico' ? 1 : scale
    const exportData = await prepareExportAsset(asset, format, exportScale, options)
    const baseTitle = options?.customTitle?.trim() || asset.title
    const exportTitle = `${baseTitle}${options?.titleSuffix ?? ''}`
    const metadataJson = settings.value.includePromptMetadata && task ? createExportMetadataJson(task, asset, exportData, exportScale) : undefined
    const result = await invokeOptional<{ path: string; metadataPath?: string }>('export_generated_asset', {
      request: {
        dataUrl: exportData.dataUrl,
        outputDir: settings.value.defaultOutputDir,
        title: exportTitle,
        format: exportData.format,
        metadataJson,
      },
    }).catch((error: unknown) => {
      console.warn('Tauri export failed; using browser download fallback', error)
      return null
    })

    if (result?.path) {
      asset.localPath = result.path
      persist()
      notify(result.metadataPath ? `已导出到 ${result.path}，元数据已保存` : `已导出到 ${result.path}`)
      return
    }

    triggerBrowserDownload(exportData.dataUrl, `${exportTitle}.${exportData.format}`)
    if (metadataJson) {
      const metadataUrl = URL.createObjectURL(new Blob([metadataJson], { type: 'application/json' }))
      triggerBrowserDownload(metadataUrl, `${exportTitle}.metadata.json`)
      URL.revokeObjectURL(metadataUrl)
    }
    notify(metadataJson ? '已导出图片和提示词元数据到浏览器下载目录' : '已导出到浏览器下载目录')
  }

  async function downloadIconBundle(
    asset: GeneratedAsset,
    selectedSizes: number[],
    projectName?: string,
  ): Promise<void> {
    if (!selectedSizes.length) {
      notify('请至少选择一个导出尺寸', 'error')
      return
    }

    const baseName = (projectName ?? '').trim() || asset.title || 'icon'
    const image = await loadImageFromDataUrl(asset.dataUrl)
    const entries: Array<{ name: string; dataUrl: string }> = []

    for (const size of selectedSizes.sort((a, b) => a - b)) {
      const { canvas, context } = createCanvas(size, size)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, size, size)

      // 每个尺寸生成独立的单帧 ICO 文件
      const pngBytes = await canvasToPngBytes(canvas)
      const icoBytes = buildIcoFile([{ size, bytes: pngBytes }])
      entries.push({ name: `${baseName}_${size}x${size}.ico`, dataUrl: bytesToDataUrl(icoBytes, 'image/x-icon') })
    }

    // Tauri 模式：后端打包 ZIP 写入本地
    const result = await invokeOptional<string>('export_icon_bundle', {
      request: {
        entries,
        outputDir: settings.value.defaultOutputDir,
        bundleName: baseName,
      },
    }).catch((error: unknown) => {
      console.warn('Tauri icon bundle export failed; using browser download fallback', error)
      return null
    })

    if (result) {
      notify(`已导出 ${selectedSizes.length} 个 ICO 图标到 ${result}`)
      return
    }

    // 浏览器模式：前端打包 ZIP 下载
    const fileBuffers: Array<{ name: string; data: Uint8Array }> = []
    for (const entry of entries) {
      const base64 = entry.dataUrl.split(',')[1] ?? ''
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      fileBuffers.push({ name: entry.name, data: bytes })
    }

    const zipBytes = buildZipFile(fileBuffers)
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    triggerBrowserDownload(url, `${baseName}.zip`)
    URL.revokeObjectURL(url)
    notify(`已导出 ${selectedSizes.length} 个 ICO 图标到浏览器下载目录`)
  }

  async function prepareExportAsset(
    asset: GeneratedAsset,
    format: ExportFormat,
    scale = 1,
    options?: { iconSizes?: number[]; canvasFilter?: string; titleSuffix?: string },
  ): Promise<ExportAssetData> {
    const hasFilter = Boolean(options?.canvasFilter && options.canvasFilter !== 'none')
    if (format === 'gif') {
      const dataUrl = asset.dataUrl.startsWith('data:image/gif') ? asset.dataUrl : fallbackGifDataUrl
      return { dataUrl, format: 'gif', width: asset.width, height: asset.height }
    }
    if (!hasFilter && format === asset.format && scale === 1) return { dataUrl: asset.dataUrl, format, width: asset.width, height: asset.height }
    if (format === 'ico') return createIcoDataUrl(asset.dataUrl, asset.width, asset.height, options?.iconSizes)
    if (format === 'svg') return { dataUrl: asset.dataUrl, format: asset.format, width: asset.width, height: asset.height }
    const width = asset.width * scale
    const height = asset.height * scale
    return { dataUrl: await rasterizeDataUrl(asset.dataUrl, width, height, format, options?.canvasFilter), format, width, height }
  }

  function createExportMetadataJson(task: GenerationTask, asset: GeneratedAsset, exportData: ExportAssetData, scale: number): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        taskId: task.id,
        mode: task.mode,
        prompt: task.prompt,
        negativePrompt: task.negativePrompt,
        modelId: task.modelId,
        width: task.width,
        height: task.height,
        batchSize: task.batchSize,
        steps: task.steps,
        seed: task.seed,
        style: task.style,
        modeOptions: task.modeOptions ?? {},
        status: task.status,
        createdAt: task.createdAt,
        asset: {
          id: asset.id,
          title: asset.title,
          format: exportData.format,
          width: exportData.width,
          height: exportData.height,
          bundleSizes: exportData.bundleSizes ?? [],
          originalFormat: asset.format,
          originalWidth: asset.width,
          originalHeight: asset.height,
          exportScale: scale,
          createdAt: asset.createdAt,
        },
      },
      null,
      2,
    )
  }

  function triggerBrowserDownload(href: string, filename: string): void {
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return {
    models,
    prompts,
    tasks,
    coverPresets,
    promptSync,
    settings,
    toast,
    activePrompt,
    activeMode,
    imageModels,
    textModels,
    ttsModels,
    primaryImageModel,
    primaryTextModel,
    defaultImageModel,
    enabledCoverPresets,
    recentTasks,
    operationTasks,
    historyTasks,
    historyAssetCount,
    completedAssets,
    favoriteTasks,
    favoriteAssets,
    promptSyncSources,
    resolveMode,
    setMode,
    setActivePrompt,
    loadPersistedTasks,
    generate,
    polishPrompt,
    translatePromptToEnglish,
    fetchModelCatalog,
    importPrompts,
    importPromptBatch,
    syncPromptSource,
    usePrompt,
    removePrompt,
    saveModel,
    setPrimaryImageModel,
    setPrimaryTextModel,
    setPrimaryTtsModel,
    testModel,
    removeModel,
    saveSettings,
    addCoverPreset,
    setCoverPresetEnabled,
    removeCoverPreset,
    resetCoverPresets,
    resetDemoData,
    clearHistory,
    removeGeneratedAsset,
    recordGenerationTask,
    toggleTaskFavorite,
    toggleAssetFavorite,
    downloadAllAssets,
    downloadAsset,
    downloadIconBundle,
    notify,
  }
})
