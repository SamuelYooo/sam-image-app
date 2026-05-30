<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Bot,
  Box,
  Copy,
  Download,
  FolderOpen,
  Grid2x2,
  Images,
  Library,
  MonitorSmartphone,
  PanelsTopLeft,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-vue-next'
import { aspectPresets, getExportFormatOptions, modeDescriptions, modeLabels, stylePresets, toolEntries } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/tauri'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask, PromptItem } from '@/types/domain'

const route = useRoute()
const store = useAppStore()

const mode = ref<GenerationMode>('txt2img')
const prompt = ref('')
const negativePrompt = ref('低清晰度、变形、文字水印、错误构图')
const style = ref(store.settings.defaultStyle)
const width = ref(store.settings.defaultGenerationSize)
const height = ref(store.settings.defaultGenerationSize)
const batchSize = ref(store.settings.defaultBatchSize)
const steps = ref(28)
const seed = ref(128409)
const creativity = ref(64)
const detailLevel = ref(72)
const imageStrength = ref(55)
const resizeMode = ref('just-resize')
const iconBackground = ref('transparent')
const depthStrength = ref(78)
const gifDuration = ref(4)
const selectedModelId = ref('')
const selectedTextModelId = ref('')
const referenceImage = ref('')
const currentTask = ref<GenerationTask | null>(null)
const selectedAsset = ref<GeneratedAsset | null>(null)
const generating = ref(false)
const promptModalOpen = ref(false)
const libraryOpen = ref(false)
const exportOpen = ref(false)
const promptSearch = ref('')
const promptCategory = ref('全部')
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)
const exportScale = ref(1)
const selectedIcoExportSizes = ref<number[]>([])
const retryNotice = ref('')
const referenceInput = ref<HTMLInputElement | null>(null)
const resizeModeOptions = ['just-resize', 'crop-resize', 'resize-fill'] as const
const iconBackgroundOptions = ['transparent', 'rounded', 'solid'] as const
type RouteModeOptions = Record<string, string | number | boolean>
type SizePreset = {
  id: string
  name: string
  width: number
  height: number
  hint?: string
}

const iconSizePresets: SizePreset[] = [
  { id: 'icon-16', name: '16 x 16', width: 16, height: 16, hint: '浏览器标签' },
  { id: 'icon-32', name: '32 x 32', width: 32, height: 32, hint: '标准 favicon' },
  { id: 'icon-48', name: '48 x 48', width: 48, height: 48, hint: '桌面快捷方式' },
  { id: 'icon-64', name: '64 x 64', width: 64, height: 64, hint: '应用图标' },
  { id: 'icon-128', name: '128 x 128', width: 128, height: 128, hint: '高清预览' },
  { id: 'icon-256', name: '256 x 256', width: 256, height: 256, hint: '商店上传' },
  { id: 'icon-512', name: '512 x 512', width: 512, height: 512, hint: '主视觉源图' },
]
const defaultIconSizePreset = iconSizePresets[iconSizePresets.length - 1]

const currentModeLabel = computed(() => modeLabels[mode.value])
const modeFlowCopy = computed(() => {
  const flowCopy: Record<GenerationMode, string> = {
    txt2img: '文生图读取正向/反向提示词与风格预设，结合模型、尺寸和批量参数生成多张结果。',
    img2img: '图生图读取参考图、正向提示词与图片强度，保留主体结构并输出新的风格变体。',
    cover: '封面图读取平台尺寸、标题提示词与风格预设，生成适配自媒体平台的封面。',
    icon: 'ICON 读取品牌描述、输出尺寸和背景策略，生成适合应用或网站的图标。',
    '3d': '3D 图读取产品描述、立体感和材质提示，生成具备空间深度的概念图。',
    gif: 'GIF 动图读取提示词、时长和循环动作描述，生成短循环动画结果。',
  }
  return flowCopy[mode.value]
})
const defaultModel = computed(() => store.defaultImageModel)
const selectedModel = computed(() => store.imageModels.find((model) => model.id === selectedModelId.value) ?? defaultModel.value)
const selectedTextModel = computed(() => store.textModels.find((model) => model.id === selectedTextModelId.value) ?? store.primaryTextModel)
type PromptCategoryOption = {
  value: string
  label: string
  icon: unknown
}

