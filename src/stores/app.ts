import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createLocalGeneration } from '@/domain/generation'
import { mergePromptItems, normalizePromptImport } from '@/domain/promptImport'
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
import type {
  AppSettings,
  CoverPreset,
  GeneratedAsset,
  GenerationInput,
  GenerationMode,
  GenerationTask,
  ExportFormat,
  ModelProfile,
  PromptItem,
} from '@/types/domain'
import { createId } from '@/domain/ids'

const STORAGE_KEY = 'samimage.v3.state'
const rasterExportMime: Record<'png' | 'jpg' | 'webp', string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

interface PersistedState {
  models: ModelProfile[]
  prompts: PromptItem[]
  tasks: GenerationTask[]
  coverPresets: CoverPreset[]
  settings: AppSettings
}

interface ExportAssetData {
  dataUrl: string
  format: ExportFormat
  width: number
  height: number
}

const defaultState: PersistedState = {
  models: defaultModels,
  prompts: defaultPrompts,
  tasks: [],
  coverPresets: defaultCoverPresets,
  settings: {
    defaultOutputDir: 'D:\\SamImage\\Exports',
    defaultExportFormat: 'svg',
    defaultImageModelId: 'local-preview',
    defaultGenerationSize: 1024,
    defaultBatchSize: 4,
    defaultStyle: '自然',
    autoSaveHistory: true,
    includePromptMetadata: true,
    theme: 'dark',
  },
}

function cloneDefault(): PersistedState {
  return JSON.parse(JSON.stringify(defaultState)) as PersistedState
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
  const imageModels = modelList.filter((model) => model.kind === 'image')
  if (typeof value === 'string' && imageModels.some((model) => model.id === value)) return value
  return imageModels.find((model) => model.isPrimary)?.id ?? imageModels[0]?.id ?? ''
}

async function rasterizeDataUrl(dataUrl: string, width: number, height: number, format: 'png' | 'jpg' | 'webp'): Promise<string> {
  const image = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('导出图片渲染失败'))
  })
  image.src = dataUrl
  await loaded

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持图片导出')

  if (format === 'jpg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL(rasterExportMime[format], 0.92)
}

