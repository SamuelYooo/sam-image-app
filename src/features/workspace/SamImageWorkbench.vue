<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPromptMarketTemplateJson } from '../../data/promptMarketTemplate'
import {
  canDownloadAsset,
  canPreviewAsset,
  resolveAssetPreviewSrc,
  resolveReferenceImagePreviewSrc,
  useAssetStore,
  type CreativeAsset,
} from '../../stores/assetStore'
import { MODEL_PROVIDER_OPTIONS, useModelStore, type ModelCapability } from '../../stores/modelStore'
import { promptSourceOptions, promptUseCaseOptions, usePromptMarketStore } from '../../stores/promptMarketStore'
import { useStoryboardStore, type StoryboardShot } from '../../stores/storyboardStore'
import { normalizeGenerationImageCount, useTaskStore, type GenerationTask } from '../../stores/taskStore'
import { useWorkspaceStore, type ReferenceImageInput } from '../../stores/workspaceStore'
import type { PromptAsset } from '../../utils/promptMarket'
import { formatBeijingDateTime } from '../../utils/time'
import {
  CUSTOM_IMAGE_SIZE_VALUE,
  SELF_MEDIA_IMAGE_SIZE_OPTIONS,
  STANDARD_IMAGE_SIZE_OPTIONS,
  createImageSizeSelection,
  normalizeCustomImageSize,
} from './imageSizePresets'

type WorkflowId = 'daily' | 'img2img' | 'icon' | 'storyboard' | 'batch' | 'compare'
type RecentPanelTab = 'drafts' | 'assets'
type WorkspaceModalKind = 'promptEditor' | 'promptMarket' | 'taskDetail' | 'assetDetail' | 'modelConfig'

interface WorkflowOption {
  id: WorkflowId
  label: string
  description: string
  icon: string
  color: string
}

interface ConversationSummary {
  id: string
  workflowId: WorkflowId
  mode: string
  title: string
  prompt: string
  negativePrompt?: string
  imageSize?: string
  time: string
  color: string
}

interface CompareResultGroup {
  id: string
  prompt: string
  createdAt: string
  tasks: GenerationTask[]
}

interface PolishPromptResponse {
  polishedPrompt: string
}

const workflowOptions: WorkflowOption[] = [
  {
    id: 'daily',
    label: '日常生图',
    description: '文生图、负向提示词、尺寸与种子',
    icon: 'i-mdi-auto-fix',
    color: '#26735d',
  },
  {
    id: 'img2img',
    label: '图生图',
    description: '参考图、局部修改与风格迁移',
    icon: 'i-mdi-image-sync-outline',
    color: '#2563eb',
  },
  {
    id: 'icon',
    label: 'ICON 图标',
    description: '图标母图、多尺寸导出',
    icon: 'i-mdi-shape-outline',
    color: '#a66321',
  },
  {
    id: 'storyboard',
    label: '电影分镜',
    description: '角色、场景、镜头与 PDF 分镜稿',
    icon: 'i-mdi-filmstrip-box-multiple',
    color: '#7c3aed',
  },
  {
    id: 'batch',
    label: '批量生成',
    description: '多行提示词队列与失败重试',
    icon: 'i-mdi-playlist-plus',
    color: '#b4444a',
  },
  {
    id: 'compare',
    label: '多模型对比',
    description: '同一提示词并排比较',
    icon: 'i-mdi-compare-horizontal',
    color: '#0f766e',
  },
]
const ICON_GENERATION_SIZE = '1024x1024'
const ICON_EXPORT_SIZE_OPTIONS = [16, 32, 64, 128, 256, 512] as const
const providerOptions = MODEL_PROVIDER_OPTIONS

const conversations: ConversationSummary[] = [
  {
    id: 'draft-01',
    workflowId: 'daily',
    mode: '日常生图',
    title: '雾面玻璃咖啡馆',
    prompt: '清晨街角的现代咖啡馆，雾面玻璃，暖色室内灯光，写实摄影',
    negativePrompt: '低清晰度，畸变文字，过曝，水印',
    imageSize: '1024x1024',
    time: '09:42',
    color: '#d8efe8',
  },
  {
    id: 'draft-02',
    workflowId: 'icon',
    mode: 'ICON',
    title: '天气应用图标',
    prompt: '圆角方形图标，蓝色天空，白色云朵，清晰立体，高级应用商店风格',
    negativePrompt: '模糊边缘，复杂背景，低对比度，文字错误',
    imageSize: '1024x1024',
    time: '昨天',
    color: '#dbeafe',
  },
  {
    id: 'draft-03',
    workflowId: 'storyboard',
    mode: '分镜',
    title: '雨夜追逐场景',
    prompt: '霓虹城市雨夜，主角穿过狭窄巷道，低机位追踪镜头',
    negativePrompt: '角色不一致，过度模糊，低清晰度，画面断裂',
    imageSize: '1536x1024',
    time: '周二',
    color: '#ede9fe',
  },
]

const activeWorkflow = ref<WorkflowId>('daily')
const negativePrompt = ref('低清晰度，畸变文字，过曝，水印')
const selectedImageSizePreset = ref('1024x1024')
const customImageWidth = ref<number | null>(1024)
const customImageHeight = ref<number | null>(1024)
const quality = ref('high')
const imageCount = ref(1)
const seed = ref('')
const storyboardProjectName = ref('未命名分镜项目')
const storyboardStyleHint = ref('电影感分镜，角色一致，镜头语言清晰')
const storyboardShotCount = ref(6)
const selectedCompareModels = ref<string[]>([])
const selectedStoryboardShotIds = ref<string[]>([])
const selectedConversationId = ref(conversations[0]?.id ?? '')
const activeRecentPanelTab = ref<RecentPanelTab>('drafts')
const referenceImageInput = ref<HTMLInputElement | null>(null)
const isPromptMarketOpen = ref(false)
const isPromptEditorOpen = ref(false)
const promptEditorText = ref('')
const originalPromptText = ref('')
const promptEditorMessage = ref('')
const isPolishingPrompt = ref(false)
const modelOptionSearch = ref('')
const promptImportFileInput = ref<HTMLInputElement | null>(null)
const promptImportMessage = ref('')
const workspaceMessage = ref('')
const selectedAsset = ref<CreativeAsset | null>(null)
const selectedTaskId = ref<string | null>(null)
const modelStore = useModelStore()
const promptMarketStore = usePromptMarketStore()
const taskStore = useTaskStore()
const workspaceStore = useWorkspaceStore()
const assetStore = useAssetStore()
const storyboardStore = useStoryboardStore()
const {
  isLoadingProfiles,
  lastError,
  isModelConfigOpen,
  activeModelCapability,
  modelProfiles,
  activeCapabilityProfiles,
  modelDrafts,
  modelOptions,
  modelHealthResults,
  endpointCheckMessages,
  isCheckingModelEndpoint,
  isCheckingModelHealth,
  isFetchingModelOptions,
  lastModelFetchMessage,
  lastModelHealthMessage,
  hasTextModel,
  hasImageModel,
  textModelStatus,
  imageModelStatus,
  activeModelTitle,
  activeModelHint,
} = storeToRefs(modelStore)
const {
  openModelConfig: openModelConfigPanel,
  fetchModelOptions,
  saveModelProfile,
  saveAndSetDefaultModelProfile,
  clearModelProfile,
  createNewModelProfile,
  editModelProfile,
  checkModelEndpointConnectivity,
  checkModelHealth,
} = modelStore
const {
  sourceFilter: promptSourceFilter,
  useCaseFilter: promptUseCaseFilter,
  searchQuery: promptSearchQuery,
  filteredPromptAssets,
  isLoadingPrompts,
  isSyncingPrompts,
  lastImportError: promptImportError,
  lastSyncMessage,
} = storeToRefs(promptMarketStore)
const { setSourceFilter, setUseCaseFilter, markPromptUsed } = promptMarketStore
const { generationTasks, isLoadingTasks, lastTaskError } = storeToRefs(taskStore)
const { promptText, referenceImages } = storeToRefs(workspaceStore)
const { currentDraft, isGeneratingDraft, isExportingPdf, lastStoryboardError } = storeToRefs(storyboardStore)
const { creativeAssets, filteredCreativeAssets } = storeToRefs(assetStore)

const activeWorkflowMeta = computed(
  () => workflowOptions.find(item => item.id === activeWorkflow.value) ?? workflowOptions[0]
)
const isIconWorkflow = computed(() => activeWorkflow.value === 'icon')

function createWorkflowColorStyle(color: string) {
  return { '--sam-workflow-color': color }
}