function resolvePromptCategoryMeta(category: string): Omit<PromptCategoryOption, 'value'> {
  const map: Record<string, Omit<PromptCategoryOption, 'value'>> = {
    全部: { label: '全部', icon: Grid2x2 },
    封面: { label: '封面', icon: PanelsTopLeft },
    图生图: { label: '图生图', icon: Images },
    ICON: { label: '图标', icon: MonitorSmartphone },
    '3D': { label: '3D', icon: Box },
    GIF: { label: '动图', icon: Sparkles },
    文生图: { label: '文生图', icon: WandSparkles },
    'Use GPT Image2 API': { label: 'GPT 图像 API', icon: Bot },
    'Use GPT Image 2 API': { label: 'GPT 图像 API', icon: Bot },
    'E-commerceCaes': { label: '电商案例', icon: ShoppingBag },
    'E-commerceCases': { label: '电商案例', icon: ShoppingBag },
  }
  return map[category] ?? { label: category || '未分类', icon: Library }
}

const promptCategoryOptions = computed<PromptCategoryOption[]>(() =>
  ['全部', ...Array.from(new Set(store.prompts.map((item) => item.category).filter(Boolean)))].map((value) => ({
    value,
    ...resolvePromptCategoryMeta(value),
  })),
)
const sizePresets = computed<SizePreset[]>(() => (mode.value === 'icon' ? iconSizePresets : aspectPresets))
const minDimension = computed(() => (mode.value === 'icon' ? 16 : 128))
const availableExportFormatOptions = computed(() => getExportFormatOptions(actionTask.value?.mode ?? mode.value))
const availableIcoExportSizes = computed(() => {
  const maxSide = Math.max(16, Math.min(actionAsset.value?.width ?? width.value, actionAsset.value?.height ?? height.value))
  return iconSizePresets.filter((preset) => preset.width <= maxSide)
})
const iconSize = computed({
  get: () => width.value,
  set: (value: number) => {
    const normalized = Math.min(4096, Math.max(16, Math.round(Number(value) || defaultIconSizePreset.width)))
    width.value = normalized
    height.value = normalized
  },
})
const visiblePrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts
    .filter((item) => promptCategory.value === '全部' || item.category === promptCategory.value || item.subCategory === promptCategory.value)
    .filter((item) => !keyword || `${item.title} ${item.prompt} ${item.category}`.toLowerCase().includes(keyword))
    .slice(0, 24)
})
const currentAssets = computed(() => currentTask.value?.assets ?? store.recentTasks[0]?.assets ?? [])
const actionTask = computed(() => currentTask.value ?? store.recentTasks[0])
const actionAsset = computed(() => selectedAsset.value ?? currentAssets.value[0] ?? null)
const modeOptions = computed<Record<string, string | number | boolean>>(() => {
  const options: Record<string, string | number | boolean> = {}
  if (mode.value === 'txt2img') {
    options.creativity = creativity.value
    options.detailLevel = detailLevel.value
  } else if (mode.value === 'img2img') {
    options.imageStrength = imageStrength.value
    options.resizeMode = resizeMode.value
  } else if (mode.value === 'icon') {
    options.background = iconBackground.value
  } else if (mode.value === '3d') {
    options.depthStrength = depthStrength.value
  } else if (mode.value === 'gif') {
    options.durationSeconds = gifDuration.value
  }
  return options
})

watch(prompt, (value) => store.setActivePrompt(value))
watch(() => store.activePrompt, (value) => {
  if (value && value !== prompt.value) prompt.value = value
})
watch(defaultModel, (value) => {
  if (!selectedModelId.value || !store.imageModels.some((model) => model.id === selectedModelId.value)) {
    selectedModelId.value = value?.id ?? ''
  }
})
watch(exportFormat, (value) => {
  if (!exportOpen.value || value !== 'ico') return
  const allowed = new Set(availableIcoExportSizes.value.map((preset) => preset.width))
  const next = selectedIcoExportSizes.value.filter((size) => allowed.has(size))
  selectedIcoExportSizes.value = next.length ? next : availableIcoExportSizes.value.map((preset) => preset.width)
})

