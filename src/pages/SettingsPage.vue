<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, FolderOpen, LoaderCircle, Plus, RotateCcw, Save, Star, TestTube2, Trash2, Upload } from 'lucide-vue-next'
import { exportFormatOptions, stylePresets } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/tauri'
import type { ModelCatalogItem, ModelProfile, PromptItem } from '@/types/domain'
import { createId } from '@/domain/ids'

const store = useAppStore()
const router = useRouter()
const activeTab = ref<'models' | 'prompts' | 'generation' | 'system'>('models')
const promptSearch = ref('')
const promptSourceFilter = ref('all')
const promptCategoryFilter = ref('all')
const promptOriginFilter = ref<'all' | 'imported' | 'builtin'>('all')
const promptImportDragging = ref(false)
const modelCatalogOpen = ref(false)
const modelCatalogSearch = ref('')
const selectedCatalogModelId = ref('')
const remoteModelCatalog = ref<ModelCatalogEntry[]>([])
const modelCatalogLoading = ref(false)
const modelCatalogNotice = ref('')
const editingModelId = ref('')
const testingModelIds = ref<Set<string>>(new Set())
const testingAllModels = ref(false)
const coverPresetModalOpen = ref(false)
const coverPresetName = ref('')
const coverPresetWidth = ref(1080)
const coverPresetHeight = ref(608)
const coverPresetEnabled = ref(true)
const draft = ref<ModelProfile>({
  id: '',
  name: '',
  provider: 'openai-compatible',
  endpoint: '',
  apiPath: 'v1/images/generations',
  apiProtocol: 'openai-images',
  apiKey: '',
  apiSecret: '',
  model: '',
  kind: 'image',
  isPrimary: false,
  status: 'untested',
})

type ModelCatalogEntry = ModelCatalogItem & {
  model: string
  provider: 'openai-compatible'
  kind: 'image' | 'text' | 'unknown'
  endpoint: string
  apiPath: string
  apiProtocol: NonNullable<ModelProfile['apiProtocol']>
}

type ProtocolOption = {
  value: NonNullable<ModelProfile['apiProtocol']>
  label: string
  path: string
}

const textProtocolOptions: ProtocolOption[] = [
  { value: 'openai-chat', label: 'OpenAI 通用标准', path: 'v1/chat/completions' },
  { value: 'anthropic-messages', label: 'Anthropic 协议', path: 'v1/messages' },
]
const imageProtocolOptions: ProtocolOption[] = [
  { value: 'openai-images', label: 'OpenAI Images', path: 'v1/images/generations' },
  { value: 'dashscope-wanxiang', label: '阿里云通义万相', path: 'api/v1/services/aigc/multimodal-generation/generation' },
  { value: 'mgtv-storyboard', label: '芒果 AIGC 分镜生图', path: 'openapi/v1/storyboard/generateByPromptV2' },
  { value: 'openai-image-edits', label: 'Images Edits / 自定义编辑', path: 'v1/images/edits' },
  { value: 'multimodal-chat', label: '多模态 Chat', path: 'v1/chat/completions' },
]