export const useAppStore = defineStore('app', () => {
  const initial = browserStorage.read<PersistedState>(STORAGE_KEY, cloneDefault())
  const initialModels = initial.models.length ? initial.models : defaultModels
  const initialSettings = { ...defaultState.settings, ...initial.settings }
  initialSettings.defaultExportFormat = normalizeDefaultExportFormat(initialSettings.defaultExportFormat)
  initialSettings.defaultImageModelId = normalizeDefaultImageModelId(initialSettings.defaultImageModelId, initialModels)
  initialSettings.defaultGenerationSize = normalizeInteger(initialSettings.defaultGenerationSize, defaultState.settings.defaultGenerationSize, 128, 4096)
  initialSettings.defaultBatchSize = normalizeInteger(initialSettings.defaultBatchSize, defaultState.settings.defaultBatchSize, 1, 4)
  initialSettings.defaultStyle = normalizeStyle(initialSettings.defaultStyle)
  const models = ref<ModelProfile[]>(initialModels)
  const prompts = ref<PromptItem[]>(initial.prompts.length ? initial.prompts : defaultPrompts)
  const tasks = ref<GenerationTask[]>(initial.tasks)
  const coverPresets = ref<CoverPreset[]>(initial.coverPresets.length ? initial.coverPresets : defaultCoverPresets)
  const settings = ref<AppSettings>(initialSettings)
  const toast = ref<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const activePrompt = ref('')
  const activeMode = ref<GenerationMode>('txt2img')

  const imageModels = computed(() => models.value.filter((model) => model.kind === 'image'))
  const textModels = computed(() => models.value.filter((model) => model.kind === 'text'))
  const primaryImageModel = computed(() => imageModels.value.find((model) => model.isPrimary) ?? imageModels.value[0])
  const primaryTextModel = computed(() => textModels.value.find((model) => model.isPrimary) ?? textModels.value[0])
  const defaultImageModel = computed(() => imageModels.value.find((model) => model.id === settings.value.defaultImageModelId) ?? primaryImageModel.value)
  const recentTasks = computed(() => tasks.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8))
  const allAssets = computed(() => tasks.value.flatMap((task) => task.assets.map((asset) => ({ task, asset }))))
  const completedAssets = computed(() => allAssets.value.filter(({ task }) => task.status === 'completed'))

  function persist(): void {
    browserStorage.write(STORAGE_KEY, {
      models: models.value,
      prompts: prompts.value,
      tasks: tasks.value,
      coverPresets: coverPresets.value,
      settings: settings.value,
    })
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
    const backendTasks = await invokeOptional<GenerationTask[]>('list_generation_tasks', { limit: 500 })
    if (!backendTasks?.length) return

    const existingIds = new Set(tasks.value.map((task) => task.id))
    const merged = [...backendTasks.filter((task) => !existingIds.has(task.id)), ...tasks.value]
    tasks.value = merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    persist()
  }

  async function generate(input: GenerationInput): Promise<GenerationTask> {
    const commandResult = settings.value.autoSaveHistory ? await invokeOptional<GenerationTask>('create_generation_task', { input }) : null
    const task = commandResult ?? createLocalGeneration(input)
    if (settings.value.autoSaveHistory) {
      tasks.value.unshift(task)
      persist()
      notify(`已生成 ${task.assets.length} 张${modeLabels[task.mode]}结果`)
    } else {
      notify(`已生成 ${task.assets.length} 张${modeLabels[task.mode]}结果，未保存到历史`, 'info')
    }
    return task
  }

  function importPrompts(content: string, filename: string): number {
    const imported = normalizePromptImport(content, filename)
    const before = prompts.value.length
    prompts.value = mergePromptItems(prompts.value, imported)
    persist()
    const count = prompts.value.length - before
    notify(count ? `已导入 ${count} 条提示词` : '没有新增提示词', count ? 'success' : 'info')
    return count
  }

  function usePrompt(item: PromptItem): void {
    activePrompt.value = item.prompt
    notify(`已应用提示词：${item.title}`)
  }

  function saveModel(profile: ModelProfile): void {
    const next = profile.id ? profile : { ...profile, id: createId('model') }
    if (next.isPrimary && next.kind === 'image') {
      models.value = models.value.map((model) => (model.kind === 'image' ? { ...model, isPrimary: false } : model))
    }
    const index = models.value.findIndex((model) => model.id === next.id)
    if (index >= 0) models.value[index] = next
    else models.value.push(next)
    repairDefaultImageModel()
    persist()
    notify('模型配置已保存')
  }

  async function testModel(id: string): Promise<void> {
    const model = models.value.find((item) => item.id === id)
    if (!model) return
    if (model.provider === 'local-preview') {
      model.status = 'connected'
      model.lastCheckedAt = new Date().toISOString()
      persist()
      notify('本地预览模型可用')
      return
    }
    const result = await invokeOptional<{ ok: boolean; message: string }>('test_model_profile', { profile: model })
    model.status = result?.ok ? 'connected' : 'failed'
    model.lastCheckedAt = new Date().toISOString()
    persist()
    notify(result?.message ?? (isTauriRuntime() ? '模型连接检测失败' : '浏览器预览模式无法直连模型 API'), result?.ok ? 'success' : 'error')
  }

  function removeModel(id: string): void {
    if (id === 'local-preview') {
      notify('本地预览模型不能删除', 'error')
      return
    }
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

  function addCoverPreset(preset: Omit<CoverPreset, 'id' | 'custom'>): void {
    coverPresets.value.push({ ...preset, id: createId('cover'), custom: true })
    persist()
    notify('封面预设已添加')
  }

  function removeCoverPreset(id: string): void {
    coverPresets.value = coverPresets.value.filter((preset) => preset.id !== id || !preset.custom)
    persist()
    notify('封面预设已删除')
  }

  async function resetDemoData(): Promise<void> {
    const fresh = cloneDefault()
    models.value = fresh.models
    prompts.value = fresh.prompts
    coverPresets.value = fresh.coverPresets
    settings.value = fresh.settings
    tasks.value = []
    activePrompt.value = ''
    await invokeOptional('clear_generation_tasks')
    persist()
    notify('已恢复初始数据')
  }

  async function clearHistory(): Promise<void> {
    tasks.value = []
    await invokeOptional('clear_generation_tasks')
    persist()
    notify('历史记录已清空')
  }

  async function downloadAllAssets(): Promise<void> {
    const taskAssets = completedAssets.value
    if (!taskAssets.length) {
      notify('暂无可导出的结果', 'info')
      return
    }

    for (const { task, asset } of taskAssets) {
      await downloadAsset(asset, settings.value.defaultExportFormat, 1, task)
    }
    notify(`已导出 ${taskAssets.length} 个结果`)
  }

  async function downloadAsset(
    asset: GeneratedAsset,
    format: ExportFormat = settings.value.defaultExportFormat,
    scale = 1,
    task?: GenerationTask,
  ): Promise<void> {
    const exportData = await prepareExportAsset(asset, format, scale)
    const metadataJson = settings.value.includePromptMetadata && task ? createExportMetadataJson(task, asset, exportData, scale) : undefined
    const result = await invokeOptional<{ path: string; metadataPath?: string }>('export_generated_asset', {
      request: {
        dataUrl: exportData.dataUrl,
        outputDir: settings.value.defaultOutputDir,
        title: asset.title,
        format: exportData.format,
        metadataJson,
      },
    })

    if (result?.path) {
      asset.localPath = result.path
      persist()
      notify(result.metadataPath ? `已导出到 ${result.path}，元数据已保存` : `已导出到 ${result.path}`)
      return
    }

    triggerBrowserDownload(exportData.dataUrl, `${asset.title}.${exportData.format}`)
    if (metadataJson) {
      const metadataUrl = URL.createObjectURL(new Blob([metadataJson], { type: 'application/json' }))
      triggerBrowserDownload(metadataUrl, `${asset.title}.metadata.json`)
      URL.revokeObjectURL(metadataUrl)
    }
    notify(metadataJson ? '已导出图片和提示词元数据到浏览器下载目录' : '已导出到浏览器下载目录')
  }

  async function prepareExportAsset(asset: GeneratedAsset, format: ExportFormat, scale = 1): Promise<ExportAssetData> {
    if (format === asset.format && scale === 1) return { dataUrl: asset.dataUrl, format, width: asset.width, height: asset.height }
    if (format === 'svg' || format === 'gif') return { dataUrl: asset.dataUrl, format: asset.format, width: asset.width, height: asset.height }
    const width = asset.width * scale
    const height = asset.height * scale
    return { dataUrl: await rasterizeDataUrl(asset.dataUrl, width, height, format), format, width, height }
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
        status: task.status,
        createdAt: task.createdAt,
        asset: {
          id: asset.id,
          title: asset.title,
          format: exportData.format,
          width: exportData.width,
          height: exportData.height,
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
    settings,
    toast,
    activePrompt,
    activeMode,
    imageModels,
    textModels,
    primaryImageModel,
    primaryTextModel,
    defaultImageModel,
    recentTasks,
    completedAssets,
    resolveMode,
    setMode,
    setActivePrompt,
    loadPersistedTasks,
    generate,
    importPrompts,
    usePrompt,
    saveModel,
    testModel,
    removeModel,
    saveSettings,
    addCoverPreset,
    removeCoverPreset,
    resetDemoData,
    clearHistory,
    downloadAllAssets,
    downloadAsset,
    notify,
  }
})