function routeString(name: string): string {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

function routeInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = routeString(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function modeOptionInteger(options: RouteModeOptions, name: string, fallback: number, min: number, max: number): number {
  const value = options[name]
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function routeModeOptions(): RouteModeOptions {
  const raw = routeString('modeOptions')
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {}
    return parsed as RouteModeOptions
  } catch {
    return {}
  }
}

function applyRouteModeOptions(options: RouteModeOptions): void {
  creativity.value = modeOptionInteger(options, 'creativity', creativity.value, 0, 100)
  detailLevel.value = modeOptionInteger(options, 'detailLevel', detailLevel.value, 0, 100)
  imageStrength.value = modeOptionInteger(options, 'imageStrength', imageStrength.value, 0, 100)
  depthStrength.value = modeOptionInteger(options, 'depthStrength', depthStrength.value, 0, 100)
  gifDuration.value = modeOptionInteger(options, 'durationSeconds', gifDuration.value, 2, 8)

  const nextResizeMode = options.resizeMode
  if (typeof nextResizeMode === 'string' && resizeModeOptions.includes(nextResizeMode as (typeof resizeModeOptions)[number])) {
    resizeMode.value = nextResizeMode
  }

  const nextBackground = options.background
  if (typeof nextBackground === 'string' && iconBackgroundOptions.includes(nextBackground as (typeof iconBackgroundOptions)[number])) {
    iconBackground.value = nextBackground
  }
}

onMounted(() => {
  selectedModelId.value = defaultModel.value?.id ?? ''
  selectedTextModelId.value = selectedTextModel.value?.id ?? ''
  mode.value = store.resolveMode(routeString('mode') || 'txt2img')
  store.setMode(mode.value)
  const toolId = routeString('tool')
  const selectedTool = toolEntries.find((item) => item.id === toolId)
  const queryPrompt = routeString('prompt')
  if (queryPrompt) prompt.value = queryPrompt
  else if (selectedTool) prompt.value = selectedTool.promptSeed
  else if (store.activePrompt) prompt.value = store.activePrompt

  const queryNegativePrompt = routeString('negativePrompt')
  if (queryNegativePrompt) negativePrompt.value = queryNegativePrompt

  const queryStyle = routeString('style')
  if (queryStyle && stylePresets.includes(queryStyle)) style.value = queryStyle
  else if (selectedTool?.style && stylePresets.includes(selectedTool.style)) style.value = selectedTool.style

  const queryModelId = routeString('modelId')
  if (queryModelId && store.imageModels.some((model) => model.id === queryModelId)) selectedModelId.value = queryModelId
  if (routeString('retryTaskId')) retryNotice.value = '已载入失败任务参数，可重新生成'

  const presetId = routeString('preset') || selectedTool?.preset || ''
  const preset = store.coverPresets.find((item) => item.id === presetId)
  if (preset) {
    width.value = preset.width
    height.value = preset.height
  }

  const routeWidth = routeString('width')
  const routeHeight = routeString('height')
  width.value = routeInteger('width', width.value, 16, 4096)
  height.value = routeInteger('height', height.value, 16, 4096)
  batchSize.value = routeInteger('batchSize', batchSize.value, 1, 4)
  steps.value = routeInteger('steps', steps.value, 1, 80)
  seed.value = routeInteger('seed', seed.value, 0, 999999999)
  applyModeDefaults(mode.value, !routeWidth && !routeHeight)
  applyRouteModeOptions(routeModeOptions())
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('paste', handlePaste)
})

function applyModeDefaults(next: GenerationMode, useDefaultSize = true): void {
  if (next === 'cover') {
    const xhs = store.enabledCoverPresets[0] ?? store.coverPresets[0]
    width.value = xhs.width
    height.value = xhs.height
    return
  }

  if (next === 'icon' && useDefaultSize) {
    width.value = defaultIconSizePreset.width
    height.value = defaultIconSizePreset.height
  }
}

function setMode(next: GenerationMode): void {
  mode.value = next
  store.setMode(next)
  applyModeDefaults(next)
}

function applyAspect(preset: { width: number; height: number }): void {
  width.value = preset.width
  height.value = preset.height
}

function isSizePresetActive(preset: { width: number; height: number }): boolean {
  return width.value === preset.width && height.value === preset.height
}

function applyPrompt(item: PromptItem): void {
  prompt.value = item.prompt
  store.usePrompt(item)
  libraryOpen.value = false
}

function openPromptLibrary(): void {
  promptCategory.value = '全部'
  promptSearch.value = ''
  libraryOpen.value = true
}

async function polishPrompt(): Promise<void> {
  const source = prompt.value.trim()
  if (!source) {
    prompt.value = `高质量${currentModeLabel.value}，主体明确，${style.value}风格，画面层次清晰，细节丰富。`
    store.notify('已生成基础提示词')
    return
  }

  try {
    const result = await store.polishPrompt(
      {
        prompt: source,
        modeLabel: currentModeLabel.value,
        style: style.value,
      },
      selectedTextModelId.value,
    )
    prompt.value = result.prompt
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '润色提示词失败', 'error')
  }
}

function clearPrompt(): void {
  prompt.value = ''
}

function handleShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey) return

  const key = event.key.toLowerCase()
  if (key === 'tab') {
    event.preventDefault()
    setMode(mode.value === 'img2img' ? 'txt2img' : 'img2img')
    return
  }
  if (key === 'enter') {
    event.preventDefault()
    void generate()
    return
  }
  if (key === 'd') {
    event.preventDefault()
    clearPrompt()
    return
  }
  if (event.shiftKey && key === 'r') {
    event.preventDefault()
    polishPrompt()
    return
  }
  if (event.shiftKey && key === 'c') {
    event.preventDefault()
    void copySelectedResult()
    return
  }
  if (key === 'l') {
    event.preventDefault()
    openPromptLibrary()
    return
  }
  if (key === 's') {
    event.preventDefault()
    openExportDialog()
    return
  }
  if (key === 'u') {
    event.preventDefault()
    setMode('img2img')
    openReferencePicker()
  }
}