const imageSize = computed({
  get() {
    if (activeWorkflow.value === 'icon') {
      return ICON_GENERATION_SIZE
    }
    return selectedImageSizePreset.value === CUSTOM_IMAGE_SIZE_VALUE
      ? normalizeCustomImageSize(customImageWidth.value, customImageHeight.value)
      : selectedImageSizePreset.value
  },
  set(value: string) {
    const selection = createImageSizeSelection(value)
    selectedImageSizePreset.value = selection.preset
    customImageWidth.value = selection.customWidth
    customImageHeight.value = selection.customHeight
  },
})
const qualityOptions = [
  { value: 'high', label: '高质量' },
  { value: 'medium', label: '标准' },
  { value: 'low', label: '草稿' },
]
const qualityLabel = computed(() => qualityOptions.find(option => option.value === quality.value)?.label ?? '标准')
const activeConversation = computed(
  () => conversations.find(conversation => conversation.id === selectedConversationId.value) ?? null
)
const activeConversationAssets = computed(() => {
  const conversation = activeConversation.value
  if (!conversation) {
    return filteredCreativeAssets.value
  }
  const prompt = normalizeDraftText(conversation.prompt)
  const exactPromptMatches = filteredCreativeAssets.value.filter(
    asset => normalizeDraftText(asset.promptText) === prompt
  )
  if (exactPromptMatches.length) {
    return exactPromptMatches
  }
  return filteredCreativeAssets.value.filter(asset => asset.workflowId === conversation.workflowId)
})
const visibleCreativeAssets = computed(() => activeConversationAssets.value.slice(0, 4))
const currentCompletedAssets = computed(() => {
  const workflowId = activeWorkflow.value
  return creativeAssets.value
    .filter(asset => asset.workflowId === workflowId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8)
})
const visibleGenerationTasks = computed(() => generationTasks.value.slice(0, 8))
const selectedTask = computed(
  () => generationTasks.value.find(task => task.id === selectedTaskId.value) ?? null
)
const taskAssetLookup = computed(() => {
  const lookup = new Map<string, CreativeAsset[]>()
  for (const asset of creativeAssets.value) {
    if (!asset.sourceTaskId) {
      continue
    }
    lookup.set(asset.sourceTaskId, [...(lookup.get(asset.sourceTaskId) ?? []), asset])
  }
  return lookup
})
const selectedTaskAssets = computed(() => (selectedTask.value ? getTaskLinkedAssets(selectedTask.value) : []))
const selectedTaskReferenceImages = computed(() =>
  selectedTask.value ? getTaskReferenceImages(selectedTask.value) : []
)
const runningTaskCount = computed(() => generationTasks.value.filter(task => task.status === 'running').length)
const pendingTaskCount = computed(() => generationTasks.value.filter(task => task.status === 'pending').length)
const succeededTaskCount = computed(() => generationTasks.value.filter(task => task.status === 'succeeded').length)
const compareResultGroups = computed<CompareResultGroup[]>(() => {
  const groups = new Map<string, CompareResultGroup>()
  for (const task of generationTasks.value) {
    if (getTaskInputText(task, 'workflowId') !== 'compare') {
      continue
    }
    const groupId = task.groupId || task.id
    const existing = groups.get(groupId)
    if (existing) {
      existing.tasks.push(task)
      existing.createdAt = existing.createdAt > task.createdAt ? existing.createdAt : task.createdAt
      continue
    }
    groups.set(groupId, {
      id: groupId,
      prompt: getTaskInputText(task, 'promptText'),
      createdAt: task.createdAt,
      tasks: [task],
    })
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      tasks: group.tasks.slice().sort((left, right) => getTaskModel(left).localeCompare(getTaskModel(right))),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 2)
})
const hasPendingGenerationTasks = computed(() =>
  generationTasks.value.some(task => task.taskType === 'image_generation' && task.status === 'pending')
)
const storyboardTotalDuration = computed(() =>
  (currentDraft.value?.shots ?? []).reduce((total, shot) => total + (shot.durationSec ?? 0), 0)
)
const compareModelCandidates = computed(() =>
  Array.from(
    new Set([modelProfiles.value.image.model, ...modelOptions.value.image].map(model => model.trim()).filter(Boolean))
  )
)
const modelsForComparison = computed(() => {
  const selected = selectedCompareModels.value.filter(model => compareModelCandidates.value.includes(model))
  return selected.length ? selected : compareModelCandidates.value.slice(0, 3)
})
const filteredModelOptions = computed(() =>
  filterModelOptions(modelOptions.value[activeModelCapability.value], modelOptionSearch.value)
)
const selectedDetectedModelCount = computed(() => (modelDrafts.value[activeModelCapability.value].model.trim() ? 1 : 0))
const batchPromptLines = computed(() =>
  promptText.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
)
const storyboardTimelineShots = computed(() => currentDraft.value?.shots ?? [])
const selectedStoryboardShots = computed(() => {
  const selectedIds = new Set(selectedStoryboardShotIds.value)
  return storyboardTimelineShots.value.filter(shot => selectedIds.has(shot.id))
})
const storyboardShotsForGeneration = computed(() =>
  selectedStoryboardShots.value.length ? selectedStoryboardShots.value : storyboardTimelineShots.value
)
const allStoryboardShotsSelected = computed(
  () =>
    storyboardTimelineShots.value.length > 0 &&
    storyboardTimelineShots.value.every(shot => selectedStoryboardShotIds.value.includes(shot.id))
)
const referenceImageUris = computed(() => referenceImages.value.map(image => image.uri))
const effectiveImageCount = computed(() => normalizeGenerationImageCount(activeWorkflow.value, imageCount.value))
const promptFieldLabel = computed(() => {
  if (activeWorkflow.value === 'batch') {
    return '批量提示词'
  }
  if (activeWorkflow.value === 'storyboard') {
    return '故事概念 / 镜头提示词'
  }
  return '提示词'
})
const promptFieldPlaceholder = computed(() =>
  activeWorkflow.value === 'batch'
    ? '每行一条提示词，提交后会创建同一任务组并逐条生成。'
    : activeWorkflow.value === 'storyboard'
      ? '输入故事概念，先生成角色、场景和镜头草案；也可以粘贴单个镜头提示词出图。'
      : '描述你想生成的画面，也可以从提示词市场套用。'
)
const generateButtonLabel = computed(() => {
  if (!hasImageModel.value) {
    return '请先配置图像模型'
  }
  if (activeWorkflow.value === 'batch') {
    return `批量生成 ${batchPromptLines.value.length || 0} 条`
  }
  if (activeWorkflow.value === 'compare') {
    return `对比生成 ${modelsForComparison.value.length || 0} 个模型`
  }
  if (activeWorkflow.value === 'icon') {
    return '生成 ICON 母图'
  }
  return '开始生成'
})
const agentStatusText = computed(() =>
  hasImageModel.value ? `已选择图像模型 ${modelProfiles.value.image.model}` : '等待图像模型配置'
)

onMounted(() => {
  void modelStore.loadModelProfiles()
  void promptMarketStore.loadPromptAssets()
  void taskStore.loadGenerationTasks()
  void assetStore.loadAssets()
})

let modelEndpointCheckTimer: ReturnType<typeof setTimeout> | undefined

function watchModelEndpointInputs() {
  return watch(
    () => [
      activeModelCapability.value,
      modelDrafts.value[activeModelCapability.value].baseUrl,
      modelDrafts.value[activeModelCapability.value].apiKey,
    ],
    ([, baseUrl]) => {
      if (modelEndpointCheckTimer) {
        clearTimeout(modelEndpointCheckTimer)
      }
      if (!baseUrl.trim()) {
        return
      }
      modelEndpointCheckTimer = setTimeout(() => {
        void checkModelEndpointConnectivity()
      }, 650)
    }
  )
}

const stopModelEndpointInputWatcher = watchModelEndpointInputs()

onBeforeUnmount(() => {
  stopModelEndpointInputWatcher()
  if (modelEndpointCheckTimer) {
    clearTimeout(modelEndpointCheckTimer)
  }
})

function normalizeDraftText(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

function clearStoryboardWorkspaceState() {
  selectedStoryboardShotIds.value = []
  storyboardStore.clearCurrentDraft()
}

function setActiveWorkflow(workflowId: WorkflowId) {
  if (activeWorkflow.value === workflowId) {
    return
  }
  if (activeWorkflow.value === 'storyboard' && workflowId !== 'storyboard') {
    clearStoryboardWorkspaceState()
  }
  activeWorkflow.value = workflowId
  if (workflowId === 'img2img' || workflowId === 'icon') {
    imageCount.value = 1
  }
  if (workflowId === 'icon') {
    imageSize.value = ICON_GENERATION_SIZE
  }
}

function openConversationDraft(conversation: ConversationSummary) {
  selectedConversationId.value = conversation.id
  setActiveWorkflow(conversation.workflowId)
  workspaceStore.replacePromptText(conversation.prompt)
  negativePrompt.value = conversation.negativePrompt ?? negativePrompt.value
  imageSize.value = conversation.imageSize ?? imageSize.value
  selectedAsset.value = null
  workspaceMessage.value = `已打开草稿：${conversation.title}`
}

function getPromptSourceLabel(source: PromptAsset['source']) {
  return promptSourceOptions.find(item => item.value === source)?.label ?? source
}

function applyPrompt(item: PromptAsset) {
  workspaceStore.replacePromptText(item.content)
  void markPromptUsed(item.id)
}

function insertPrompt(item: PromptAsset) {
  workspaceStore.insertPromptText(item.content)
  void markPromptUsed(item.id)
}

function openPromptMarket() {
  closeWorkspaceModals('promptMarket')
  promptImportMessage.value = ''
  isPromptMarketOpen.value = true
}

function closePromptMarket() {
  closeWorkspaceModals()
}

function triggerPromptImport() {
  promptImportFileInput.value?.click()
}

async function importPromptFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  promptImportMessage.value = ''
  const count = await promptMarketStore.importPromptJsonText(await file.text())
  if (count > 0) {
    promptImportMessage.value = `已导入 ${count} 条提示词`
    setSourceFilter('custom_json')
  }
  input.value = ''
}