const promptSources = computed(() => Array.from(new Set(store.prompts.map((item) => item.source))))
const promptCategories = computed(() => Array.from(new Set(store.prompts.flatMap((item) => [item.category, item.subCategory]).filter(Boolean))))
const filteredPrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts.filter((item) => {
    if (promptOriginFilter.value === 'imported' && item.source === 'builtin') return false
    if (promptOriginFilter.value === 'builtin' && item.source !== 'builtin') return false
    if (promptSourceFilter.value !== 'all' && item.source !== promptSourceFilter.value) return false
    if (promptCategoryFilter.value !== 'all' && item.category !== promptCategoryFilter.value && item.subCategory !== promptCategoryFilter.value) return false
    if (!keyword) return true
    return [
      item.title,
      item.prompt,
      item.promptZh,
      item.promptEn,
      item.source,
      item.category,
      item.subCategory,
      item.author,
      ...item.tags,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})
const enabledCoverPresetCount = computed(() => store.coverPresets.filter((preset) => preset.enabled).length)
const filteredModelCatalog = computed(() => {
  const keyword = modelCatalogSearch.value.trim().toLowerCase()
  return remoteModelCatalog.value
    .filter((item) => item.kind === draft.value.kind || item.kind === 'unknown')
    .filter((item) => !keyword || `${item.name} ${item.model}`.toLowerCase().includes(keyword))
})
const protocolOptions = computed(() => (draft.value.kind === 'text' ? textProtocolOptions : imageProtocolOptions))
const configuredModels = computed(() => [...store.imageModels, ...store.textModels].filter(isConfiguredModel))
const configuredModelCount = computed(() => configuredModels.value.length)

type ModelStatusTone = 'ok' | 'warn' | 'error'

function promptCategoryLabel(category?: string): string {
  const map: Record<string, string> = {
    ICON: '图标',
    'Use GPT Image2 API': 'GPT 图像 API',
    'Use GPT Image 2 API': 'GPT 图像 API',
    'E-commerceCaes': '电商案例',
    'E-commerceCases': '电商案例',
  }
  return map[category ?? ''] ?? category ?? '未分类'
}

function defaultApiPath(kind: ModelCatalogEntry['kind'] | ModelProfile['kind']): string {
  const runtimeKind = kind === 'unknown' ? draft.value.kind : kind
  return runtimeKind === 'text' ? textProtocolOptions[0].path : imageProtocolOptions[0].path
}

function defaultApiProtocol(kind: ModelCatalogEntry['kind'] | ModelProfile['kind']): NonNullable<ModelProfile['apiProtocol']> {
  const runtimeKind = kind === 'unknown' ? draft.value.kind : kind
  return runtimeKind === 'text' ? 'openai-chat' : 'openai-images'
}

function applyProtocol(protocol: NonNullable<ModelProfile['apiProtocol']>): void {
  draft.value.apiProtocol = protocol
  draft.value.apiPath = protocolOptions.value.find((option) => option.value === protocol)?.path ?? draft.value.apiPath ?? ''
  if (protocol === 'mgtv-storyboard') {
    draft.value.endpoint = draft.value.endpoint && !draft.value.endpoint.includes('aigc-llm.mgtv.com')
      ? draft.value.endpoint
      : 'https://aigc.mgtv.com'
    draft.value.model = draft.value.model || '35'
  }
}

function applyDraftKind(kind: ModelProfile['kind']): void {
  draft.value.kind = kind
  applyProtocol(defaultApiProtocol(kind))
}

function apiKeyLabel(model: ModelProfile): string {
  return model.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'API Key'
}

function modelIdLabel(model: ModelProfile): string {
  return model.apiProtocol === 'mgtv-storyboard' ? 'Style ID' : '模型 ID'
}

function modelIdPlaceholder(model: ModelProfile): string {
  if (model.apiProtocol === 'mgtv-storyboard') return '35'
  return model.kind === 'text' ? 'gpt-4o-mini' : 'gpt-image-1'
}

function isModelTesting(id: string): boolean {
  return testingModelIds.value.has(id)
}

function isConfiguredModel(model: ModelProfile): boolean {
  const needsSecret = model.apiProtocol === 'mgtv-storyboard'
  return model.provider !== 'local-preview' && Boolean(model.endpoint.trim() && model.apiKey.trim() && (!needsSecret || model.apiSecret?.trim()) && model.model.trim())
}

async function testModelConnection(id: string): Promise<void> {
  if (isModelTesting(id)) return

  testingModelIds.value = new Set([...testingModelIds.value, id])
  try {
    await store.testModel(id)
  } finally {
    const next = new Set(testingModelIds.value)
    next.delete(id)
    testingModelIds.value = next
  }
}

async function testAllConfiguredModels(): Promise<void> {
  if (testingAllModels.value) return

  const models = configuredModels.value.filter((model) => !isModelTesting(model.id))
  if (!models.length) {
    store.notify('暂无已配置完整的模型可检测', 'info')
    return
  }

  testingAllModels.value = true
  testingModelIds.value = new Set([...testingModelIds.value, ...models.map((model) => model.id)])
  let completed = 0
  try {
    for (const model of models) {
      await store.testModel(model.id)
      completed += 1
    }
    store.notify(`已完成 ${completed} 个模型连接检测`, 'info')
  } finally {
    const next = new Set(testingModelIds.value)
    models.forEach((model) => next.delete(model.id))
    testingModelIds.value = next
    testingAllModels.value = false
  }
}

function newModel(kind: ModelProfile['kind'] = 'image'): void {
  draft.value = {
    id: createId('model'),
    name: kind === 'text' ? 'OpenAI Compatible Text' : 'OpenAI Compatible Image',
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com',
    apiPath: defaultApiPath(kind),
    apiProtocol: defaultApiProtocol(kind),
    apiKey: '',
    apiSecret: '',
    model: kind === 'text' ? 'gpt-4o-mini' : 'gpt-image-1',
    kind,
    isPrimary: false,
    status: 'untested',
  }
  editingModelId.value = draft.value.id
}

function editModel(model: ModelProfile): void {
  draft.value = { ...model }
  editingModelId.value = model.id
}

function removeModelWithConfirmation(model: ModelProfile): void {
  const confirmed = window.confirm(`确定删除模型「${model.name}」？此操作会移除该模型的 API 地址、Key 和连接状态。`)
  if (!confirmed) return

  store.removeModel(model.id)
  if (editingModelId.value === model.id) closeModelEditor()
}

function saveDraft(): void {
  if (!draft.value.name.trim()) {
    store.notify('请输入模型名称', 'error')
    return
  }
  store.saveModel({ ...draft.value })
  closeModelEditor()
}

function closeModelEditor(): void {
  editingModelId.value = ''
}

function isCreatingModel(kind: ModelProfile['kind']): boolean {
  return Boolean(editingModelId.value && draft.value.kind === kind && !store.models.some((model) => model.id === editingModelId.value))
}

async function openModelCatalog(): Promise<void> {
  modelCatalogSearch.value = ''
  selectedCatalogModelId.value = ''
  modelCatalogOpen.value = true
  modelCatalogNotice.value = ''
  remoteModelCatalog.value = []

  modelCatalogLoading.value = true
  try {
    const remoteModels = await store.fetchModelCatalog({ ...draft.value })
    remoteModelCatalog.value = remoteModels.map((item) => ({
      ...item,
      model: item.id,
      provider: 'openai-compatible',
      endpoint: draft.value.endpoint,
      apiPath: defaultApiPath(item.kind),
      apiProtocol: defaultApiProtocol(item.kind),
    }))
    modelCatalogNotice.value = remoteModels.length
      ? `已从模型接口获取 ${remoteModels.length} 个模型`
      : '接口未返回模型，请检查 BASE_URL、API Key 或手动填写模型 ID'
  } catch (error) {
    modelCatalogNotice.value = error instanceof Error ? error.message : '模型列表获取失败'
  } finally {
    modelCatalogLoading.value = false
  }
}

function applyCatalogModel(): void {
  const item = remoteModelCatalog.value.find((model) => model.model === selectedCatalogModelId.value)
  if (!item) {
    store.notify('请选择一个模型', 'error')
    return
  }
  draft.value = {
    ...draft.value,
    name: item.name,
    model: item.model,
    provider: item.provider,
    kind: item.kind === 'unknown' ? draft.value.kind : item.kind,
    endpoint: item.endpoint,
    apiPath: item.apiPath,
    apiProtocol: item.apiProtocol,
    status: 'untested',
  }
  modelCatalogOpen.value = false
  store.notify(`已选择模型：${item.name}`)
}

function importFile(event: Event): void {
  const input = event.target as HTMLInputElement
  importPromptFiles(Array.from(input.files ?? []))
  input.value = ''
}

function importPromptFiles(files: File[]): void {
  if (!files.length) return

  Promise.all(files.map(readPromptFile))
    .then((items) => store.importPromptBatch(items))
    .catch((error: unknown) => {
      store.notify(error instanceof Error ? error.message : '导入 Prompts 失败', 'error')
    })
}

function readPromptFile(file: File): Promise<{ content: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ content: String(reader.result), filename: file.name })
    reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`))
    reader.readAsText(file)
  })
}

function handlePromptDragOver(event: DragEvent): void {
  event.preventDefault()
  promptImportDragging.value = true
}

function handlePromptDragLeave(): void {
  promptImportDragging.value = false
}

function handlePromptDrop(event: DragEvent): void {
  event.preventDefault()
  promptImportDragging.value = false
  importPromptFiles(Array.from(event.dataTransfer?.files ?? []))
}

function exportPrompts(): void {
  const blob = new Blob([JSON.stringify(store.prompts, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'samimage-v3-prompts.json'
  link.click()
  URL.revokeObjectURL(link.href)
  store.notify('Prompts 已导出')
}

async function copyPrompt(item: PromptItem): Promise<void> {
  await navigator.clipboard?.writeText(item.prompt)
  store.notify('提示词已复制')
}

function removePromptWithConfirmation(item: PromptItem): void {
  if (item.source === 'builtin') return
  const confirmed = window.confirm(`确定删除提示词「${item.title}」？此操作不可恢复。`)
  if (!confirmed) return

  store.removePrompt(item.id)
}

function usePromptInWorkspace(item: PromptItem): void {
  store.usePrompt(item)
  void router.push({
    path: '/workspace',
    query: {
      mode: item.category === '封面' ? 'cover' : item.category === 'ICON' ? 'icon' : 'txt2img',
      prompt: item.prompt,
    },
  })
}

function toggleCoverPreset(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  store.setCoverPresetEnabled(id, input.checked)
}

function removeCoverPresetWithConfirmation(preset: { id: string; name: string }): void {
  const confirmed = window.confirm(`确定删除封面预设「${preset.name}」？此操作会移除这个自定义尺寸。`)
  if (!confirmed) return

  store.removeCoverPreset(preset.id)
}

function resetCoverPresetsWithConfirmation(): void {
  const confirmed = window.confirm('确定恢复默认封面预设？此操作会移除所有自定义封面预设，并重置内置预设的启用状态。')
  if (!confirmed) return

  store.resetCoverPresets()
}

async function chooseDefaultOutputDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.saveSettings({ defaultOutputDir: directory })
}

function openCoverPresetModal(): void {
  coverPresetName.value = ''
  coverPresetWidth.value = 1080
  coverPresetHeight.value = 608
  coverPresetEnabled.value = true
  coverPresetModalOpen.value = true
}

function addCoverPresetFromSettings(): void {
  const name = coverPresetName.value.trim()
  if (!name) {
    store.notify('请输入预设名称', 'error')
    return
  }

  const saved = store.addCoverPreset({
    name,
    width: coverPresetWidth.value,
    height: coverPresetHeight.value,
    enabled: coverPresetEnabled.value,
  })
  if (!saved) return

  coverPresetModalOpen.value = false
}

async function resetDemoDataWithConfirmation(): Promise<void> {
  const confirmed = window.confirm('确定恢复初始数据？此操作会清空当前模型、提示词、资产库和自定义封面预设。')
  if (!confirmed) return

  await store.resetDemoData()
}

function modelStatusMeta(model: ModelProfile): { label: string; tone: ModelStatusTone } {
  if (!model.endpoint.trim() || !model.apiKey.trim() || (model.apiProtocol === 'mgtv-storyboard' && !model.apiSecret?.trim()) || !model.model.trim()) return { label: '未配置', tone: 'warn' }
  if (model.status === 'connected') return { label: '已连接', tone: 'ok' }
  if (model.status === 'failed') return { label: '失败', tone: 'error' }
  return { label: '待检测', tone: 'warn' }
}
</script>

<template>
  <div class="page-wide">
    <div class="page-header">
      <div>
        <p class="page-kicker">Settings Center</p>
        <h1 class="page-title">设置</h1>
        <p class="page-desc">配置模型、管理提示词、调整生成参数与系统偏好。</p>
      </div>
      <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">
        <Save :size="16" />
        保存设置
      </button>
    </div>

    <div class="settings-tabs">
      <button class="settings-tab" :class="{ active: activeTab === 'models' }" type="button" @click="activeTab = 'models'">模型配置</button>
      <button class="settings-tab" :class="{ active: activeTab === 'prompts' }" type="button" @click="activeTab = 'prompts'">Prompts 市场</button>
      <button class="settings-tab" :class="{ active: activeTab === 'generation' }" type="button" @click="activeTab = 'generation'">生成参数</button>
      <button class="settings-tab" :class="{ active: activeTab === 'system' }" type="button" @click="activeTab = 'system'">系统设置</button>
    </div>

    <section v-if="activeTab === 'models'" class="settings-section">
      <div class="model-bulk-bar">
        <div>
          <strong>连接检测</strong>
          <p class="muted">一次检测全部已配置模型，包含图像模型和文本模型。</p>
        </div>
        <button
          class="btn-primary model-test-all-button"
          :class="{ loading: testingAllModels }"
          type="button"
          :disabled="testingAllModels || !configuredModelCount"
          :aria-busy="testingAllModels"
          @click="testAllConfiguredModels"
        >
          <LoaderCircle v-if="testingAllModels" class="spin-icon" :size="16" />
          <TestTube2 v-else :size="16" />
          {{ testingAllModels ? '检测全部中' : configuredModelCount ? `检测全部 (${configuredModelCount})` : '暂无可检测' }}
        </button>
      </div>

      <div class="settings-section-block">
        <div class="settings-section-title">
          图像模型
          <span class="count">{{ store.imageModels.length }} 已配置</span>
        </div>
        <div class="stack">
          <article v-for="model in store.imageModels" :key="model.id" class="model-card" data-testid="image-model-card">
            <div class="model-card-head">
              <div class="model-card-heading">
                <h3>
                  <span class="dot" />
                  {{ model.name }}
                </h3>
                <p class="muted">{{ model.endpoint || '未配置 API 地址' }}</p>
              </div>
              <div class="model-card-badges">
                <span v-if="model.isPrimary" class="primary-badge">
                  <Star :size="12" fill="currentColor" />
                  主模型
                </span>
                <button
                  v-else
                  class="set-primary-btn"
                  type="button"
                  @click="store.setPrimaryImageModel(model.id)"
                >
                  设为主模型
                </button>
                <span class="status-pill">
                  <span class="status-dot" :class="{ warn: modelStatusMeta(model).tone === 'warn', error: modelStatusMeta(model).tone === 'error' }" />
                  {{ modelStatusMeta(model).label }}
                </span>
              </div>
            </div>
            <div class="model-card-body">
              <div class="model-fields">
                <div class="field">
                  <label>{{ modelIdLabel(model) }}</label>
                  <div class="field-value">{{ model.model || `未设置${modelIdLabel(model)}` }}</div>
                </div>
                <div class="field">
                  <label>Provider</label>
                  <div class="field-value">{{ model.provider }}</div>
                </div>
                <div class="field">
                  <label>{{ apiKeyLabel(model) }}</label>
                  <div class="field-value">{{ model.apiKey ? '已填写' : '未填写' }}</div>
                </div>
                <div v-if="model.apiProtocol === 'mgtv-storyboard'" class="field">
                  <label>Secret Key</label>
                  <div class="field-value">{{ model.apiSecret ? '已填写' : '未填写' }}</div>
                </div>
              </div>
              <div class="model-actions">
                <div class="btn-row">
                  <button class="btn-soft btn-sm" data-testid="edit-model-button" type="button" @click="editModel(model)">编辑</button>
                  <button
                    class="btn-soft btn-sm model-test-button"
                    :class="{ loading: isModelTesting(model.id) }"
                    type="button"
                    :disabled="isModelTesting(model.id)"
                    :aria-busy="isModelTesting(model.id)"
                    @click="testModelConnection(model.id)"
                  >
                    <LoaderCircle v-if="isModelTesting(model.id)" class="spin-icon" :size="14" />
                    <TestTube2 v-else :size="14" />
                    {{ isModelTesting(model.id) ? '检测中' : '检测连接' }}
                  </button>
                  <button class="btn-danger btn-sm" type="button" @click="removeModelWithConfirmation(model)">删除</button>
                </div>
              </div>
            </div>
            <div v-if="editingModelId === model.id" class="editor-card inline-editor" data-testid="model-editor">
              <div class="inline-editor-head">
                <h3>编辑 {{ model.name }}</h3>
                <button class="btn-soft btn-sm" type="button" @click="closeModelEditor">取消</button>
              </div>
              <div class="grid grid-2">
                <div class="field"><label for="model-draft-name">模型名称</label><input id="model-draft-name" v-model="draft.name" /></div>
                <div class="field"><label for="model-draft-kind">类型</label><select id="model-draft-kind" v-model="draft.kind" @change="applyDraftKind(draft.kind)"><option value="image">图像</option><option value="text">文本</option></select></div>
                <div class="field"><label for="model-draft-protocol">协议/接口形态</label><select id="model-draft-protocol" v-model="draft.apiProtocol" @change="applyProtocol(draft.apiProtocol ?? defaultApiProtocol(draft.kind))"><option v-for="option in protocolOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
                <div class="field"><label for="model-draft-endpoint">上游 BASE_URL</label><input id="model-draft-endpoint" v-model="draft.endpoint" placeholder="https://your-relay.example.com" /></div>
                <div class="field"><label for="model-draft-api-path">接口路径</label><input id="model-draft-api-path" v-model="draft.apiPath" placeholder="v1/images/generations" /></div>
                <div class="field"><label for="model-draft-id">{{ modelIdLabel(draft) }}</label><input id="model-draft-id" v-model="draft.model" :placeholder="modelIdPlaceholder(draft)" /></div>
                <div class="field"><label for="model-draft-api-key">{{ apiKeyLabel(draft) }}</label><input id="model-draft-api-key" v-model="draft.apiKey" type="password" :placeholder="draft.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'sk-...'" /></div>
                <div v-if="draft.apiProtocol === 'mgtv-storyboard'" class="field"><label for="model-draft-api-secret">Secret Key</label><input id="model-draft-api-secret" v-model="draft.apiSecret" type="password" placeholder="Secret Key" /></div>
                <label class="toggle-line">
                  <input
                    v-model="draft.isPrimary"
                    type="checkbox"
                    :aria-label="draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型'"
                  />
                  {{ draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型' }}
                </label>
              </div>
              <div class="btn-row">
                <button v-if="draft.apiProtocol !== 'mgtv-storyboard'" class="btn-soft" type="button" @click="openModelCatalog">获取模型</button>
                <button class="btn-primary" type="button" @click="saveDraft">保存模型</button>
              </div>
            </div>
          </article>
        </div>
        <button class="btn-soft add-row-btn" type="button" @click="newModel('image')">
          <Plus :size="14" />
          新增图像模型
        </button>
        <div v-if="isCreatingModel('image')" class="editor-card card inline-editor" data-testid="model-editor">
          <div class="inline-editor-head">
            <h3>新增图像模型</h3>
            <button class="btn-soft btn-sm" type="button" @click="closeModelEditor">取消</button>
          </div>
          <div class="grid grid-2">
            <div class="field"><label for="model-draft-name-new-image">模型名称</label><input id="model-draft-name-new-image" v-model="draft.name" /></div>
            <div class="field"><label for="model-draft-kind-new-image">类型</label><select id="model-draft-kind-new-image" v-model="draft.kind" @change="applyDraftKind(draft.kind)"><option value="image">图像</option><option value="text">文本</option></select></div>
            <div class="field"><label for="model-draft-protocol-new-image">协议/接口形态</label><select id="model-draft-protocol-new-image" v-model="draft.apiProtocol" @change="applyProtocol(draft.apiProtocol ?? defaultApiProtocol(draft.kind))"><option v-for="option in protocolOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
            <div class="field"><label for="model-draft-endpoint-new-image">上游 BASE_URL</label><input id="model-draft-endpoint-new-image" v-model="draft.endpoint" placeholder="https://your-relay.example.com" /></div>
            <div class="field"><label for="model-draft-api-path-new-image">接口路径</label><input id="model-draft-api-path-new-image" v-model="draft.apiPath" placeholder="v1/images/generations" /></div>
            <div class="field"><label for="model-draft-id-new-image">{{ modelIdLabel(draft) }}</label><input id="model-draft-id-new-image" v-model="draft.model" :placeholder="modelIdPlaceholder(draft)" /></div>
            <div class="field"><label for="model-draft-api-key-new-image">{{ apiKeyLabel(draft) }}</label><input id="model-draft-api-key-new-image" v-model="draft.apiKey" type="password" :placeholder="draft.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'sk-...'" /></div>
            <div v-if="draft.apiProtocol === 'mgtv-storyboard'" class="field"><label for="model-draft-api-secret-new-image">Secret Key</label><input id="model-draft-api-secret-new-image" v-model="draft.apiSecret" type="password" placeholder="Secret Key" /></div>
            <label class="toggle-line">
              <input
                v-model="draft.isPrimary"
                type="checkbox"
                :aria-label="draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型'"
              />
              {{ draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型' }}
            </label>
          </div>
          <div class="btn-row">
            <button v-if="draft.apiProtocol !== 'mgtv-storyboard'" class="btn-soft" type="button" @click="openModelCatalog">获取模型</button>
            <button class="btn-primary" type="button" @click="saveDraft">保存模型</button>
          </div>
        </div>
      </div>

      <div class="settings-section-block">
        <div class="settings-section-title">
          文本模型（润色提示词）
          <span class="count">{{ store.textModels.length }} 已配置</span>
        </div>
        <div class="stack">
          <article v-for="model in store.textModels" :key="model.id" class="model-card text-model-card" data-testid="text-model-card">
            <div class="model-card-head">
              <div class="model-card-heading">
                <h3>
                  <span class="dot text-dot" />
                  {{ model.name }}
                </h3>
                <p class="muted">{{ model.endpoint || '未配置 API 地址' }}</p>
              </div>
              <div class="model-card-badges">
                <span v-if="model.isPrimary" class="primary-badge">
                  <Star :size="12" fill="currentColor" />
                  主文本模型
                </span>
                <button
                  v-else
                  class="set-primary-btn"
                  type="button"
                  @click="store.setPrimaryTextModel(model.id)"
                >
                  设为主文本模型
                </button>
                <span class="status-pill">
                  <span class="status-dot" :class="{ warn: modelStatusMeta(model).tone === 'warn', error: modelStatusMeta(model).tone === 'error' }" />
                  {{ modelStatusMeta(model).label }}
                </span>
              </div>
            </div>
            <div class="model-card-body">
              <div class="model-fields">
                <div class="field">
                  <label>{{ modelIdLabel(model) }}</label>
                  <div class="field-value">{{ model.model || `未设置${modelIdLabel(model)}` }}</div>
                </div>
                <div class="field">
                  <label>Provider</label>
                  <div class="field-value">{{ model.provider }}</div>
                </div>
                <div class="field">
                  <label>{{ apiKeyLabel(model) }}</label>
                  <div class="field-value">{{ model.apiKey ? '已填写' : '未填写' }}</div>
                </div>
              </div>
              <div class="model-actions">
                <div class="btn-row">
                  <button class="btn-soft btn-sm" data-testid="edit-model-button" type="button" @click="editModel(model)">编辑</button>
                  <button
                    class="btn-soft btn-sm model-test-button"
                    :class="{ loading: isModelTesting(model.id) }"
                    type="button"
                    :disabled="isModelTesting(model.id)"
                    :aria-busy="isModelTesting(model.id)"
                    @click="testModelConnection(model.id)"
                  >
                    <LoaderCircle v-if="isModelTesting(model.id)" class="spin-icon" :size="14" />
                    <TestTube2 v-else :size="14" />
                    {{ isModelTesting(model.id) ? '检测中' : '检测连接' }}
                  </button>
                  <button class="btn-danger btn-sm" type="button" @click="removeModelWithConfirmation(model)">删除</button>
                </div>
              </div>
            </div>
            <div v-if="editingModelId === model.id" class="editor-card inline-editor" data-testid="model-editor">
              <div class="inline-editor-head">
                <h3>编辑 {{ model.name }}</h3>
                <button class="btn-soft btn-sm" type="button" @click="closeModelEditor">取消</button>
              </div>
              <div class="grid grid-2">
                <div class="field"><label for="model-draft-name-text">模型名称</label><input id="model-draft-name-text" v-model="draft.name" /></div>
                <div class="field"><label for="model-draft-kind-text">类型</label><select id="model-draft-kind-text" v-model="draft.kind" @change="applyDraftKind(draft.kind)"><option value="image">图像</option><option value="text">文本</option></select></div>
                <div class="field"><label for="model-draft-protocol-text">协议/接口形态</label><select id="model-draft-protocol-text" v-model="draft.apiProtocol" @change="applyProtocol(draft.apiProtocol ?? defaultApiProtocol(draft.kind))"><option v-for="option in protocolOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
                <div class="field"><label for="model-draft-endpoint-text">上游 BASE_URL</label><input id="model-draft-endpoint-text" v-model="draft.endpoint" placeholder="https://your-relay.example.com" /></div>
                <div class="field"><label for="model-draft-api-path-text">接口路径</label><input id="model-draft-api-path-text" v-model="draft.apiPath" placeholder="v1/chat/completions" /></div>
                <div class="field"><label for="model-draft-id-text">{{ modelIdLabel(draft) }}</label><input id="model-draft-id-text" v-model="draft.model" :placeholder="modelIdPlaceholder(draft)" /></div>
                <div class="field"><label for="model-draft-api-key-text">{{ apiKeyLabel(draft) }}</label><input id="model-draft-api-key-text" v-model="draft.apiKey" type="password" :placeholder="draft.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'sk-...'" /></div>
                <div v-if="draft.apiProtocol === 'mgtv-storyboard'" class="field"><label for="model-draft-api-secret-text">Secret Key</label><input id="model-draft-api-secret-text" v-model="draft.apiSecret" type="password" placeholder="Secret Key" /></div>
                <label class="toggle-line">
                  <input
                    v-model="draft.isPrimary"
                    type="checkbox"
                    :aria-label="draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型'"
                  />
                  {{ draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型' }}
                </label>
              </div>
              <div class="btn-row">
                <button v-if="draft.apiProtocol !== 'mgtv-storyboard'" class="btn-soft" type="button" @click="openModelCatalog">获取模型</button>
                <button class="btn-primary" type="button" @click="saveDraft">保存模型</button>
              </div>
            </div>
          </article>
          <div v-if="!store.textModels.length" class="empty-state">
            <strong>暂无文本模型</strong>
            <span>添加一个文本模型后，工作台的提示词润色会走远端模型。</span>
          </div>
        </div>
        <button class="btn-soft add-row-btn" type="button" @click="newModel('text')">
          <Plus :size="14" />
          新增文本模型
        </button>
        <div v-if="isCreatingModel('text')" class="editor-card card inline-editor" data-testid="model-editor">
          <div class="inline-editor-head">
            <h3>新增文本模型</h3>
            <button class="btn-soft btn-sm" type="button" @click="closeModelEditor">取消</button>
          </div>
          <div class="grid grid-2">
            <div class="field"><label for="model-draft-name-new-text">模型名称</label><input id="model-draft-name-new-text" v-model="draft.name" /></div>
            <div class="field"><label for="model-draft-kind-new-text">类型</label><select id="model-draft-kind-new-text" v-model="draft.kind" @change="applyDraftKind(draft.kind)"><option value="image">图像</option><option value="text">文本</option></select></div>
            <div class="field"><label for="model-draft-protocol-new-text">协议/接口形态</label><select id="model-draft-protocol-new-text" v-model="draft.apiProtocol" @change="applyProtocol(draft.apiProtocol ?? defaultApiProtocol(draft.kind))"><option v-for="option in protocolOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
            <div class="field"><label for="model-draft-endpoint-new-text">上游 BASE_URL</label><input id="model-draft-endpoint-new-text" v-model="draft.endpoint" placeholder="https://your-relay.example.com" /></div>
            <div class="field"><label for="model-draft-api-path-new-text">接口路径</label><input id="model-draft-api-path-new-text" v-model="draft.apiPath" placeholder="v1/chat/completions" /></div>
            <div class="field"><label for="model-draft-id-new-text">{{ modelIdLabel(draft) }}</label><input id="model-draft-id-new-text" v-model="draft.model" :placeholder="modelIdPlaceholder(draft)" /></div>
            <div class="field"><label for="model-draft-api-key-new-text">{{ apiKeyLabel(draft) }}</label><input id="model-draft-api-key-new-text" v-model="draft.apiKey" type="password" :placeholder="draft.apiProtocol === 'mgtv-storyboard' ? 'Access Key' : 'sk-...'" /></div>
            <div v-if="draft.apiProtocol === 'mgtv-storyboard'" class="field"><label for="model-draft-api-secret-new-text">Secret Key</label><input id="model-draft-api-secret-new-text" v-model="draft.apiSecret" type="password" placeholder="Secret Key" /></div>
            <label class="toggle-line">
              <input
                v-model="draft.isPrimary"
                type="checkbox"
                :aria-label="draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型'"
              />
              {{ draft.kind === 'text' ? '设为主文本模型' : '设为主图像模型' }}
            </label>
          </div>
          <div class="btn-row">
            <button v-if="draft.apiProtocol !== 'mgtv-storyboard'" class="btn-soft" type="button" @click="openModelCatalog">获取模型</button>
            <button class="btn-primary" type="button" @click="saveDraft">保存模型</button>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'prompts'" class="settings-section">
      <div class="section-head">
        <h2>Prompts 市场</h2>
        <div class="btn-row">
          <button class="btn-soft btn-sm" type="button" @click="exportPrompts">
            <Download :size="14" />
            导出 JSON
          </button>
        </div>
      </div>
      <label
        class="import-area"
        :class="{ dragging: promptImportDragging }"
        @dragover="handlePromptDragOver"
        @dragleave="handlePromptDragLeave"
        @drop="handlePromptDrop"
      >
        <Upload :size="22" />
        <span class="big">拖拽文件或点击导入</span>
        <span>支持多个 JSON 文件，自动去重并合并到 Prompts 市场。</span>
        <input type="file" accept="application/json,.json" multiple hidden @change="importFile" />
      </label>
      <div class="prompt-summary">
        <div class="stat-card"><strong>{{ store.prompts.length }}</strong><span>提示词总数</span></div>
        <div class="stat-card"><strong>{{ promptSources.length }}</strong><span>来源</span></div>
        <div class="stat-card"><strong>{{ filteredPrompts.length }}</strong><span>当前命中</span></div>
      </div>
      <div class="sync-panel card">
        <div class="card-body stack">
          <div>
            <h3>从开源仓库同步</h3>
            <p class="muted">同步失败时会保留本地已有提示词，不会清空用户数据。</p>
          </div>
          <div class="sync-grid">
            <article v-for="source in store.promptSyncSources" :key="source.key" class="sync-card">
              <div>
                <strong>{{ source.label }}</strong>
                <p class="muted">{{ source.repo }}</p>
              </div>
              <span class="chip">{{ store.promptSync[source.key]?.count ? `${store.promptSync[source.key]?.count} 条` : '未同步' }}</span>
              <button class="btn-primary btn-sm" type="button" @click="store.syncPromptSource(source.key)">同步-{{ source.label }}</button>
            </article>
          </div>
        </div>
      </div>
      <div class="prompt-filters">
        <div class="field prompt-search-field">
          <label for="prompt-market-search">搜索提示词</label>
          <input id="prompt-market-search" v-model="promptSearch" placeholder="搜索标题、正文、分类或来源" />
        </div>
        <div class="field">
          <label for="prompt-origin-filter">提示词类型</label>
          <select id="prompt-origin-filter" v-model="promptOriginFilter">
            <option value="all">全部提示词</option>
            <option value="imported">仅导入/同步</option>
            <option value="builtin">仅内置</option>
          </select>
        </div>
        <div class="field">
          <label for="prompt-source-filter">来源筛选</label>
          <select id="prompt-source-filter" v-model="promptSourceFilter">
            <option value="all">全部来源</option>
            <option v-for="source in promptSources" :key="source" :value="source">{{ source }}</option>
          </select>
        </div>
        <div class="field">
          <label for="prompt-category-filter">分类筛选</label>
          <select id="prompt-category-filter" v-model="promptCategoryFilter">
            <option value="all">全部分类</option>
            <option v-for="category in promptCategories" :key="category" :value="category">{{ promptCategoryLabel(category) }}</option>
          </select>
        </div>
      </div>
      <div class="card prompt-list-panel">
        <div class="prompt-list">
          <article v-for="item in filteredPrompts" :key="item.id" class="prompt-card">
            <div class="prompt-card-main">
              <div class="inline prompt-meta-line">
                <strong>{{ item.title }}</strong>
                <span class="chip">{{ item.source }}</span>
                <span v-if="item.category" class="chip accent">{{ promptCategoryLabel(item.category) }}</span>
                <span v-if="item.subCategory" class="chip">{{ promptCategoryLabel(item.subCategory) }}</span>
              </div>
              <p>{{ item.prompt }}</p>
              <small v-if="item.promptZh" class="prompt-zh">{{ item.promptZh }}</small>
              <div v-if="item.author" class="prompt-author">by {{ item.author }}</div>
            </div>
            <div class="prompt-actions">
              <button class="btn-primary btn-sm" type="button" @click="usePromptInWorkspace(item)">使用</button>
              <button class="btn-soft btn-sm" type="button" @click="copyPrompt(item)">复制</button>
              <button v-if="item.source !== 'builtin'" class="btn-danger btn-sm" type="button" @click="removePromptWithConfirmation(item)">删除</button>
              <span v-else class="builtin-note">内置</span>
            </div>
          </article>
          <div v-if="!filteredPrompts.length" class="empty-state">
            <strong>暂无 Prompts</strong>
            <span>请从上方拖拽或点击导入文件</span>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'generation'" class="settings-section">
      <div class="card">
        <div class="card-body stack">
          <h2>生成参数</h2>
          <div class="grid grid-2">
            <div class="field">
              <label for="default-generation-size">默认尺寸</label>
              <input id="default-generation-size" v-model.number="store.settings.defaultGenerationSize" type="number" min="128" max="4096" step="64" />
            </div>
            <div class="field">
              <label for="default-batch-size">默认数量</label>
              <select id="default-batch-size" v-model.number="store.settings.defaultBatchSize">
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="3">3</option>
                <option :value="4">4</option>
              </select>
            </div>
            <div class="field">
              <label for="default-style">默认风格预设</label>
              <select id="default-style" v-model="store.settings.defaultStyle">
                <option v-for="item in stylePresets" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>
            <div class="field">
              <label for="default-img-model">默认生图模型</label>
              <select id="default-img-model" v-model="store.settings.defaultImageModelId">
                <option v-for="model in store.imageModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
              </select>
            </div>
          </div>
          <label class="toggle-line"><input v-model="store.settings.autoSaveHistory" type="checkbox" /> 自动保存到资产库</label>
          <label class="toggle-line"><input v-model="store.settings.includePromptMetadata" type="checkbox" /> 导出时包含提示词元数据</label>
          <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">保存生成参数</button>
        </div>
      </div>
    </section>

    <section v-else class="settings-section">
      <div class="card">
        <div class="card-body stack">
          <h2>系统设置</h2>
          <div class="field">
            <label for="default-output-dir">默认输出目录</label>
            <div class="directory-picker">
              <input id="default-output-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseDefaultOutputDir">
                <FolderOpen :size="16" />
                重新选择目录
              </button>
            </div>
          </div>
          <div class="field">
            <label for="default-export-format">默认导出格式</label>
            <select id="default-export-format" v-model="store.settings.defaultExportFormat">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">保存系统设置</button>
            <button class="btn-danger" type="button" @click="resetDemoDataWithConfirmation">恢复初始数据</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body stack">
          <div class="section-head">
            <div>
              <h2>自媒体封面预设</h2>
              <p class="muted">{{ enabledCoverPresetCount }} 个启用</p>
            </div>
            <button class="btn-soft btn-sm" type="button" @click="resetCoverPresetsWithConfirmation">
              <RotateCcw :size="14" />
              恢复默认封面预设
            </button>
            <button class="btn-primary btn-sm" type="button" @click="openCoverPresetModal">
              <Plus :size="14" />
              新增预设
            </button>
          </div>
          <div class="cover-settings-list">
            <article v-for="preset in store.coverPresets" :key="preset.id" class="cover-row">
              <div>
                <div class="inline">
                  <strong>{{ preset.name }}</strong>
                  <span v-if="preset.custom" class="chip accent">自定义</span>
                </div>
                <p class="muted">{{ preset.width }} x {{ preset.height }}</p>
              </div>
              <label class="toggle-line">
                <input
                  :checked="preset.enabled"
                  type="checkbox"
                  :aria-label="`启用 ${preset.name}`"
                  @change="toggleCoverPreset(preset.id, $event)"
                />
                启用
              </label>
              <button
                v-if="preset.custom"
                class="btn-icon"
                type="button"
                :aria-label="`删除 ${preset.name}`"
                @click="removeCoverPresetWithConfirmation(preset)"
              >
                <Trash2 :size="14" />
              </button>
              <span v-else class="builtin-note">内置</span>
            </article>
          </div>
        </div>
      </div>
    </section>

    <div v-if="coverPresetModalOpen" class="modal-overlay" @click.self="coverPresetModalOpen = false">
      <div class="modal small">
        <div class="modal-head">
          <div>
            <h2>新增封面预设</h2>
            <p class="muted">添加常用尺寸后，可在工具库和工作台直接使用。</p>
          </div>
          <button class="btn-icon" type="button" @click="coverPresetModalOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="settings-cover-preset-name">名称</label>
            <input id="settings-cover-preset-name" v-model="coverPresetName" placeholder="例如：竖版课程封面" />
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label for="settings-cover-preset-width">宽度</label>
              <input id="settings-cover-preset-width" v-model.number="coverPresetWidth" type="number" min="128" max="4096" />
            </div>
            <div class="field">
              <label for="settings-cover-preset-height">高度</label>
              <input id="settings-cover-preset-height" v-model.number="coverPresetHeight" type="number" min="128" max="4096" />
            </div>
          </div>
          <label class="toggle-line">
            <input v-model="coverPresetEnabled" type="checkbox" aria-label="启用新预设" />
            启用
          </label>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="coverPresetModalOpen = false">取消</button>
          <button class="btn-primary" type="button" @click="addCoverPresetFromSettings">添加预设</button>
        </div>
      </div>
    </div>

    <div v-if="modelCatalogOpen" class="modal-overlay" @click.self="modelCatalogOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>获取模型</h2>
            <p class="muted">从当前 BASE_URL 拼接 /v1/models 获取真实模型列表；接口失败或为空时请手动填写模型 ID。</p>
          </div>
          <button class="btn-icon" type="button" @click="modelCatalogOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="model-fetch-status">
            <span>{{ modelCatalogLoading ? '正在获取模型列表...' : modelCatalogNotice || '选择一个模型填入当前草稿。' }}</span>
            <button class="btn-soft btn-sm" type="button" :disabled="modelCatalogLoading" @click="openModelCatalog">刷新</button>
          </div>
          <input v-model="modelCatalogSearch" class="model-fetch-search" placeholder="搜索模型…" />
          <div class="model-fetch-grid">
            <button
              v-for="item in filteredModelCatalog"
              :key="`${item.source}:${item.model}`"
              class="model-fetch-item"
              :class="{ selected: selectedCatalogModelId === item.model }"
              type="button"
              @click="selectedCatalogModelId = item.model"
            >
              <span class="mf-dot" />
              <span class="mf-info">
                <strong class="mf-name">{{ item.name }}</strong>
                <span class="mf-id">{{ item.model }}</span>
                <span class="mf-source">接口返回</span>
              </span>
            </button>
          </div>
          <p v-if="!filteredModelCatalog.length && !modelCatalogLoading" class="muted">没有匹配的模型。</p>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="modelCatalogOpen = false">取消</button>
          <button class="btn-primary" type="button" @click="applyCatalogModel">确认选择</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: 26px;
}

.settings-tab {
  padding: 10px 18px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}

.settings-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 700;
}

.settings-section {
  display: grid;
  gap: 22px;
}

.settings-section-block {
  display: grid;
  gap: 12px;
}

.model-bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.model-bulk-bar > div {
  min-width: 0;
}

.model-bulk-bar strong {
  display: block;
  margin-bottom: 4px;
}

.model-test-all-button {
  flex: 0 0 auto;
  min-width: 142px;
}

.model-test-all-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  transform: none;
}

.model-test-all-button.loading:disabled {
  cursor: wait;
}

.settings-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.settings-section-title::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: var(--border-soft);
}

.settings-section-title .count {
  color: var(--accent);
  white-space: nowrap;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
}

.section-head h2,
.section-head > div {
  min-width: 0;
}

.model-card-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.model-card-head,
.model-card-body,
.model-actions,
.model-card-heading {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.model-card-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}

.model-card-heading h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  min-width: 0;
}

.model-card-heading h3,
.model-card-heading .muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  flex: 0 0 auto;
}

.text-dot {
  background: var(--warn);
}

.primary-badge,
.set-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.primary-badge {
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-glow);
}

.set-primary-btn {
  color: var(--muted);
  border: 1px solid var(--border);
  background: rgba(11, 18, 32, 0.66);
}

.set-primary-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.model-card,
.prompt-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  min-width: 0;
}

.model-test-button {
  min-width: 92px;
}

.model-test-button.loading,
.model-test-button:disabled {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  cursor: wait;
  opacity: 0.92;
}

.model-test-button:disabled:hover {
  transform: none;
}

.spin-icon {
  animation: settings-spin 0.8s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

.model-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.field-value {
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(6, 10, 18, 0.34);
  color: var(--fg-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card {
  margin-top: 8px;
}

.inline-editor {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: rgba(6, 10, 18, 0.26);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
}

.inline-editor.card {
  margin-top: 10px;
  box-shadow: none;
}

.inline-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.inline-editor-head h3 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-2);
}

.editor-card .toggle-line {
  grid-column: 1 / -1;
  min-height: 34px;
}

.prompt-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: grid;
}

.stat-card strong {
  font-size: 22px;
  color: var(--accent);
}

.stat-card span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.import-area {
  display: grid;
  place-items: center;
  gap: 7px;
  min-height: 118px;
  padding: 20px;
  color: var(--muted);
  text-align: center;
  cursor: pointer;
  background: rgba(6, 10, 18, 0.34);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.import-area:hover,
.import-area.dragging {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.import-area .big {
  color: var(--fg);
  font-weight: 800;
}

.sync-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.sync-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 14px;
  background: rgba(6, 10, 18, 0.34);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-width: 0;
}

.sync-card strong,
.sync-card p {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-card .btn-primary {
  grid-column: 1 / -1;
  justify-self: start;
  max-width: 100%;
  white-space: normal;
  text-align: center;
}

.prompt-filters {
  display: grid;
  grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(160px, 0.8fr));
  gap: 12px;
  align-items: end;
}

.prompt-search-field {
  min-width: 0;
}

.prompt-list {
  display: grid;
  gap: 10px;
}

.prompt-list-panel {
  overflow: hidden;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 140px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
  background: rgba(6, 10, 18, 0.24);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.empty-state strong {
  color: var(--fg);
}

.prompt-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-radius: 0;
  border-inline: 0;
  border-top: 0;
  background: transparent;
  padding: 14px 20px;
}

.prompt-card:first-child {
  padding-top: 18px;
}

.prompt-card:last-child {
  border-bottom: 0;
  padding-bottom: 18px;
}

.prompt-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  width: 84px;
  flex: 0 0 auto;
}

.prompt-actions .btn-sm {
  width: 100%;
  min-width: 0;
  padding-inline: 8px;
  white-space: nowrap;
}

.prompt-card p {
  margin-top: 6px;
  color: var(--fg-2);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.prompt-zh {
  margin-top: 5px;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.prompt-meta-line {
  gap: 8px;
  min-width: 0;
}

.prompt-card-main {
  min-width: 0;
}

.prompt-meta-line strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-author {
  margin-top: 4px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.model-fetch-search {
  width: 100%;
}

.model-fetch-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: var(--muted);
  background: rgba(6, 10, 18, 0.34);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.model-fetch-status span {
  min-width: 0;
}

.model-fetch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.model-fetch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px;
  color: var(--fg);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.model-fetch-item:hover,
.model-fetch-item.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.mf-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--success);
}

.mf-info {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.mf-name,
.mf-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mf-id {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.mf-source {
  width: max-content;
  padding: 2px 6px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  font-size: 10px;
}

.cover-settings-list {
  display: grid;
  gap: 10px;
}

.cover-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(6, 10, 18, 0.34);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.cover-row p {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.builtin-note {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.add-row-btn {
  justify-self: stretch;
}

@media (max-width: 920px) {
  .prompt-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .model-bulk-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .model-test-all-button {
    width: 100%;
  }

  .sync-grid {
    grid-template-columns: 1fr;
  }

  .prompt-filters {
    grid-template-columns: 1fr;
  }

  .prompt-summary,
  .model-fields,
  .model-card-head,
  .prompt-card {
    grid-template-columns: 1fr;
  }

  .cover-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .model-fetch-grid {
    grid-template-columns: 1fr;
  }

  .prompt-actions {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .prompt-actions .btn-sm {
    width: auto;
    min-width: 68px;
  }

  .settings-tabs {
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .settings-tab {
    white-space: nowrap;
  }
}
</style>