async function generate(): Promise<void> {
  generating.value = true
  try {
    const task = await store.generate({
      mode: mode.value,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
      modelId: selectedModel.value?.id ?? 'local-preview',
      width: width.value,
      height: height.value,
      batchSize: batchSize.value,
      steps: steps.value,
      seed: seed.value,
      style: style.value,
      referenceImage: referenceImage.value,
      modeOptions: modeOptions.value,
    })
    currentTask.value = task
    selectedAsset.value = task.assets[0] ?? null
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '生成失败', 'error')
  } finally {
    window.setTimeout(() => {
      generating.value = false
    }, 650)
  }
}

function openReferencePicker(): void {
  referenceInput.value?.click()
}

function loadReferenceFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    store.notify('请选择图片文件作为参考图', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    referenceImage.value = String(reader.result)
    store.notify('参考图已加载')
  }
  reader.readAsDataURL(file)
}

function handleReference(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) loadReferenceFile(file)
  input.value = ''
}

function handleReferenceDrop(event: DragEvent): void {
  const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) {
    store.notify('请拖入图片文件作为参考图', 'error')
    return
  }

  setMode('img2img')
  loadReferenceFile(file)
}

function handlePaste(event: ClipboardEvent): void {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  setMode('img2img')
  loadReferenceFile(file)
}

function reuseSelectedAsReference(): void {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  setMode('img2img')
  referenceImage.value = asset.dataUrl
  store.notify('已将结果作为参考图')
}

async function copySelectedResult(): Promise<void> {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }

  const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  if (!writeText) {
    store.notify('当前环境不支持复制结果图', 'error')
    return
  }

  try {
    await writeText(asset.dataUrl)
    store.notify('结果图已复制')
  } catch {
    store.notify('复制结果图失败', 'error')
  }
}

async function downloadSelected(): Promise<void> {
  const asset = actionAsset.value
  if (!asset) {
    store.notify('请先选择结果', 'error')
    return
  }
  if (exportFormat.value === 'ico' && !selectedIcoExportSizes.value.length) {
    store.notify('请至少勾选一个 ICO 导出尺寸', 'error')
    return
  }
  await store.downloadAsset(
    asset,
    exportFormat.value,
    exportScale.value,
    actionTask.value ?? undefined,
    exportFormat.value === 'ico' ? { iconSizes: selectedIcoExportSizes.value } : undefined,
  )
  exportOpen.value = false
}

function openExportDialog(): void {
  if (!actionAsset.value) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  const options = availableExportFormatOptions.value
  exportFormat.value = options.some((option) => option.value === store.settings.defaultExportFormat)
    ? store.settings.defaultExportFormat
    : options[0]?.value ?? 'png'
  exportScale.value = 1
  selectedIcoExportSizes.value = availableIcoExportSizes.value.map((preset) => preset.width)
  exportOpen.value = true
}

async function chooseWorkspaceExportDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.saveSettings({ defaultOutputDir: directory })
  store.notify(`已选择导出目录：${directory}`)
}
</script>