function downloadPromptTemplate() {
  const blob = new Blob([createPromptMarketTemplateJson()], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'samimage-prompts-template.json'
  link.click()
  URL.revokeObjectURL(url)
}

function closeModelConfig() {
  isModelConfigOpen.value = false
}

function closeWorkspaceModals(keep: WorkspaceModalKind | null = null) {
  if (keep !== 'promptEditor') {
    isPromptEditorOpen.value = false
    promptEditorMessage.value = ''
  }
  if (keep !== 'promptMarket') {
    isPromptMarketOpen.value = false
    promptImportMessage.value = ''
  }
  if (keep !== 'taskDetail') {
    selectedTaskId.value = null
  }
  if (keep !== 'assetDetail') {
    selectedAsset.value = null
  }
  if (keep !== 'modelConfig') {
    closeModelConfig()
  }
}

function openModelConfig(capability: ModelCapability) {
  closeWorkspaceModals('modelConfig')
  openModelConfigPanel(capability)
}

function filterModelOptions(options: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return options.filter(model => !normalizedQuery || model.toLowerCase().includes(normalizedQuery))
}

function getProviderLabel(provider: string) {
  return providerOptions.find(item => item.value === provider)?.label ?? provider
}

function getActiveModelHealth(model: string) {
  return modelHealthResults.value[activeModelCapability.value][model]
}

function getModelHealthTitle(model: string) {
  const result = getActiveModelHealth(model)
  if (!result) {
    return '未健康检查'
  }
  return `${result.ok ? '检查通过' : '检查失败'}${result.latencyMs ? `，${formatModelHealthLatency(result.latencyMs)}` : ''}：${result.message}`
}

function formatModelHealthLatency(latencyMs: number) {
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(2)}s` : `${latencyMs}ms`
}

function getModelHealthLatencyLabel(model: string) {
  const latencyMs = getActiveModelHealth(model)?.latencyMs
  return typeof latencyMs === 'number' ? formatModelHealthLatency(latencyMs) : ''
}

function selectDetectedModel(model: string) {
  modelDrafts.value[activeModelCapability.value].model = model
}

function clearSelectedModel() {
  modelDrafts.value[activeModelCapability.value].model = ''
}

function useFirstDetectedModel() {
  const firstModel = filteredModelOptions.value[0] ?? modelOptions.value[activeModelCapability.value][0]
  if (firstModel) {
    selectDetectedModel(firstModel)
  }
}

function openPromptEditor() {
  closeWorkspaceModals('promptEditor')
  originalPromptText.value = promptText.value
  promptEditorText.value = promptText.value
  promptEditorMessage.value = ''
  isPromptEditorOpen.value = true
}

function closePromptEditor() {
  closeWorkspaceModals()
}

function confirmPromptEditor() {
  workspaceStore.replacePromptText(promptEditorText.value)
  isPromptEditorOpen.value = false
  promptEditorMessage.value = ''
  workspaceMessage.value = '已更新提示词'
}

function getPromptPolishErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim()
    if (message) {
      return message
    }
  }
  const message = String(error ?? '').trim()
  return message || 'AI 润色失败，请检查文本模型配置'
}

async function polishPromptWithAi() {
  const sourcePrompt = promptEditorText.value.trim()
  if (!sourcePrompt) {
    promptEditorMessage.value = '请先输入提示词'
    return
  }
  if (!hasTextModel.value) {
    promptEditorMessage.value = '请先配置文本模型'
    openModelConfig('text')
    return
  }

  isPolishingPrompt.value = true
  promptEditorMessage.value = ''
  try {
    const result = await invoke<PolishPromptResponse>('polish_prompt', {
      input: {
        prompt: sourcePrompt,
        workflowId: activeWorkflow.value,
        modelProfile: modelProfiles.value.text,
      },
    })
    originalPromptText.value = sourcePrompt
    promptEditorText.value = result.polishedPrompt
    promptEditorMessage.value = '已完成 AI 润色'
  } catch (error) {
    promptEditorMessage.value = getPromptPolishErrorMessage(error)
  } finally {
    isPolishingPrompt.value = false
  }
}

function triggerReferenceImageUpload() {
  referenceImageInput.value?.click()
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
}

async function importReferenceImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []).filter(file => file.type.startsWith('image/'))
  await addReferenceImageFiles(files)
  input.value = ''
}

async function addReferenceImageFiles(files: File[]) {
  if (!files.length) {
    return
  }

  const availableSlots = Math.max(0, 4 - referenceImages.value.length)
  const selectedFiles = files.slice(0, availableSlots)
  const imported = await Promise.all(
    selectedFiles.map(async file => ({
      id: `ref-${Date.now()}-${file.name}`,
      name: file.name,
      uri: await fileToDataUrl(file),
      size: file.size,
    }))
  )
  workspaceStore.addReferenceImages(imported)
  if (activeWorkflow.value === 'daily') {
    setActiveWorkflow('img2img')
  }
  workspaceMessage.value = `已添加 ${imported.length} 张参考图`
}

async function handlePromptPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
  if (!files.length) {
    return
  }
  event.preventDefault()
  await addReferenceImageFiles(files)
}

function removeReferenceImage(id: string) {
  workspaceStore.removeReferenceImage(id)
}

function clearReferenceImages() {
  workspaceStore.clearReferenceImages()
}

function toggleCompareModel(model: string) {
  if (selectedCompareModels.value.includes(model)) {
    selectedCompareModels.value = selectedCompareModels.value.filter(item => item !== model)
    return
  }
  selectedCompareModels.value = [...selectedCompareModels.value, model]
}

function getTaskInputText(task: GenerationTask, key: string) {
  const value = task.input[key]
  return typeof value === 'string' ? value : ''
}

function getTaskModel(task: GenerationTask) {
  return getTaskInputText(task, 'model') || '未记录模型'
}

function getTaskWorkflowLabel(task: GenerationTask) {
  const workflowId = getTaskInputText(task, 'workflowId')
  return workflowOptions.find(workflow => workflow.id === workflowId)?.label ?? '生图任务'
}

function getTaskTitle(task: GenerationTask) {
  const shotId = getTaskInputText(task, 'shotId') ? ` · ${getTaskInputText(task, 'shotId')}` : ''
  return task.taskType === 'image_generation' ? `${getTaskWorkflowLabel(task)}${shotId}` : task.taskType
}

function getTaskStatusLabel(status: GenerationTask['status']) {
  const labels: Record<GenerationTask['status'], string> = {
    pending: '排队中',
    running: '生成中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return labels[status]
}

function getTaskDetail(task: GenerationTask) {
  const prompt = getTaskInputText(task, 'promptText')
  return prompt
}

function getCompareGroupSummary(group: CompareResultGroup) {
  const succeeded = group.tasks.filter(task => task.status === 'succeeded').length
  const running = group.tasks.filter(task => task.status === 'running').length
  const failed = group.tasks.filter(task => task.status === 'failed').length
  return [
    `${group.tasks.length} 个模型`,
    succeeded ? `完成 ${succeeded}` : '',
    running ? `运行 ${running}` : '',
    failed ? `失败 ${failed}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function getTaskOutputAssetIds(task: GenerationTask) {
  const assetIds = task.output.assetIds
  if (Array.isArray(assetIds)) {
    return assetIds.filter((item): item is string => typeof item === 'string')
  }
  return typeof task.output.assetId === 'string' ? [task.output.assetId] : []
}

function getTaskInputNumber(task: GenerationTask, key: string) {
  const value = task.input[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getTaskReferenceImages(task: GenerationTask) {
  const value = task.input.referenceImages
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim()) : []
}

function getTaskReferencePreviewSrc(uri: string) {
  return resolveReferenceImagePreviewSrc({ uri, previewUri: undefined })
}

function getTaskReferenceLabel(uri: string, index: number) {
  if (uri.startsWith('data:image/')) {
    return `参考图 ${index + 1}`
  }
  const fileName = uri.split(/[\\/]/).filter(Boolean).pop()
  return fileName || `参考图 ${index + 1}`
}

function getTaskQualityLabel(task: GenerationTask) {
  const taskQuality = getTaskInputText(task, 'quality')
  return (qualityOptions.find(option => option.value === taskQuality)?.label ?? taskQuality) || '未记录'
}

function getTaskDateTime(value: string | undefined) {
  return value ? formatBeijingDateTime(value) : '未记录'
}

function getTaskDetailRows(task: GenerationTask) {
  const shotId = getTaskInputText(task, 'shotId')
  const compareGroupId = getTaskInputText(task, 'compareGroupId')
  return [
    { label: '任务 ID', value: task.id },
    { label: '任务组', value: task.groupId || compareGroupId || '无' },
    { label: '工作流', value: getTaskWorkflowLabel(task) },
    { label: '模型', value: getTaskModel(task) },
    { label: '尺寸', value: getTaskInputText(task, 'imageSize') || '未记录' },
    { label: '质量', value: getTaskQualityLabel(task) },
    { label: '张数', value: String(getTaskInputNumber(task, 'imageCount') ?? task.progressTotal ?? 1) },
    { label: '种子', value: getTaskInputText(task, 'seed') || '随机' },
    { label: '项目', value: task.projectId || getTaskInputText(task, 'projectId') || '无' },
    { label: '镜头', value: shotId || '无' },
    { label: '创建时间', value: getTaskDateTime(task.createdAt) },
    { label: '开始时间', value: getTaskDateTime(task.startedAt) },
    { label: '结束时间', value: getTaskDateTime(task.finishedAt) },
    { label: '优先级', value: task.priority == null ? '普通' : String(task.priority) },
  ]
}

function getTaskLinkedAssets(task: GenerationTask) {
  const outputAssetIds = new Set(getTaskOutputAssetIds(task))
  const byOutput = creativeAssets.value.filter(asset => outputAssetIds.has(asset.id))
  const byTask = taskAssetLookup.value.get(task.id) ?? []
  const merged = new Map<string, CreativeAsset>()
  for (const asset of [...byOutput, ...byTask]) {
    merged.set(asset.id, asset)
  }
  return Array.from(merged.values())
}

function getTaskPreviewAsset(task: GenerationTask) {
  return getTaskLinkedAssets(task)[0]
}

function openTaskPreviewAsset(task: GenerationTask) {
  const asset = getTaskPreviewAsset(task)
  if (asset) {
    openAssetDetail(asset)
  }
}

function isTaskCardControlTarget(event: Event) {
  return event.target instanceof Element && Boolean(event.target.closest('button, input, label, select, textarea, a'))
}

function openTaskDetailFromCard(event: MouseEvent, task: GenerationTask) {
  if (isTaskCardControlTarget(event)) {
    return
  }
  openTaskDetail(task)
}

function openTaskDetail(task: GenerationTask) {
  closeWorkspaceModals('taskDetail')
  selectedTaskId.value = task.id
}

function closeTaskDetail() {
  closeWorkspaceModals()
}

function canRenderAssetPreview(asset: CreativeAsset | undefined) {
  return canPreviewAsset(asset)
}

function getTaskResultSummary(task: GenerationTask) {
  if (task.status === 'failed') {
    return '生成失败，错误详情已放在下方'
  }
  const linkedAssets = getTaskLinkedAssets(task)
  if (linkedAssets.length) {
    return `已生成 ${linkedAssets.length} 个资产 · ${linkedAssets.map(asset => asset.id).join(', ')}`
  }
  if (task.status === 'succeeded') {
    const assetIds = getTaskOutputAssetIds(task)
    return assetIds.length ? `输出资产 ${assetIds.join(', ')}` : '任务已完成，等待资产刷新'
  }
  return getTaskDetail(task)
}

function getTaskProgress(task: GenerationTask) {
  const total = Math.max(1, task.progressTotal)
  const current = Math.min(Math.max(0, task.progressCurrent), total)
  return Math.round((current / total) * 100)
}

function getTaskTime(task: GenerationTask) {
  return formatBeijingDateTime(task.createdAt)
}

function canCancelTask(task: GenerationTask) {
  return task.status === 'pending' || task.status === 'running'
}

function canRetryTask(task: GenerationTask) {
  return task.status === 'failed' || task.status === 'cancelled'
}

function canRunTask(task: GenerationTask) {
  return task.taskType === 'image_generation' && task.status === 'pending'
}

async function runTask(task: GenerationTask) {
  await taskStore.runGenerationTask(task.id)
  await assetStore.loadAssets()
}

function runPendingTasks() {
  void taskStore.runPendingGenerationTasks().then(() => assetStore.loadAssets())
}

async function cancelTask(task: GenerationTask) {
  await taskStore.cancelGenerationTask(task.id)
}

async function retryTask(task: GenerationTask) {
  await taskStore.retryGenerationTask(task.id)
  if (selectedTaskId.value === task.id) {
    closeTaskDetail()
  }
}

function useStoryboardShotPrompt(shot: StoryboardShot) {
  workspaceStore.replacePromptText(shot.promptText)
  setActiveWorkflow('storyboard')
  workspaceMessage.value = '已套用分镜镜头提示词'
}

function toggleStoryboardShotSelection(shotId: string) {
  if (selectedStoryboardShotIds.value.includes(shotId)) {
    selectedStoryboardShotIds.value = selectedStoryboardShotIds.value.filter(id => id !== shotId)
    return
  }
  selectedStoryboardShotIds.value = [...selectedStoryboardShotIds.value, shotId]
}

function toggleAllStoryboardShots() {
  selectedStoryboardShotIds.value = allStoryboardShotsSelected.value
    ? []
    : storyboardTimelineShots.value.map(shot => shot.id)
}

function moveStoryboardShot(shot: StoryboardShot, direction: -1 | 1) {
  if (!currentDraft.value) {
    return
  }
  const shots = [...currentDraft.value.shots]
  const currentIndex = shots.findIndex(item => item.id === shot.id)
  const nextIndex = currentIndex + direction
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= shots.length) {
    return
  }
  const [item] = shots.splice(currentIndex, 1)
  shots.splice(nextIndex, 0, item)
  selectedStoryboardShotIds.value = selectedStoryboardShotIds.value.filter(id => shots.some(shot => shot.id === id))
  void storyboardStore.reorderStoryboardShots(
    currentDraft.value.project.id,
    shots.map(item => item.id)
  )
}

function saveStoryboardShotTiming(shot: StoryboardShot) {
  void storyboardStore.updateStoryboardShot({
    id: shot.id,
    title: shot.title,
    description: shot.description,
    promptText: shot.promptText,
    framing: shot.framing,
    angle: shot.angle,
    movement: shot.movement,
    durationSec: shot.durationSec,
    transition: shot.transition,
    status: shot.status,
  })
}

async function generateStoryboardImages() {
  if (!currentDraft.value?.shots.length || !storyboardShotsForGeneration.value.length) {
    return
  }
  if (!hasImageModel.value) {
    workspaceMessage.value = '请先配置图像模型'
    openModelConfig('image')
    return
  }

  await taskStore.createBatchImageGenerationTasks({
    workflowId: 'storyboard',
    projectId: currentDraft.value.project.id,
    prompts: storyboardShotsForGeneration.value.map(shot => shot.promptText),
    shotIds: storyboardShotsForGeneration.value.map(shot => shot.id),
    negativePrompt: negativePrompt.value,
    imageSize: imageSize.value,
    quality: quality.value,
    imageCount: 1,
    seed: seed.value,
    model: modelProfiles.value.image.model,
  })
  workspaceMessage.value = `已创建 ${storyboardShotsForGeneration.value.length} 个分镜出图任务`
  await assetStore.loadAssets()
}

async function exportStoryboardPdf() {
  if (!currentDraft.value) {
    return
  }
  const asset = await storyboardStore.exportStoryboardPdf(currentDraft.value.project.id)
  if (asset) {
    await assetStore.loadAssets()
    workspaceMessage.value = '已导出 PDF 分镜稿并写入资产库'
  }
}

function getAssetTitle(asset: CreativeAsset) {
  const labels: Record<CreativeAsset['kind'], string> = {
    image: '生成图片',
    icon: 'ICON 图标',
    storyboard_frame: '分镜帧',
    reference: '参考图',
    pdf: 'PDF 分镜稿',
    zip: 'ZIP 导出',
    json_export: 'JSON 导出',
  }
  return labels[asset.kind]
}

function getAssetWorkflowLabel(asset: CreativeAsset) {
  return asset.workflowId
    ? workflowOptions.find(workflow => workflow.id === asset.workflowId)?.label ?? asset.workflowId
    : '未记录'
}

function getAssetDetail(asset: CreativeAsset) {
  return [asset.modelProfileId, asset.width && asset.height ? `${asset.width}x${asset.height}` : '', asset.promptText]
    .filter(Boolean)
    .join(' · ')
}

function toggleAssetFavorite(asset: CreativeAsset) {
  void assetStore.toggleAssetFavorite(asset.id)
}

function reuseAssetPrompt(asset: CreativeAsset) {
  if (!asset.promptText?.trim()) {
    return
  }
  promptText.value = asset.promptText
  if (asset.negativePrompt?.trim()) {
    negativePrompt.value = asset.negativePrompt
  }
  if (asset.width && asset.height) {
    imageSize.value = `${asset.width}x${asset.height}`
  }
  seed.value = asset.seed ? String(asset.seed) : seed.value
  workspaceMessage.value = '已复用资产提示词'
}

async function copyText(text: string, successMessage: string) {
  if (!text.trim()) {
    return
  }
  try {
    await navigator.clipboard?.writeText(text)
    workspaceMessage.value = successMessage
  } catch {
    workspaceMessage.value = '当前环境不支持复制'
  }
}

function copyPromptText() {
  void copyText(promptText.value, '已复制当前提示词')
}

function openAssetLibrary() {
  if (typeof window === 'undefined') {
    return
  }
  window.location.hash = '#assets'
}

function copyAssetPrompt(asset: CreativeAsset) {
  void copyText(asset.promptText ?? '', '已复制资产提示词')
}

async function downloadAsset(asset: CreativeAsset) {
  if (!canDownloadAsset(asset)) {
    workspaceMessage.value = '这个资产没有可下载的 URI'
    return
  }
  try {
    const savedPath = await assetStore.downloadAssetWithDialog(asset.id)
    workspaceMessage.value = savedPath
      ? `已保存到 ${savedPath}`
      : savedPath === null
        ? '已取消保存'
        : assetStore.lastAssetError || '资产保存失败'
  } catch (error) {
    workspaceMessage.value = error instanceof Error ? error.message : String(error || '资产保存失败')
  }
}

function deleteAsset(asset: CreativeAsset) {
  void assetStore.deleteAsset(asset.id)
  if (selectedAsset.value?.id === asset.id) {
    selectedAsset.value = null
  }
  workspaceMessage.value = '已删除资产记录'
}

async function exportIconPackage(asset: CreativeAsset) {
  const exported = await assetStore.exportIconPackage(asset.id)
  if (exported) {
    workspaceMessage.value = '已导出 ICON 图标包并写入资产库'
    selectedAsset.value = exported
  }
}

function openAssetDetail(asset: CreativeAsset) {
  closeWorkspaceModals('assetDetail')
  selectedAsset.value = asset
}

function closeAssetDetail() {
  closeWorkspaceModals()
}

async function submitGeneration() {
  if (!hasImageModel.value || !promptText.value.trim()) {
    return
  }

  if (activeWorkflow.value === 'batch') {
    await taskStore.createBatchImageGenerationTasks({
      workflowId: activeWorkflow.value,
      prompts: batchPromptLines.value,
      referenceImages: referenceImageUris.value,
      negativePrompt: negativePrompt.value,
      imageSize: imageSize.value,
      quality: quality.value,
      imageCount: effectiveImageCount.value,
      seed: seed.value,
      model: modelProfiles.value.image.model,
    })
    await assetStore.loadAssets()
    return
  }

  if (activeWorkflow.value === 'compare') {
    if (!modelsForComparison.value.length) {
      workspaceMessage.value = '请先检测或填写至少一个图像模型'
      openModelConfig('image')
      return
    }
    await taskStore.createBatchImageGenerationTasks({
      workflowId: 'compare',
      prompts: modelsForComparison.value.map(() => promptText.value.trim()),
      models: modelsForComparison.value,
      referenceImages: referenceImageUris.value,
      negativePrompt: negativePrompt.value,
      imageSize: imageSize.value,
      quality: quality.value,
      imageCount: effectiveImageCount.value,
      seed: seed.value,
      model: modelProfiles.value.image.model,
    })
    workspaceMessage.value = `已创建 ${modelsForComparison.value.length} 个模型对比任务`
    await assetStore.loadAssets()
    return
  }

  await taskStore.createImageGenerationTask({
    workflowId: activeWorkflow.value,
    promptText: promptText.value.trim(),
    referenceImages: referenceImageUris.value,
    negativePrompt: negativePrompt.value,
    imageSize: imageSize.value,
    quality: quality.value,
    imageCount: effectiveImageCount.value,
    seed: seed.value,
    model: modelProfiles.value.image.model,
  })
  await assetStore.loadAssets()
}

async function createStoryboardDraft() {
  if (!promptText.value.trim()) {
    return
  }
  if (!hasTextModel.value) {
    workspaceMessage.value = '请先配置文本模型'
    openModelConfig('text')
    return
  }

  await storyboardStore.createStoryboardDraft({
    concept: promptText.value,
    projectName: storyboardProjectName.value,
    styleHint: storyboardStyleHint.value,
    shotCount: storyboardShotCount.value,
  })
  selectedStoryboardShotIds.value = []
}
</script>

<template>
  <main class="sam-workbench">
    <header class="sam-topbar">
      <div class="sam-topbar-context">
        <span>工作台</span>
        <strong>{{ activeWorkflowMeta.label }}</strong>
      </div>

      <div class="sam-topbar-status">
        <button
          class="sam-model-pill"
          :class="hasTextModel ? 'ready' : 'warning'"
          type="button"
          title="打开文本模型配置"
          @click="openModelConfig('text')"
        >
          <span class="i-mdi-text-box-edit-outline" aria-hidden="true" />
          <span class="sam-model-pill-label">{{ textModelStatus }}</span>
        </button>
        <button
          class="sam-model-pill"
          :class="hasImageModel ? 'ready' : 'danger'"
          type="button"
          title="打开图像模型配置"
          @click="openModelConfig('image')"
        >
          <span class="i-mdi-image-off-outline" aria-hidden="true" />
          <span class="sam-model-pill-label">{{ imageModelStatus }}</span>
        </button>
        <button
          class="sam-icon-button"
          type="button"
          title="提示词市场"
          aria-label="提示词市场"
          @click="openPromptMarket"
        >
          <span class="i-mdi-store-search-outline" aria-hidden="true" />
        </button>
        <button
          class="sam-icon-button"
          type="button"
          title="刷新任务状态"
          aria-label="刷新任务状态"
          @click="taskStore.loadGenerationTasks()"
        >
          <span class="i-mdi-progress-clock" aria-hidden="true" />
        </button>
        <button
          class="sam-icon-button"
          type="button"
          title="打开图像模型配置"
          aria-label="打开图像模型配置"
          @click="openModelConfig('image')"
        >
          <span class="i-mdi-cog-outline" aria-hidden="true" />
        </button>
      </div>
    </header>

    <section class="sam-shell">
      <aside class="sam-sidebar">
        <div class="sam-sidebar-section sam-workflow-sidebar">
          <div class="sam-section-title">
            <span>工作流导航</span>
            <small>{{ workflowOptions.length }}</small>
          </div>
          <div class="sam-workflow-list">
            <button
              v-for="workflow in workflowOptions"
              :key="workflow.id"
              type="button"
              class="sam-workflow-item"
              :class="{ active: activeWorkflow === workflow.id }"
              :style="createWorkflowColorStyle(workflow.color)"
              @click="setActiveWorkflow(workflow.id)"
            >
              <span class="sam-workflow-icon">
                <span :class="workflow.icon" aria-hidden="true" />
              </span>
              <span>
                <strong>{{ workflow.label }}</strong>
                <em>{{ workflow.description }}</em>
              </span>
            </button>
          </div>
        </div>

        <div class="sam-sidebar-section history" aria-label="历史记录">
          <div class="sam-section-title">
            <span>历史记录</span>
            <small>{{ activeRecentPanelTab === 'drafts' ? conversations.length : visibleCreativeAssets.length }}</small>
          </div>
          <div class="sam-recent-tabs" role="tablist" aria-label="最近内容">
            <button
              type="button"
              role="tab"
              :aria-selected="activeRecentPanelTab === 'drafts'"
              :class="{ active: activeRecentPanelTab === 'drafts' }"
              @click="activeRecentPanelTab = 'drafts'"
            >
              最近草稿
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeRecentPanelTab === 'assets'"
              :class="{ active: activeRecentPanelTab === 'assets' }"
              @click="activeRecentPanelTab = 'assets'"
            >
              最近资产
            </button>
          </div>
          <div v-if="activeRecentPanelTab === 'drafts'" class="sam-history-list">
            <button
              v-for="conversation in conversations"
              :key="conversation.id"
              type="button"
              class="sam-history-item compact"
              :class="{ active: selectedConversationId === conversation.id }"
              @click="openConversationDraft(conversation)"
            >
              <span class="sam-history-copy">
                <span class="sam-history-title-row">
                  <strong>{{ conversation.title }}</strong>
                  <small>{{ conversation.time }}</small>
                </span>
                <span class="sam-history-meta">
                  <small>{{ conversation.mode }}</small>
                  <small>{{ conversation.imageSize || imageSize }}</small>
                </span>
                <em class="sam-history-prompt-preview">{{ conversation.prompt }}</em>
              </span>
            </button>
          </div>
          <div v-else class="sam-history-list sam-recent-asset-list">
            <article v-for="asset in visibleCreativeAssets" :key="asset.id" class="sam-recent-asset-item">
              <div class="sam-history-thumb asset">
                <img
                  v-if="canRenderAssetPreview(asset)"
                  :src="resolveAssetPreviewSrc(asset)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span v-else class="i-mdi-image-outline" aria-hidden="true" />
              </div>
              <div class="sam-history-copy">
                <span>
                  <small>{{ getAssetTitle(asset) }}</small>
                  <small>{{ getAssetWorkflowLabel(asset) }}</small>
                </span>
                <strong>{{ getAssetTitle(asset) }}</strong>
                <em>{{ getAssetDetail(asset) || asset.promptText || asset.uri }}</em>
                <div class="sam-recent-asset-actions">
                  <button type="button" @click="openAssetDetail(asset)">详情</button>
                  <button type="button" @click="reuseAssetPrompt(asset)">复用</button>
                  <button type="button" @click="downloadAsset(asset)">下载</button>
                </div>
              </div>
              <button
                type="button"
                class="sam-recent-favorite"
                :title="asset.favorite ? '取消收藏' : '收藏'"
                :aria-label="asset.favorite ? '取消收藏' : '收藏'"
                @click="toggleAssetFavorite(asset)"
              >
                <span :class="asset.favorite ? 'i-mdi-star' : 'i-mdi-star-outline'" aria-hidden="true" />
              </button>
            </article>
            <div v-if="!visibleCreativeAssets.length" class="sam-history-empty">
              <span class="i-mdi-image-search-outline" aria-hidden="true" />
              <p>生成成功后的图片、ICON、分镜帧会显示在这里。</p>
              <button type="button" @click="openAssetLibrary">查看资产库</button>
            </div>
          </div>
        </div>
      </aside>

      <section class="sam-stage">
        <div class="sam-workspace-header">
          <div>
            <span class="sam-eyebrow">{{ activeWorkflowMeta.label }}</span>
            <h2>{{ activeWorkflowMeta.description }}</h2>
          </div>
          <div class="sam-workspace-header-actions">
            <div class="sam-task-metrics">
              <span>并发 {{ runningTaskCount }}/2</span>
              <span>排队 {{ pendingTaskCount }}</span>
              <span>完成 {{ succeededTaskCount }}</span>
              <span>资产 {{ creativeAssets.length }}</span>
            </div>
            <button type="button" class="sam-secondary-action" @click="openAssetLibrary">
              <span class="i-mdi-folder-open-outline" aria-hidden="true" />
              资产库
            </button>
          </div>
        </div>

        <div class="sam-conversation">
          <section class="sam-draft-board" aria-label="当前草稿">
            <div class="sam-draft-prompt-card">
              <header>
                <span class="i-mdi-text-box-edit-outline" aria-hidden="true" />
                <strong>当前提示词</strong>
                <button class="sam-mini-action" type="button" title="复制提示词" @click="copyPromptText">
                  <span class="i-mdi-content-copy" aria-hidden="true" />
                  复制
                </button>
              </header>
              <p>{{ promptText }}</p>
            </div>

            <div class="sam-draft-status-card">
              <div class="sam-agent">
                <span class="sam-agent-icon">
                  <span class="i-mdi-sparkles" aria-hidden="true" />
                </span>
                <div>
                  <strong>SamImage 工作台</strong>
                  <span>{{ agentStatusText }}</span>
                </div>
              </div>
              <div class="sam-turn-tags">
                <span>{{ activeWorkflowMeta.label }}</span>
                <span>{{ imageSize }}</span>
                <span>质量 {{ qualityLabel }}</span>
                <span>{{ effectiveImageCount }} 张</span>
              </div>
            </div>
          </section>

          <div class="sam-system-turn">
            <section v-if="currentCompletedAssets.length" class="sam-current-works" aria-label="当前已完成作品">
              <header>
                <div>
                  <strong>当前已完成作品</strong>
                  <p>{{ activeWorkflowMeta.label }} 最近完成的 {{ currentCompletedAssets.length }} 个结果</p>
                </div>
                <button type="button" @click="openAssetLibrary">查看资产库</button>
              </header>
              <div class="sam-current-work-list">
                <button
                  v-for="asset in currentCompletedAssets"
                  :key="asset.id"
                  type="button"
                  class="sam-current-work-card"
                  @click="openAssetDetail(asset)"
                >
                  <span class="sam-current-work-preview">
                    <img
                      v-if="canRenderAssetPreview(asset)"
                      :src="resolveAssetPreviewSrc(asset)"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span v-else class="i-mdi-image-outline" aria-hidden="true" />
                  </span>
                  <span class="sam-current-work-meta">
                    <strong>{{ getAssetTitle(asset) }}</strong>
                    <small>{{ getAssetDetail(asset) || asset.promptText || asset.uri }}</small>
                  </span>
                </button>
              </div>
            </section>

            <section v-if="activeWorkflow === 'compare' && compareResultGroups.length" class="sam-compare-results">
              <article v-for="group in compareResultGroups" :key="group.id" class="sam-compare-result-group">
                <header>
                  <div>
                    <strong>模型对比批次</strong>
                    <p>{{ group.prompt || '未记录提示词' }}</p>
                  </div>
                  <span>{{ getCompareGroupSummary(group) }}</span>
                </header>
                <div class="sam-compare-result-list">
                  <button
                    v-for="task in group.tasks"
                    :key="task.id"
                    type="button"
                    class="sam-compare-result-card"
                    :class="`status-${task.status}`"
                    @click="openTaskPreviewAsset(task)"
                  >
                    <span class="sam-compare-result-preview">
                      <img
                        v-if="canRenderAssetPreview(getTaskPreviewAsset(task))"
                        :src="resolveAssetPreviewSrc(getTaskPreviewAsset(task))"
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span
                        v-else
                        :class="task.status === 'failed' ? 'i-mdi-alert-circle-outline' : 'i-mdi-image-sparkle-outline'"
                        aria-hidden="true"
                      />
                    </span>
                    <span class="sam-compare-result-meta">
                      <strong>{{ getTaskModel(task) }}</strong>
                      <em class="sam-task-status" :class="`status-${task.status}`">{{
                        getTaskStatusLabel(task.status)
                      }}</em>
                      <small>{{ getTaskResultSummary(task) }}</small>
                    </span>
                  </button>
                </div>
              </article>
            </section>
            <section v-if="activeWorkflow === 'storyboard' && currentDraft" class="sam-storyboard-draft">
              <header>
                <div>
                  <strong>{{ currentDraft.project.name }}</strong>
                  <p>{{ currentDraft.project.description }}</p>
                </div>
                <div class="sam-storyboard-header-actions">
                  <span>{{ currentDraft.shots.length }} 镜头</span>
                  <span>已选 {{ selectedStoryboardShotIds.length }}</span>
                  <button type="button" @click="toggleAllStoryboardShots">
                    {{ allStoryboardShotsSelected ? '取消全选' : '全选镜头' }}
                  </button>
                  <button type="button" :disabled="isLoadingTasks" @click="generateStoryboardImages">
                    {{ selectedStoryboardShotIds.length ? '批量出图已选' : '批量出图全部' }}
                  </button>
                  <button type="button" :disabled="isExportingPdf" @click="exportStoryboardPdf">
                    {{ isExportingPdf ? '导出中' : '导出 PDF' }}
                  </button>
                </div>
              </header>
              <div class="sam-storyboard-meta">
                <span>角色 {{ currentDraft.characters.length }}</span>
                <span>场景 {{ currentDraft.scenes.length }}</span>
                <span>总时长 {{ storyboardTotalDuration }}s</span>
                <span>{{ currentDraft.project.settings.draftProvider }}</span>
              </div>
              <div class="sam-storyboard-shot-list">
                <article
                  v-for="shot in storyboardTimelineShots"
                  :key="shot.id"
                  :class="{ selected: selectedStoryboardShotIds.includes(shot.id) }"
                >
                  <label class="sam-shot-select">
                    <input
                      type="checkbox"
                      :checked="selectedStoryboardShotIds.includes(shot.id)"
                      :aria-label="`选择镜头 ${shot.orderIndex + 1}`"
                      @change="toggleStoryboardShotSelection(shot.id)"
                    />
                    <small>#{{ shot.orderIndex + 1 }} · {{ shot.framing }} · {{ shot.movement }}</small>
                  </label>
                  <input
                    v-model="shot.title"
                    class="sam-shot-title-input"
                    aria-label="镜头标题"
                    @change="saveStoryboardShotTiming(shot)"
                  />
                  <textarea
                    v-model="shot.description"
                    class="sam-shot-description-input"
                    aria-label="镜头描述"
                    rows="2"
                    @change="saveStoryboardShotTiming(shot)"
                  />
                  <textarea
                    v-model="shot.promptText"
                    class="sam-shot-prompt-input"
                    aria-label="镜头提示词"
                    rows="3"
                    @change="saveStoryboardShotTiming(shot)"
                  />
                  <div class="sam-shot-timeline-row">
                    <button type="button" :disabled="shot.orderIndex === 0" @click="moveStoryboardShot(shot, -1)">
                      上移
                    </button>
                    <button
                      type="button"
                      :disabled="shot.orderIndex >= currentDraft.shots.length - 1"
                      @click="moveStoryboardShot(shot, 1)"
                    >
                      下移
                    </button>
                    <label>
                      <span>时长</span>
                      <input
                        v-model.number="shot.durationSec"
                        min="1"
                        max="120"
                        type="number"
                        @change="saveStoryboardShotTiming(shot)"
                      />
                    </label>
                    <label>
                      <span>转场</span>
                      <select v-model="shot.transition" @change="saveStoryboardShotTiming(shot)">
                        <option value="cut">硬切</option>
                        <option value="fade in">淡入</option>
                        <option value="dissolve">叠化</option>
                        <option value="match cut">匹配剪辑</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" @click="useStoryboardShotPrompt(shot)">套用镜头提示词</button>
                </article>
              </div>
            </section>
            <p v-if="workspaceMessage" class="sam-workspace-message">{{ workspaceMessage }}</p>
            <p v-if="lastStoryboardError" class="sam-config-error">{{ lastStoryboardError }}</p>
          </div>
        </div>

        <section class="sam-composer" aria-label="生成输入区">
          <div class="sam-mode-row">
            <div class="sam-composer-mode-summary" :style="createWorkflowColorStyle(activeWorkflowMeta.color)">
              <span
                :class="['sam-composer-workflow-icon', activeWorkflowMeta.icon]"
                :style="createWorkflowColorStyle(activeWorkflowMeta.color)"
                aria-hidden="true"
              />
              <div>
                <strong>{{ activeWorkflowMeta.label }}</strong>
                <small>{{ activeWorkflowMeta.description }}</small>
              </div>
            </div>
            <div class="sam-control-strip" :class="{ 'icon-mode': isIconWorkflow }">
              <template v-if="isIconWorkflow">
                <div class="sam-icon-fixed-size">
                  <span>母图尺寸</span>
                  <strong>{{ ICON_GENERATION_SIZE }}</strong>
                  <small>固定生成单张高清母图</small>
                </div>
                <div class="sam-icon-export-sizes">
                  <span>导出规格</span>
                  <div>
                    <em v-for="size in ICON_EXPORT_SIZE_OPTIONS" :key="size">{{ size }}x{{ size }}</em>
                  </div>
                </div>
              </template>
              <template v-else>
                <label>
                  <span>尺寸</span>
                  <select v-model="selectedImageSizePreset" class="sam-size-preset-select">
                    <optgroup label="常用生图">
                      <option v-for="option in STANDARD_IMAGE_SIZE_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </optgroup>
                    <optgroup label="国内自媒体">
                      <option v-for="option in SELF_MEDIA_IMAGE_SIZE_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </optgroup>
                    <option :value="CUSTOM_IMAGE_SIZE_VALUE">自定义尺寸</option>
                  </select>
                </label>
                <div v-if="selectedImageSizePreset === CUSTOM_IMAGE_SIZE_VALUE" class="sam-custom-size-controls">
                  <label class="sam-custom-size-field">
                    <span>宽</span>
                    <input
                      v-model.number="customImageWidth"
                      class="sam-custom-size-input"
                      min="64"
                      max="4096"
                      step="1"
                      type="number"
                    />
                  </label>
                  <label class="sam-custom-size-field">
                    <span>高</span>
                    <input
                      v-model.number="customImageHeight"
                      class="sam-custom-size-input"
                      min="64"
                      max="4096"
                      step="1"
                      type="number"
                    />
                  </label>
                </div>
              </template>
              <label>
                <span>质量</span>
                <select v-model="quality">
                  <option v-for="option in qualityOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label>
                <span>张数</span>
                <input
                  v-model.number="imageCount"
                  :disabled="activeWorkflow === 'img2img' || activeWorkflow === 'icon'"
                  min="1"
                  max="8"
                  type="number"
                />
              </label>
            </div>
          </div>

          <div class="sam-reference-strip">
            <input
              ref="referenceImageInput"
              class="sam-hidden-input"
              type="file"
              accept="image/*"
              multiple
              @change="importReferenceImages"
            />
            <button
              class="sam-reference-add"
              type="button"
              :disabled="referenceImages.length >= 4"
              @click="triggerReferenceImageUpload"
            >
              <span class="i-mdi-image-plus-outline" aria-hidden="true" />
              {{ referenceImages.length ? `参考图 ${referenceImages.length}/4` : '上传参考图' }}
            </button>
            <button
              v-if="referenceImages.length"
              class="sam-reference-clear"
              type="button"
              @click="clearReferenceImages"
            >
              清空
            </button>
            <span>可粘贴图片到提示词输入区，图生图会自动切换工作流。</span>
          </div>
          <div v-if="referenceImages.length" class="sam-reference-preview-list">
            <article v-for="image in referenceImages" :key="image.id">
              <img :src="resolveReferenceImagePreviewSrc(image)" alt="" loading="lazy" decoding="async" />
              <div>
                <strong>{{ image.name }}</strong>
                <span>{{ Math.max(1, Math.round(image.size / 1024)) }} KB</span>
              </div>
              <button type="button" :aria-label="`移除参考图 ${image.name}`" @click="removeReferenceImage(image.id)">
                <span class="i-mdi-close" aria-hidden="true" />
              </button>
            </article>
          </div>

          <div v-if="activeWorkflow === 'compare'" class="sam-compare-models">
            <header>
              <div>
                <strong>对比模型</strong>
                <span>从图像模型配置检测到的真实模型列表中选择，默认取前 3 个。</span>
              </div>
              <button type="button" @click="openModelConfig('image')">管理模型</button>
            </header>
            <div v-if="compareModelCandidates.length" class="sam-compare-model-list">
              <button
                v-for="model in compareModelCandidates"
                :key="model"
                type="button"
                :class="{ active: modelsForComparison.includes(model) }"
                @click="toggleCompareModel(model)"
              >
                {{ model }}
              </button>
            </div>
            <p v-else>请先在图像模型配置中填写模型名称，或点击“检测并获取模型”。</p>
          </div>

          <div v-if="activeWorkflow === 'storyboard'" class="sam-storyboard-controls">
            <label>
              <span>项目名</span>
              <input v-model="storyboardProjectName" placeholder="分镜项目名称" />
            </label>
            <label>
              <span>镜头数</span>
              <input v-model.number="storyboardShotCount" min="3" max="12" type="number" />
            </label>
            <label>
              <span>风格</span>
              <input v-model="storyboardStyleHint" placeholder="电影感、黑色电影、产品广告等风格" />
            </label>
            <button type="button" :disabled="isGeneratingDraft" @click="createStoryboardDraft">
              <span class="i-mdi-script-text-outline" aria-hidden="true" />
              {{ isGeneratingDraft ? '生成草案中' : '一键生成分镜草案' }}
            </button>
          </div>

          <div class="sam-prompt-field">
            <div class="sam-prompt-field-header">
              <span>{{ promptFieldLabel }}</span>
              <button type="button" @click="openPromptEditor">编辑</button>
            </div>
            <button
              class="sam-prompt-preview-button"
              type="button"
              @click="openPromptEditor"
              @paste="handlePromptPaste"
            >
              <span v-if="promptText.trim()">{{ promptText }}</span>
              <em v-else>{{ promptFieldPlaceholder }}</em>
            </button>
            <small v-if="activeWorkflow === 'batch'">当前将创建 {{ batchPromptLines.length }} 条生成任务。</small>
          </div>

          <div class="sam-composer-footer">
            <label class="sam-negative-field">
              <span>负向</span>
              <input v-model="negativePrompt" placeholder="不想出现的内容" />
            </label>
            <label class="sam-seed-field">
              <span>种子</span>
              <input v-model="seed" placeholder="随机" />
            </label>
            <button
              class="sam-generate-button"
              :class="{ generating: isLoadingTasks }"
              type="button"
              :disabled="!hasImageModel || isLoadingTasks"
              @click="submitGeneration"
            >
              <span
                :class="isLoadingTasks ? 'sam-action-spinner i-mdi-loading' : 'i-mdi-arrow-up'"
                aria-hidden="true"
              />
              {{ isLoadingTasks ? '创建任务中' : generateButtonLabel }}
            </button>
          </div>
        </section>
      </section>

      <aside class="sam-inspector">
        <section class="sam-panel sam-prompt-panel">
          <div class="sam-panel-title">
            <span>提示词市场</span>
            <button type="button" @click="openPromptMarket">打开</button>
          </div>
          <div class="sam-filter-pills">
            <button
              v-for="source in promptSourceOptions"
              :key="source.value"
              type="button"
              :class="{ active: promptSourceFilter === source.value }"
              @click="setSourceFilter(source.value)"
            >
              {{ source.label }}
            </button>
          </div>
          <div class="sam-prompt-search">
            <input
              v-model="promptSearchQuery"
              type="search"
              placeholder="搜索提示词、标签、用途"
              @input="promptMarketStore.setSearchQuery(promptSearchQuery)"
            />
            <select v-model="promptUseCaseFilter" @change="setUseCaseFilter(promptUseCaseFilter)">
              <option v-for="useCase in promptUseCaseOptions" :key="useCase.value" :value="useCase.value">
                {{ useCase.label }}
              </option>
            </select>
          </div>
          <div class="sam-prompt-list">
            <article v-for="item in filteredPromptAssets" :key="item.id" class="sam-prompt-card">
              <small>{{ getPromptSourceLabel(item.source) }}</small>
              <strong>{{ item.title }}</strong>
              <p>{{ item.content }}</p>
              <div>
                <button type="button" @click="applyPrompt(item)">套用</button>
                <button type="button" @click="insertPrompt(item)">插入</button>
              </div>
            </article>
          </div>
        </section>

        <section class="sam-panel sam-task-panel">
          <div class="sam-panel-title">
            <span>任务队列</span>
            <div class="sam-panel-title-actions">
              <button type="button" :disabled="!hasPendingGenerationTasks || isLoadingTasks" @click="runPendingTasks">
                继续队列
              </button>
              <button type="button" :disabled="isLoadingTasks" @click="taskStore.loadGenerationTasks()">
                {{ isLoadingTasks ? '刷新中' : '刷新' }}
              </button>
            </div>
          </div>
          <div v-if="lastTaskError" class="sam-queue-empty error">
            <span class="i-mdi-progress-clock" aria-hidden="true" />
            <p>{{ lastTaskError }}</p>
          </div>
          <div v-else-if="visibleGenerationTasks.length" class="sam-task-list">
            <article
              v-for="task in visibleGenerationTasks"
              :key="task.id"
              class="sam-task-item"
              :aria-label="`查看${getTaskTitle(task)}详情`"
              @click="openTaskDetailFromCard($event, task)"
            >
              <header class="sam-task-summary">
                <div>
                  <strong>{{ getTaskTitle(task) }}</strong>
                  <small>{{ getTaskModel(task) }} · {{ getTaskTime(task) }}</small>
                </div>
                <span class="sam-task-status" :class="`status-${task.status}`">
                  {{ getTaskStatusLabel(task.status) }}
                </span>
              </header>
              <p class="sam-task-prompt">{{ getTaskDetail(task) || '等待任务输入' }}</p>
              <p v-if="task.error" class="sam-task-error">{{ task.error }}</p>
              <div class="sam-task-output-badges" aria-label="任务摘要">
                <span>进度 {{ task.progressCurrent }}/{{ task.progressTotal }}</span>
                <span v-if="getTaskOutputAssetIds(task).length">输出 {{ getTaskOutputAssetIds(task).length }}</span>
                <span>{{ getTaskInputText(task, 'imageSize') || '未记录尺寸' }}</span>
              </div>
              <div class="sam-task-progress" role="progressbar" :aria-valuenow="getTaskProgress(task)">
                <span :style="{ width: `${getTaskProgress(task)}%` }" />
              </div>
              <footer class="sam-task-item-footer">
                <span>{{ getTaskProgress(task) }}%</span>
                <div class="sam-task-actions">
                  <button type="button" @click.stop="openTaskDetail(task)">
                    详情
                  </button>
                  <button v-if="canRunTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="runTask(task)">
                    运行
                  </button>
                  <button v-if="canCancelTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="cancelTask(task)">
                    取消
                  </button>
                  <button v-if="canRetryTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="retryTask(task)">
                    重试
                  </button>
                </div>
              </footer>
            </article>
          </div>
          <div v-else class="sam-queue-empty">
            <span class="i-mdi-progress-clock" aria-hidden="true" />
            <p>生成、导入、同步和导出都会进入统一任务系统。</p>
          </div>
        </section>
      </aside>
    </section>

    <Teleport to="body">
      <div v-if="isPromptEditorOpen" class="sam-modal-backdrop" role="presentation" @click.self="closePromptEditor">
        <section
          class="sam-prompt-editor-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="`编辑${promptFieldLabel}`"
          @click.stop
        >
        <header class="sam-model-modal-header">
          <div>
            <span>提示词编辑</span>
            <h2>{{ promptFieldLabel }}</h2>
            <p>{{ promptFieldPlaceholder }}</p>
            <p
              v-if="promptEditorMessage"
              :class="promptEditorMessage === '已完成 AI 润色' ? 'sam-config-success' : 'sam-config-error'"
            >
              {{ promptEditorMessage }}
            </p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closePromptEditor">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-prompt-editor-body">
          <label class="sam-prompt-editor-input">
            <span>润色后提示词</span>
            <textarea
              v-model="promptEditorText"
              class="sam-prompt-editor-textarea"
              :placeholder="promptFieldPlaceholder"
              @paste="handlePromptPaste"
            />
          </label>
          <aside class="sam-original-prompt">
            <span>原提示词</span>
            <p>{{ originalPromptText || '暂无原提示词' }}</p>
          </aside>
        </div>

        <footer class="sam-model-modal-footer sam-prompt-editor-footer">
          <button class="sam-secondary-action" type="button" @click="closePromptEditor">关闭</button>
          <button
            class="sam-secondary-action"
            type="button"
            :disabled="isPolishingPrompt || !promptEditorText.trim()"
            @click="polishPromptWithAi"
          >
            <span class="i-mdi-auto-fix" aria-hidden="true" />
            {{ isPolishingPrompt ? '润色中' : 'AI 润色' }}
          </button>
          <button class="sam-primary-action" type="button" @click="confirmPromptEditor">确认</button>
        </footer>
      </section>
    </div>

      <div v-else-if="isPromptMarketOpen" class="sam-modal-backdrop" role="presentation" @click.self="closePromptMarket">
        <section class="sam-model-modal" role="dialog" aria-modal="true" aria-label="提示词市场" @click.stop>
        <header class="sam-model-modal-header">
          <div>
            <span>提示词市场</span>
            <h2>提示词资产库</h2>
            <p>导入自定义 JSON、下载标准模板，并按来源筛选后套用到当前生图输入框。</p>
            <p v-if="promptImportError" class="sam-config-error">{{ promptImportError }}</p>
            <p v-else-if="promptImportMessage || lastSyncMessage" class="sam-config-success">
              {{ promptImportMessage || lastSyncMessage }}
            </p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closePromptMarket">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-config-tabs">
          <button type="button" @click="triggerPromptImport">
            <span class="i-mdi-file-import-outline" aria-hidden="true" />
            导入 JSON
          </button>
          <button type="button" @click="downloadPromptTemplate">
            <span class="i-mdi-download-outline" aria-hidden="true" />
            下载模板
          </button>
          <button type="button" :disabled="isLoadingPrompts" @click="promptMarketStore.loadPromptAssets()">
            <span class="i-mdi-database-sync-outline" aria-hidden="true" />
            {{ isLoadingPrompts ? '加载中' : '刷新' }}
          </button>
          <button type="button" :disabled="isSyncingPrompts" @click="promptMarketStore.syncPromptSource('glidea')">
            <span class="i-mdi-cloud-download-outline" aria-hidden="true" />
            同步 glidea
          </button>
          <button type="button" :disabled="isSyncingPrompts" @click="promptMarketStore.syncPromptSource('evolink')">
            <span class="i-mdi-cloud-download-outline" aria-hidden="true" />
            同步 EvoLinkAI
          </button>
        </div>
        <input
          ref="promptImportFileInput"
          class="sam-hidden-file"
          type="file"
          accept="application/json,.json"
          @change="importPromptFile"
        />

        <div class="sam-filter-pills modal">
          <button
            v-for="source in promptSourceOptions"
            :key="source.value"
            type="button"
            :class="{ active: promptSourceFilter === source.value }"
            @click="setSourceFilter(source.value)"
          >
            {{ source.label }}
          </button>
        </div>

        <div class="sam-prompt-search modal">
          <input
            v-model="promptSearchQuery"
            type="search"
            placeholder="搜索标题、内容、标签、用途"
            @input="promptMarketStore.setSearchQuery(promptSearchQuery)"
          />
          <select v-model="promptUseCaseFilter" @change="setUseCaseFilter(promptUseCaseFilter)">
            <option v-for="useCase in promptUseCaseOptions" :key="useCase.value" :value="useCase.value">
              {{ useCase.label }}
            </option>
          </select>
        </div>

        <div class="sam-prompt-list modal">
          <article v-for="item in filteredPromptAssets" :key="item.id" class="sam-prompt-card">
            <small>{{ getPromptSourceLabel(item.source) }}</small>
            <strong>{{ item.title }}</strong>
            <p>{{ item.content }}</p>
            <div>
              <button type="button" @click="applyPrompt(item)">套用</button>
              <button type="button" @click="insertPrompt(item)">插入</button>
            </div>
          </article>
        </div>
      </section>
    </div>

      <div
        v-else-if="selectedTask"
        class="sam-modal-backdrop sam-task-detail-backdrop"
        role="presentation"
        @click.self="closeTaskDetail"
      >
        <section class="sam-model-modal sam-task-detail-modal" role="dialog" aria-modal="true" aria-label="任务详情" @click.stop>
        <header class="sam-model-modal-header">
          <div>
            <span>任务详情</span>
            <h2>{{ getTaskTitle(selectedTask) }}</h2>
            <p>{{ getTaskResultSummary(selectedTask) }}</p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closeTaskDetail">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-task-detail-body">
          <section class="sam-task-detail-overview">
            <div>
              <span class="sam-task-status" :class="`status-${selectedTask.status}`">
                {{ getTaskStatusLabel(selectedTask.status) }}
              </span>
              <strong>{{ getTaskProgress(selectedTask) }}%</strong>
              <small>{{ getTaskTime(selectedTask) }}</small>
            </div>
            <div class="sam-task-progress" role="progressbar" :aria-valuenow="getTaskProgress(selectedTask)">
              <span :style="{ width: `${getTaskProgress(selectedTask)}%` }" />
            </div>
          </section>

          <section class="sam-task-detail-section">
            <h3>任务信息</h3>
            <dl class="sam-task-detail-grid">
              <div v-for="row in getTaskDetailRows(selectedTask)" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section class="sam-task-detail-section">
            <h3>提示词</h3>
            <p class="sam-task-detail-text">{{ getTaskInputText(selectedTask, 'promptText') || '无' }}</p>
          </section>

          <section class="sam-task-detail-section">
            <h3>负向提示词</h3>
            <p class="sam-task-detail-text">{{ getTaskInputText(selectedTask, 'negativePrompt') || '无' }}</p>
          </section>

          <section class="sam-task-detail-section">
            <h3>参考图</h3>
            <div v-if="selectedTaskReferenceImages.length" class="sam-task-detail-reference-grid">
              <article v-for="(uri, index) in selectedTaskReferenceImages" :key="`${uri}-${index}`">
                <img
                  v-if="getTaskReferencePreviewSrc(uri)"
                  :src="getTaskReferencePreviewSrc(uri)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span v-else class="i-mdi-image-outline" aria-hidden="true" />
                <small>{{ getTaskReferenceLabel(uri, index) }}</small>
              </article>
            </div>
            <p v-else class="sam-task-detail-empty">没有参考图</p>
          </section>

          <section class="sam-task-detail-section">
            <h3>输出资产</h3>
            <div v-if="selectedTaskAssets.length" class="sam-task-detail-output-grid">
              <article v-for="asset in selectedTaskAssets" :key="asset.id">
                <img
                  v-if="canRenderAssetPreview(asset)"
                  :src="resolveAssetPreviewSrc(asset)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span v-else class="i-mdi-file-outline" aria-hidden="true" />
                <button type="button" @click.stop="openAssetDetail(asset)">{{ getAssetTitle(asset) }}</button>
              </article>
            </div>
            <p v-else-if="getTaskOutputAssetIds(selectedTask).length" class="sam-task-detail-empty">
              输出资产 {{ getTaskOutputAssetIds(selectedTask).join(', ') }}
            </p>
            <p v-else class="sam-task-detail-empty">暂未产生输出资产</p>
          </section>

          <section v-if="selectedTask.error" class="sam-task-detail-section error">
            <h3>错误信息</h3>
            <p class="sam-task-detail-text">{{ selectedTask.error }}</p>
          </section>
        </div>

        <footer class="sam-model-modal-footer">
          <button v-if="canRunTask(selectedTask)" class="sam-secondary-action" type="button" @click="runTask(selectedTask)">
            运行
          </button>
          <button
            v-if="canCancelTask(selectedTask)"
            class="sam-secondary-action"
            type="button"
            @click="cancelTask(selectedTask)"
          >
            取消任务
          </button>
          <button
            v-if="canRetryTask(selectedTask)"
            class="sam-secondary-action"
            type="button"
            @click="retryTask(selectedTask)"
          >
            重试任务
          </button>
          <button class="sam-primary-action" type="button" @click="closeTaskDetail">关闭</button>
        </footer>
      </section>
    </div>

      <div v-else-if="selectedAsset" class="sam-modal-backdrop" role="presentation" @click.self="closeAssetDetail">
        <section class="sam-model-modal asset-detail" role="dialog" aria-modal="true" aria-label="资产详情" @click.stop>
        <header class="sam-model-modal-header">
          <div>
            <span>资产详情</span>
            <h2>{{ getAssetTitle(selectedAsset) }}</h2>
            <p>{{ selectedAsset.promptText || selectedAsset.uri }}</p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closeAssetDetail">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-asset-detail-body">
          <div class="sam-asset-detail-preview">
            <img
              v-if="canRenderAssetPreview(selectedAsset)"
              :src="resolveAssetPreviewSrc(selectedAsset)"
              alt=""
              decoding="async"
            />
            <span v-else class="i-mdi-image-outline" aria-hidden="true" />
          </div>
          <dl>
            <div>
              <dt>提示词</dt>
              <dd>{{ selectedAsset.promptText || '无' }}</dd>
            </div>
            <div>
              <dt>负向提示词</dt>
              <dd>{{ selectedAsset.negativePrompt || '无' }}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{{ selectedAsset.modelProfileId || '未记录' }}</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>
                {{
                  selectedAsset.width && selectedAsset.height
                    ? `${selectedAsset.width}x${selectedAsset.height}`
                    : '未记录'
                }}
              </dd>
            </div>
            <div>
              <dt>种子</dt>
              <dd>{{ selectedAsset.seed ?? '随机' }}</dd>
            </div>
            <div>
              <dt>工作流</dt>
              <dd>{{ getAssetWorkflowLabel(selectedAsset) }}</dd>
            </div>
          </dl>
        </div>

        <footer class="sam-model-modal-footer sam-asset-detail-footer">
          <button class="sam-secondary-action" type="button" @click="reuseAssetPrompt(selectedAsset)">
            复用提示词
          </button>
          <button class="sam-secondary-action" type="button" @click="downloadAsset(selectedAsset)">下载原图</button>
          <button class="sam-secondary-action" type="button" @click="copyAssetPrompt(selectedAsset)">复制提示词</button>
          <button
            v-if="selectedAsset.kind === 'icon'"
            class="sam-secondary-action"
            type="button"
            @click="exportIconPackage(selectedAsset)"
          >
            导出 ICON 包
          </button>
          <button class="sam-secondary-action" type="button" @click="toggleAssetFavorite(selectedAsset)">
            {{ selectedAsset.favorite ? '取消收藏' : '收藏' }}
          </button>
          <button class="sam-primary-action" type="button" @click="deleteAsset(selectedAsset)">删除记录</button>
        </footer>
      </section>
    </div>

      <div v-else-if="isModelConfigOpen" class="sam-modal-backdrop" role="presentation" @click.self="closeWorkspaceModals()">
      <section
        class="sam-model-modal sam-channel-editor"
        role="dialog"
        aria-modal="true"
        :aria-label="activeModelTitle"
        @click.stop
      >
        <header class="sam-channel-editor-header">
          <div>
            <div class="sam-channel-title-row">
              <h2>编辑渠道</h2>
              <span
                v-if="endpointCheckMessages[activeModelCapability]"
                class="sam-channel-status-pill"
                :class="{ checking: isCheckingModelEndpoint[activeModelCapability] }"
              >
                {{ endpointCheckMessages[activeModelCapability] }}
              </span>
            </div>
            <p>{{ activeModelHint }}</p>
            <p v-if="lastError" class="sam-config-error">{{ lastError }}</p>
            <p v-else-if="lastModelFetchMessage" class="sam-config-success">{{ lastModelFetchMessage }}</p>
            <p v-else-if="lastModelHealthMessage" class="sam-config-success">{{ lastModelHealthMessage }}</p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closeWorkspaceModals()">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-channel-editor-body">
          <div class="sam-channel-tabs">
            <button type="button" :class="{ active: activeModelCapability === 'text' }" @click="openModelConfig('text')">
              文本模型配置
            </button>
            <button
              type="button"
              :class="{ active: activeModelCapability === 'image' }"
              @click="openModelConfig('image')"
            >
              图像模型配置
            </button>
            <button type="button" @click="createNewModelProfile(activeModelCapability)">
              <span class="i-mdi-plus" aria-hidden="true" />
              继续配置新模型
            </button>
          </div>

          <div class="sam-channel-form-grid">
            <label>
              <span>渠道名称</span>
              <input v-model="modelDrafts[activeModelCapability].name" placeholder="例如：anyrouter-自用" />
            </label>
            <label>
              <span>API 类型</span>
              <select v-model="modelDrafts[activeModelCapability].provider">
                <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                  {{ provider.label }}
                </option>
              </select>
            </label>
            <label>
              <span>接口基础地址</span>
              <div class="sam-channel-input-with-badge">
                <input v-model="modelDrafts[activeModelCapability].baseUrl" placeholder="https://api.example.com/v1" />
                <em v-if="endpointCheckMessages[activeModelCapability]">
                  {{ isCheckingModelEndpoint[activeModelCapability] ? '检测中' : '连通' }}
                </em>
              </div>
              <small class="sam-channel-field-hint">接口连通后会显示检测状态</small>
            </label>
            <label>
              <span>API 密钥</span>
              <input
                v-model="modelDrafts[activeModelCapability].apiKey"
                type="password"
                :placeholder="modelDrafts[activeModelCapability].hasApiKey ? '已保存，留空则继续使用' : '按服务要求填写'"
              />
            </label>
            <label>
              <span>{{ activeModelCapability === 'text' ? '对话接口路径' : '图像接口路径' }}</span>
              <input
                v-if="activeModelCapability === 'text'"
                v-model="modelDrafts[activeModelCapability].chatEndpoint"
                placeholder="/v1/chat/completions"
              />
              <input
                v-else
                v-model="modelDrafts[activeModelCapability].imageEndpoint"
                placeholder="/v1/images/generations"
              />
            </label>
            <label>
              <span>模型列表路径</span>
              <input v-model="modelDrafts[activeModelCapability].modelsEndpoint" placeholder="/v1/models" />
            </label>
          </div>

          <section class="sam-channel-profile-strip" aria-label="已保存渠道">
            <button
              v-for="profile in activeCapabilityProfiles"
              :key="profile.id"
              type="button"
              :class="{ active: modelDrafts[activeModelCapability].id === profile.id }"
              @click="editModelProfile(profile.capability, profile.id)"
            >
              <strong>{{ profile.name }}</strong>
              <span>{{ profile.model || '未填写模型名称' }}</span>
              <em v-if="profile.isDefault">当前主模型</em>
              <em v-else-if="!profile.enabled">已停用</em>
            </button>
            <p v-if="!activeCapabilityProfiles.length">
              当前还没有{{ activeModelCapability === 'text' ? '文本' : '图像' }}模型配置。
            </p>
          </section>

          <section class="sam-channel-model-list">
            <header>
              <div>
                <strong>模型列表（{{ modelOptions[activeModelCapability].length }}）</strong>
                <span>已选择 {{ selectedDetectedModelCount }} 个</span>
              </div>
              <div class="sam-channel-model-actions">
                <input v-model="modelOptionSearch" type="search" placeholder="搜索模型" />
                <button type="button" :disabled="!filteredModelOptions.length" @click="useFirstDetectedModel">
                  选择首个
                </button>
                <button type="button" :disabled="!modelDrafts[activeModelCapability].model" @click="clearSelectedModel">
                  清空已选
                </button>
                <button
                  class="sam-health-check-button"
                  :class="{ checking: isCheckingModelHealth[activeModelCapability] }"
                  type="button"
                  :disabled="isCheckingModelHealth[activeModelCapability] || !modelOptions[activeModelCapability].length"
                  @click="checkModelHealth()"
                >
                  <span
                    :class="
                      isCheckingModelHealth[activeModelCapability]
                        ? 'sam-action-spinner i-mdi-loading'
                        : 'i-mdi-heart-pulse'
                    "
                    aria-hidden="true"
                  />
                  {{ isCheckingModelHealth[activeModelCapability] ? '检查中' : '健康检查' }}
                </button>
                <button type="button" :disabled="isFetchingModelOptions" @click="fetchModelOptions">
                  <span class="i-mdi-refresh" aria-hidden="true" />
                  {{ isFetchingModelOptions ? '获取中' : '获取模型' }}
                </button>
              </div>
            </header>
            <input
              v-model="modelDrafts[activeModelCapability].model"
              class="sam-channel-model-manual"
              :list="`model-options-list-${activeModelCapability}`"
              placeholder="手动输入或从下方选择模型"
            />
            <datalist :id="`model-options-list-${activeModelCapability}`">
              <option v-for="model in modelOptions[activeModelCapability]" :key="model" :value="model" />
            </datalist>
            <div v-if="filteredModelOptions.length" class="sam-channel-model-grid">
              <button
                v-for="model in filteredModelOptions"
                :key="model"
                type="button"
                :class="{ selected: modelDrafts[activeModelCapability].model === model }"
                @click="selectDetectedModel(model)"
              >
                <span class="sam-channel-model-check" aria-hidden="true" />
                <strong>{{ model }}</strong>
                <span
                  class="sam-channel-health-dot"
                  :class="{
                    ok: getActiveModelHealth(model)?.ok,
                    error: getActiveModelHealth(model) && !getActiveModelHealth(model)?.ok,
                    checking: isCheckingModelHealth[activeModelCapability],
                  }"
                  :title="getModelHealthTitle(model)"
                  aria-hidden="true"
                >
                  <span
                    :class="
                      getActiveModelHealth(model)?.ok
                        ? 'i-mdi-check-circle'
                        : getActiveModelHealth(model)
                          ? 'i-mdi-close-circle'
                          : isCheckingModelHealth[activeModelCapability]
                            ? 'i-mdi-loading'
                            : 'i-mdi-minus'
                    "
                    aria-hidden="true"
                  />
                  <em v-if="getActiveModelHealth(model)?.ok && getModelHealthLatencyLabel(model)">
                    {{ getModelHealthLatencyLabel(model) }}
                  </em>
                </span>
                <em>{{ getProviderLabel(modelDrafts[activeModelCapability].provider) }}</em>
              </button>
            </div>
            <p v-else>还没有可选模型，点击“获取模型”从模型列表接口读取。</p>
          </section>

          <label class="sam-config-toggle sam-channel-toggle">
            <input v-model="modelDrafts[activeModelCapability].enabled" type="checkbox" />
            <span>启用这个{{ activeModelCapability === 'text' ? '文本' : '图像' }}模型配置</span>
          </label>
        </div>

        <footer class="sam-model-modal-footer sam-channel-footer">
          <button class="sam-secondary-action" type="button" @click="clearModelProfile">清空配置</button>
          <button class="sam-secondary-action" type="button" @click="closeWorkspaceModals()">取消</button>
          <button
            class="sam-secondary-action"
            type="button"
            :disabled="isLoadingProfiles"
            @click="saveAndSetDefaultModelProfile"
          >
            设为当前主模型
          </button>
          <button class="sam-primary-action" type="button" :disabled="isLoadingProfiles" @click="saveModelProfile">
            <span class="i-mdi-content-save-outline" aria-hidden="true" />
            {{ isLoadingProfiles ? '保存中' : '保存' }}
          </button>
        </footer>
      </section>
    </div>
    </Teleport>
  </main>
</template>