<template>
  <div class="page-full workspace-page">
    <section class="workspace-grid">
      <aside class="workspace-pane">
        <div class="block">
          <div class="title-row">
            <strong>选择任务</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="mode-grid">
            <button
              v-for="(label, key) in modeLabels"
              :key="key"
              class="select-card mode-card"
              :class="{ active: mode === key }"
              type="button"
              @click="setMode(key as GenerationMode)"
            >
              <span>{{ label }}</span>
              <small>{{ modeDescriptions[key as GenerationMode] }}</small>
            </button>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>正向提示词</strong>
            <span>{{ prompt.length }} 字</span>
          </div>
          <button class="prompt-preview" type="button" @click="promptModalOpen = true">
            {{ prompt || '点击打开大编辑器，输入主题、构图、风格、镜头、颜色和平台用途。' }}
          </button>
          <p v-if="retryNotice" class="retry-notice">{{ retryNotice }}</p>
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="promptModalOpen = true">编辑</button>
            <button class="btn-soft" type="button" @click="openPromptLibrary">
              <Library :size="15" />
              词库
            </button>
            <button class="btn-soft" type="button" @click="polishPrompt">
              <Sparkles :size="15" />
              润色
            </button>
            <button class="btn-soft" type="button" @click="clearPrompt">
              <RotateCcw :size="15" />
              清空
            </button>
          </div>
          <div class="field">
            <label>反向提示词</label>
            <textarea v-model="negativePrompt" rows="3" />
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>参考素材</strong>
            <span>{{ mode === 'img2img' ? '必填建议' : '可选' }}</span>
          </div>
          <label class="upload-box" @dragover.prevent @drop.prevent="handleReferenceDrop">
            <Upload :size="18" />
            <span>{{ referenceImage ? '参考图已载入，点击替换' : '上传参考图或拖入素材' }}</span>
            <input ref="referenceInput" type="file" accept="image/*" hidden @change="handleReference" />
          </label>
          <img v-if="referenceImage" class="reference-preview" :src="referenceImage" alt="参考图预览" />
        </div>

        <div class="block">
          <div class="title-row">
            <strong>风格预设</strong>
            <span>可切换</span>
          </div>
          <div class="chip-grid">
            <button v-for="item in stylePresets" :key="item" class="chip-button" :class="{ active: style === item }" type="button" @click="style = item">
              {{ item }}
            </button>
          </div>
        </div>
      </aside>

      <section class="workspace-center">
        <div class="flow-row">
          <span class="active">1 输入</span>
          <span>2 参数</span>
          <span :class="{ active: generating }">3 生成</span>
          <span :class="{ active: selectedAsset }">4 导出</span>
        </div>

        <div class="result-card">
          <div class="result-head">
            <div>
              <h1>生成结果预览</h1>
              <p class="muted">本地预览模型会生成 SVG 占位结果；配置真实模型后由 Rust/Tauri 命令接管。</p>
            </div>
            <span class="chip accent">{{ currentAssets.length || batchSize }} 个结果</span>
          </div>
          <div class="stage">
            <div v-if="generating" class="generating">
              <div class="shimmer" />
              <strong>正在调用生成流程...</strong>
              <p class="muted">校验提示词、组合参数并写入历史</p>
            </div>
            <div v-else-if="currentAssets.length" class="samples">
              <button
                v-for="asset in currentAssets"
                :key="asset.id"
                class="sample"
                :class="{ selected: selectedAsset?.id === asset.id }"
                type="button"
                @click="selectedAsset = asset"
              >
                <img :src="asset.dataUrl" :alt="asset.title" />
                <span>{{ asset.title }}</span>
              </button>
            </div>
            <div v-else class="empty-stage">
              <WandSparkles :size="42" />
              <strong>准备生成</strong>
              <p>输入提示词后点击“生成新结果”。</p>
            </div>
          </div>
          <div class="result-foot">
            <div>
              <strong>{{ selectedAsset ? `已选择：${selectedAsset.title}` : '尚未选择结果' }}</strong>
              <p class="muted">{{ width }} x {{ height }} · {{ style }} · {{ selectedModel?.name }}</p>
            </div>
            <div class="btn-row">
              <button class="btn-soft" type="button" @click="copySelectedResult">
                <Copy :size="15" />
                复制结果图
              </button>
              <button class="btn-soft" type="button" @click="reuseSelectedAsReference">作为参考图</button>
              <button class="btn-primary" type="button" @click="openExportDialog">
                <Download :size="15" />
                导出
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside class="workspace-pane">
        <div class="block">
          <div class="title-row">
            <strong>参数与导出</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="field">
            <label for="workspace-image-model">图像模型</label>
            <select id="workspace-image-model" v-model="selectedModelId">
              <option v-for="model in store.imageModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
            </select>
          </div>
          <div class="field">
            <label for="workspace-text-model">文本润色模型</label>
            <select id="workspace-text-model" v-model="selectedTextModelId">
              <option v-for="model in store.textModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model || '未配置模型 ID' }}</option>
            </select>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>输出尺寸</strong>
            <span>{{ width }} x {{ height }}</span>
          </div>
          <div v-if="mode === 'icon'" class="icon-size-grid">
            <button
              v-for="preset in sizePresets"
              :key="preset.id"
              class="icon-size-card"
              :class="{ active: isSizePresetActive(preset) }"
              type="button"
              @click="applyAspect(preset)"
            >
              <strong>{{ preset.name }}</strong>
              <small>{{ preset.hint }}</small>
            </button>
          </div>
          <div v-else class="chip-grid">
            <button
              v-for="preset in sizePresets"
              :key="preset.id"
              class="chip-button"
              :class="{ active: isSizePresetActive(preset) }"
              type="button"
              @click="applyAspect(preset)"
            >
              {{ preset.name }}
            </button>
          </div>
          <div v-if="mode === 'icon'" class="field">
            <label for="workspace-icon-size">图标边长</label>
            <input id="workspace-icon-size" v-model.number="iconSize" type="number" :min="minDimension" max="4096" step="16" />
            <p class="field-note">图标模式固定输出为正方形，输入边长后会同步更新宽高。</p>
          </div>
          <div v-else class="param-two">
            <div class="field">
              <label for="workspace-width">宽度</label>
              <input id="workspace-width" v-model.number="width" type="number" :min="minDimension" max="4096" />
            </div>
            <div class="field">
              <label for="workspace-height">高度</label>
              <input id="workspace-height" v-model.number="height" type="number" :min="minDimension" max="4096" />
            </div>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>生成控制</strong>
            <span>本地保存</span>
          </div>
          <div class="range-row"><span>批量</span><input v-model.number="batchSize" type="range" min="1" max="4" /><b>{{ batchSize }}</b></div>
          <div class="range-row"><span>步数</span><input v-model.number="steps" type="range" min="1" max="80" /><b>{{ steps }}</b></div>
          <div class="field">
            <label>Seed</label>
            <input v-model.number="seed" type="number" />
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>模式专属</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <template v-if="mode === 'txt2img'">
            <div class="range-row"><label for="workspace-creativity">创意度</label><input id="workspace-creativity" v-model.number="creativity" type="range" min="0" max="100" /><b>{{ creativity }}</b></div>
            <div class="range-row"><label for="workspace-detail-level">细节</label><input id="workspace-detail-level" v-model.number="detailLevel" type="range" min="0" max="100" /><b>{{ detailLevel }}</b></div>
          </template>
          <template v-else-if="mode === 'img2img'">
            <div class="range-row"><label for="workspace-image-strength">图片强度</label><input id="workspace-image-strength" v-model.number="imageStrength" type="range" min="0" max="100" /><b>{{ imageStrength }}</b></div>
            <div class="field">
              <label for="workspace-resize-mode">Resize Mode</label>
              <select id="workspace-resize-mode" v-model="resizeMode">
                <option value="just-resize">Just resize</option>
                <option value="crop-resize">Crop and resize</option>
                <option value="resize-fill">Resize and fill</option>
              </select>
            </div>
          </template>
          <template v-else-if="mode === 'icon'">
            <div class="chip-grid">
              <button class="chip-button" :class="{ active: iconBackground === 'transparent' }" type="button" @click="iconBackground = 'transparent'">透明底</button>
              <button class="chip-button" :class="{ active: iconBackground === 'rounded' }" type="button" @click="iconBackground = 'rounded'">圆角底</button>
              <button class="chip-button" :class="{ active: iconBackground === 'solid' }" type="button" @click="iconBackground = 'solid'">纯色底</button>
            </div>
          </template>
          <template v-else-if="mode === '3d'">
            <div class="range-row"><label for="workspace-depth-strength">立体感</label><input id="workspace-depth-strength" v-model.number="depthStrength" type="range" min="0" max="100" /><b>{{ depthStrength }}</b></div>
          </template>
          <template v-else-if="mode === 'gif'">
            <div class="range-row"><label for="workspace-gif-duration">时长</label><input id="workspace-gif-duration" v-model.number="gifDuration" type="range" min="2" max="8" /><b>{{ gifDuration }}s</b></div>
          </template>
          <template v-else>
            <p class="muted">封面图使用输出尺寸和风格预设控制平台效果。</p>
          </template>
        </div>

        <div class="block mode-flow-block">
          <div class="title-row">
            <strong>数据流说明</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <p class="muted">{{ modeFlowCopy }}</p>
        </div>

        <button class="generate-btn btn-primary" type="button" @click="generate">
          <WandSparkles :size="17" />
          生成新结果
        </button>
      </aside>
    </section>

    <div v-if="promptModalOpen" class="modal-overlay" @click.self="promptModalOpen = false">
      <div class="modal prompt-modal">
        <div class="modal-head">
          <div>
            <h2>编辑正向提示词</h2>
            <p class="muted">推荐结构：主体 + 场景 + 风格 + 构图 + 色彩 + 用途。</p>
          </div>
          <button class="btn-icon" type="button" @click="promptModalOpen = false">×</button>
        </div>
        <div class="modal-body prompt-modal-body">
          <textarea v-model="prompt" class="prompt-editor" rows="12" placeholder="输入更完整的正向提示词" />
        </div>
        <div class="modal-foot">
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="openPromptLibrary">从词库选择</button>
            <button class="btn-soft" type="button" @click="polishPrompt">AI 润色</button>
            <button class="btn-soft" type="button" @click="clearPrompt">清空</button>
          </div>
          <button class="btn-primary" type="button" @click="promptModalOpen = false">应用到工作台</button>
        </div>
      </div>
    </div>

    <div v-if="libraryOpen" class="modal-overlay" @click.self="libraryOpen = false">
      <div class="modal library-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-library-title">
        <div class="modal-head">
          <div>
            <h2 id="prompt-library-title">提示词库</h2>
            <p class="muted">选择提示词，一键应用到当前工作台。</p>
          </div>
          <button class="btn-icon" type="button" @click="libraryOpen = false">×</button>
        </div>
        <div class="modal-body library-modal-body">
          <div class="library-grid">
            <aside class="library-categories" aria-label="提示词分类">
              <button
                v-for="category in promptCategoryOptions"
                :key="category.value"
                class="category-button"
                :class="{ active: promptCategory === category.value }"
                type="button"
                @click="promptCategory = category.value"
              >
                <component :is="category.icon" :size="15" aria-hidden="true" />
                <span class="category-label">{{ category.label }}</span>
              </button>
            </aside>
            <main class="library-main">
              <div class="library-toolbar">
                <input v-model="promptSearch" class="library-search" placeholder="搜索提示词" />
              </div>
              <div class="prompt-list">
                <article v-for="item in visiblePrompts" :key="item.id" class="prompt-item">
                  <div class="prompt-item-copy">
                    <div class="inline"><strong>{{ item.title }}</strong><span class="chip">{{ item.source }}</span><span class="chip accent">{{ resolvePromptCategoryMeta(item.category).label }}</span></div>
                    <p>{{ item.prompt }}</p>
                  </div>
                  <button class="btn-primary btn-sm prompt-item-action" type="button" @click="applyPrompt(item)">使用</button>
                </article>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>

    <div v-if="exportOpen" class="modal-overlay" @click.self="exportOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>导出结果</h2>
            <p class="muted">浏览器预览会保存到下载目录；桌面版会使用设置中的默认输出目录。</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="workspace-export-dir">导出目录</label>
            <div class="directory-picker">
              <input id="workspace-export-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseWorkspaceExportDir">
                <FolderOpen :size="16" />
                重新选择目录
              </button>
            </div>
          </div>
          <div class="field">
            <label for="workspace-export-format">格式</label>
            <select id="workspace-export-format" v-model="exportFormat">
              <option v-for="option in availableExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <p v-if="exportFormat === 'ico'" class="muted">ICO 会按 16 / 32 / 48 / 64 / 128 / 256 / 512 多尺寸打包，并自动跳过超过当前源图尺寸的规格。</p>
          <div v-if="exportFormat === 'ico'" class="field">
            <label>导出尺寸</label>
            <div class="ico-size-checks">
              <label v-for="preset in availableIcoExportSizes" :key="preset.id" class="ico-size-check">
                <input
                  :aria-label="`ICO 尺寸 ${preset.name}`"
                  :value="preset.width"
                  v-model="selectedIcoExportSizes"
                  type="checkbox"
                />
                <span>{{ preset.name }}</span>
              </label>
            </div>
          </div>
          <div v-if="exportFormat !== 'ico'" class="field">
            <label for="workspace-export-scale">倍率</label>
            <select id="workspace-export-scale" v-model.number="exportScale">
              <option :value="1">1x 原尺寸</option>
              <option :value="2">2x 高清</option>
              <option :value="4">4x 超清</option>
            </select>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-primary" type="button" @click="downloadSelected">导出图片</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  padding: 0;
  min-height: calc(100vh - var(--titlebar-h) - var(--shell-nav-h) - var(--app-topbar-h));
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(280px, 296px) minmax(0, 1fr) minmax(280px, 296px);
  min-height: inherit;
  align-items: start;
}

.workspace-pane {
  background: rgba(255, 255, 255, .045);
  min-width: 0;
  overflow: visible;
  backdrop-filter: blur(18px);
}

.workspace-pane:first-child {
  border-right: 1px solid var(--border);
}

.workspace-pane:last-child {
  border-left: 1px solid var(--border);
}

.block {
  padding: 16px;
  border-bottom: 1px solid var(--border-soft);
  display: grid;
  gap: 12px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.title-row strong {
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 14px;
}

.mode-grid,
.chip-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.select-card,
.chip-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, .045);
  color: var(--fg-2);
}

.mode-card {
  min-height: 74px;
  display: grid;
  place-items: center;
  padding: 8px;
  text-align: center;
}

.mode-card small {
  display: none;
}

.select-card.active,
.chip-button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.prompt-preview {
  min-height: 128px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg);
  color: var(--fg-2);
  text-align: left;
  line-height: 1.6;
}

.retry-notice {
  margin-top: -4px;
  color: var(--accent);
  font-size: 12px;
}

.upload-box {
  min-height: 92px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  gap: 8px;
  color: var(--muted);
  cursor: pointer;
}

.reference-preview {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.mode-flow-block p {
  line-height: 1.65;
}

.chip-button {
  min-height: 36px;
  padding: 7px;
}

.icon-size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.icon-size-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  text-align: left;
}

.icon-size-card strong {
  font-size: 13px;
  font-weight: 700;
}

.icon-size-card small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.icon-size-card.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.field-note {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.ico-size-checks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ico-size-check {
  min-height: 38px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.035);
  color: var(--fg-2);
}

.ico-size-check input[type="checkbox"] {
  flex: 0 0 auto;
}

.workspace-center {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  align-content: start;
}

.flow-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.flow-row span {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--surface);
  color: var(--fg-2);
}

.flow-row .active {
  color: var(--accent);
  border-color: var(--accent);
}

.result-card {
  margin: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--elev-raised);
  overflow: hidden;
  min-height: clamp(520px, 62vh, 760px);
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.result-head,
.result-foot {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.result-head {
  border-bottom: 1px solid var(--border-soft);
}

.stage {
  min-height: 430px;
  display: grid;
  place-items: center;
  padding: 18px;
  background: radial-gradient(circle at 20% 10%, rgba(87, 166, 255, .14), transparent 30%), rgba(255, 255, 255, .025);
}

.samples {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.sample {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
  text-align: left;
}

.sample.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--border-glow);
}

.sample img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.sample span {
  display: block;
  padding: 10px 12px;
  font-weight: 650;
}

.generating,
.empty-stage {
  display: grid;
  place-items: center;
  gap: 12px;
  text-align: center;
  color: var(--fg-2);
}

.shimmer {
  width: min(540px, 70vw);
  height: 300px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: linear-gradient(110deg, var(--surface-2), var(--surface), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}

@keyframes shimmer {
  to {
    background-position-x: -200%;
  }
}

.result-foot {
  border-top: 1px solid var(--border-soft);
}

.param-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.range-row {
  display: grid;
  grid-template-columns: 64px 1fr 36px;
  gap: 10px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}

.generate-btn {
  margin: 16px;
  width: calc(100% - 32px);
}

.prompt-modal {
  width: min(840px, 96vw);
}

.prompt-modal-body {
  padding: 18px 20px 20px;
}

.prompt-editor {
  min-height: clamp(280px, 48vh, 520px);
  padding: 14px 16px;
  line-height: 1.7;
  border-radius: 14px;
  resize: none;
  background: rgba(7, 11, 20, 0.72);
}

.library-modal {
  width: min(1120px, 96vw);
}

.library-modal-body {
  overflow: hidden;
}

.prompt-list {
  display: grid;
  gap: 10px;
  align-content: start;
}

.library-grid {
  display: grid;
  grid-template-columns: minmax(208px, 248px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.library-categories {
  display: grid;
  align-content: start;
  gap: 8px;
}

.category-button {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 10px;
  color: var(--fg-2);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}

.category-button :deep(svg) {
  flex: 0 0 auto;
  margin-top: 1px;
}

.category-label {
  min-width: 0;
}

.category-button.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.library-main {
  min-width: 0;
  display: grid;
  gap: 10px;
  align-content: start;
}

.library-toolbar {
  display: flex;
  align-items: center;
}

.library-search {
  width: min(100%, 360px) !important;
  min-height: 40px;
}

.prompt-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(6, 10, 18, .38);
}

.prompt-item-copy {
  min-width: 0;
}

.prompt-item p {
  margin-top: 6px;
  color: var(--fg-2);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-height: 1.5;
}

.prompt-item-action {
  min-width: 56px;
  align-self: start;
  white-space: nowrap;
}

@media (max-width: 1260px) {
  .workspace-grid {
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  }

  .workspace-pane:last-child {
    display: block;
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--border);
  }

  .workspace-center {
    min-height: auto;
  }
}

@media (max-width: 1040px) {
  .result-head,
  .result-foot {
    align-items: flex-start;
    flex-direction: column;
  }

  .samples {
    grid-template-columns: 1fr;
  }

  .icon-size-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ico-size-checks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .library-categories {
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }
}

@media (max-width: 820px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .flow-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .result-card {
    margin: 16px;
    min-height: 440px;
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .icon-size-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ico-size-checks {
    grid-template-columns: 1fr;
  }

  .prompt-modal,
  .library-modal {
    width: min(96vw, 720px);
  }

  .prompt-editor {
    min-height: 240px;
  }

  .library-search {
    width: 100% !important;
  }

  .library-categories {
    display: flex;
    overflow-x: auto;
    grid-template-columns: none;
  }

  .category-button {
    white-space: nowrap;
    width: auto;
    min-width: max-content;
    align-items: center;
    overflow-wrap: normal;
  }
}
</style>
