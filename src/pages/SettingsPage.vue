<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, FolderOpen, Plus, RotateCcw, Save, Star, TestTube2, Trash2, Upload } from 'lucide-vue-next'
import { exportFormatOptions, stylePresets } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/tauri'
import type { ModelProfile, PromptItem } from '@/types/domain'
import { createId } from '@/domain/ids'

const store = useAppStore()
const router = useRouter()
const activeTab = ref<'models' | 'prompts' | 'generation' | 'system'>('models')
const promptSourceFilter = ref('all')
const promptCategoryFilter = ref('all')
const promptImportDragging = ref(false)
const modelCatalogOpen = ref(false)
const modelCatalogSearch = ref('')
const selectedCatalogModelId = ref('')
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
  apiKey: '',
  model: '',
  kind: 'image',
  isPrimary: false,
  status: 'untested',
})

const modelCatalog = [
  { name: 'gpt-image-2', model: 'openai/gpt-image-2', provider: 'openai-compatible' },
  { name: 'dall-e-3', model: 'openai/dall-e-3', provider: 'openai-compatible' },
  { name: 'flux-1-dev', model: 'black-forest-labs/flux-1-dev', provider: 'openai-compatible' },
  { name: 'flux-1-schnell', model: 'black-forest-labs/flux-1-schnell', provider: 'openai-compatible' },
  { name: 'stable-diffusion-xl', model: 'stabilityai/sdxl', provider: 'openai-compatible' },
  { name: 'qwen2.5-vl', model: 'alibaba/qwen2.5-vl', provider: 'openai-compatible' },
  { name: 'ideogram-3', model: 'ideogram/ideogram-3', provider: 'openai-compatible' },
  { name: 'recraft-v3', model: 'recraft/recraft-v3', provider: 'openai-compatible' },
] as const

const promptSources = computed(() => Array.from(new Set(store.prompts.map((item) => item.source))))
const promptCategories = computed(() => Array.from(new Set(store.prompts.map((item) => item.category).filter(Boolean))))
const filteredPrompts = computed(() => store.prompts.filter((item) => {
  if (promptSourceFilter.value !== 'all' && item.source !== promptSourceFilter.value) return false
  if (promptCategoryFilter.value !== 'all' && item.category !== promptCategoryFilter.value && item.subCategory !== promptCategoryFilter.value) return false
  return true
}))
const enabledCoverPresetCount = computed(() => store.coverPresets.filter((preset) => preset.enabled).length)
const filteredModelCatalog = computed(() => {
  const keyword = modelCatalogSearch.value.trim().toLowerCase()
  return modelCatalog.filter((item) => !keyword || `${item.name} ${item.model}`.toLowerCase().includes(keyword))
})

function newModel(): void {
  draft.value = {
    id: createId('model'),
    name: 'OpenAI Compatible Image',
    provider: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/images/generations',
    apiKey: '',
    model: 'gpt-image-1',
    kind: 'image',
    isPrimary: false,
    status: 'untested',
  }
}

function editModel(model: ModelProfile): void {
  draft.value = { ...model }
}

function removeModelWithConfirmation(model: ModelProfile): void {
  const confirmed = window.confirm(`确定删除模型「${model.name}」？此操作会移除该模型的 API 地址、Key 和连接状态。`)
  if (!confirmed) return

  store.removeModel(model.id)
}

function saveDraft(): void {
  if (!draft.value.name.trim()) {
    store.notify('请输入模型名称', 'error')
    return
  }
  store.saveModel({ ...draft.value })
}

function openModelCatalog(): void {
  modelCatalogSearch.value = ''
  selectedCatalogModelId.value = ''
  modelCatalogOpen.value = true
}

function applyCatalogModel(): void {
  const item = modelCatalog.find((model) => model.model === selectedCatalogModelId.value)
  if (!item) {
    store.notify('请选择一个模型', 'error')
    return
  }
  draft.value = {
    ...draft.value,
    name: item.name,
    model: item.model,
    provider: item.provider,
    kind: 'image',
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

async function chooseDefaultOutputDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.settings.defaultOutputDir = directory
  store.notify('默认输出目录已更新')
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

  store.addCoverPreset({
    name,
    width: coverPresetWidth.value,
    height: coverPresetHeight.value,
    enabled: coverPresetEnabled.value,
  })
  coverPresetModalOpen.value = false
}

async function resetDemoDataWithConfirmation(): Promise<void> {
  const confirmed = window.confirm('确定恢复初始数据？此操作会清空当前模型、提示词、历史记录和自定义封面预设。')
  if (!confirmed) return

  await store.resetDemoData()
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
      <div class="section-head">
        <h2>生图模型</h2>
        <button class="btn-soft btn-sm" type="button" @click="newModel">
          <Plus :size="14" />
          新增模型
        </button>
      </div>
      <div class="stack">
        <article v-for="model in store.models" :key="model.id" class="model-card">
          <div class="split">
            <div>
              <h3>{{ model.name }}</h3>
              <p class="muted">{{ model.provider }} · {{ model.model || '未设置模型 ID' }}</p>
            </div>
            <div class="model-card-badges">
              <span v-if="model.kind === 'image' && model.isPrimary" class="primary-badge">
                <Star :size="12" fill="currentColor" />
                主模型
              </span>
              <span v-else-if="model.kind === 'text' && model.isPrimary" class="primary-badge">
                <Star :size="12" fill="currentColor" />
                主文本模型
              </span>
              <button
                v-else-if="model.kind === 'image'"
                class="set-primary-btn"
                type="button"
                @click="store.setPrimaryImageModel(model.id)"
              >
                设为主模型
              </button>
              <button
                v-else
                class="set-primary-btn"
                type="button"
                @click="store.setPrimaryTextModel(model.id)"
              >
                设为主文本模型
              </button>
              <span class="status-pill">
                <span class="status-dot" :class="{ warn: model.status !== 'connected', error: model.status === 'failed' }" />
                {{ model.status === 'connected' ? '已连接' : model.status === 'failed' ? '失败' : '待检测' }}
              </span>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn-soft btn-sm" type="button" @click="editModel(model)">编辑</button>
            <button class="btn-soft btn-sm" type="button" @click="store.testModel(model.id)">
              <TestTube2 :size="14" />
              检测连接
            </button>
            <button class="btn-danger btn-sm" type="button" @click="removeModelWithConfirmation(model)">删除</button>
          </div>
        </article>
      </div>

      <div class="editor-card card">
        <div class="card-body stack">
          <h3>模型编辑</h3>
          <div class="grid grid-2">
            <div class="field"><label for="model-draft-name">模型名称</label><input id="model-draft-name" v-model="draft.name" /></div>
            <div class="field"><label for="model-draft-kind">类型</label><select id="model-draft-kind" v-model="draft.kind"><option value="image">图像</option><option value="text">文本</option></select></div>
            <div class="field"><label for="model-draft-endpoint">API 地址</label><input id="model-draft-endpoint" v-model="draft.endpoint" placeholder="https://..." /></div>
            <div class="field"><label for="model-draft-id">模型 ID</label><input id="model-draft-id" v-model="draft.model" placeholder="gpt-image-1" /></div>
            <div class="field"><label for="model-draft-api-key">API Key</label><input id="model-draft-api-key" v-model="draft.apiKey" type="password" placeholder="sk-..." /></div>
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
            <button class="btn-soft" type="button" @click="openModelCatalog">获取模型</button>
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
            <option v-for="category in promptCategories" :key="category" :value="category">{{ category }}</option>
          </select>
        </div>
      </div>
      <div class="prompt-list">
        <article v-for="item in filteredPrompts" :key="item.id" class="prompt-card">
          <div>
            <div class="inline"><strong>{{ item.title }}</strong><span class="chip">{{ item.source }}</span><span class="chip accent">{{ item.category }}</span></div>
            <p>{{ item.prompt }}</p>
          </div>
          <div class="prompt-actions">
            <button class="btn-primary btn-sm" type="button" @click="usePromptInWorkspace(item)">使用</button>
            <button class="btn-soft btn-sm" type="button" @click="copyPrompt(item)">复制</button>
          </div>
        </article>
        <div v-if="!filteredPrompts.length" class="empty-state">
          <strong>暂无 Prompts</strong>
          <span>请从上方拖拽或点击导入文件</span>
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
          <label class="toggle-line"><input v-model="store.settings.autoSaveHistory" type="checkbox" /> 自动保存生成历史</label>
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
            <button class="btn-soft btn-sm" type="button" @click="store.resetCoverPresets">
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
                @click="store.removeCoverPreset(preset.id)"
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
            <p class="muted">从本地目录选择常用图像模型，自动填入当前模型草稿。</p>
          </div>
          <button class="btn-icon" type="button" @click="modelCatalogOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <input v-model="modelCatalogSearch" class="model-fetch-search" placeholder="搜索模型…" />
          <div class="model-fetch-grid">
            <button
              v-for="item in filteredModelCatalog"
              :key="item.model"
              class="model-fetch-item"
              :class="{ selected: selectedCatalogModelId === item.model }"
              type="button"
              @click="selectedCatalogModelId = item.model"
            >
              <span class="mf-dot" />
              <span class="mf-info">
                <strong class="mf-name">{{ item.name }}</strong>
                <span class="mf-id">{{ item.model }}</span>
              </span>
            </button>
          </div>
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
  gap: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.model-card-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
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
}

.editor-card {
  margin-top: 8px;
}

.toggle-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-2);
}

.prompt-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.sync-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  background: rgba(6, 10, 18, 0.34);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.sync-card strong,
.sync-card p {
  min-width: 0;
}

.prompt-list {
  display: grid;
  gap: 10px;
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
}

.prompt-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-card p {
  margin-top: 6px;
  color: var(--fg-2);
  line-height: 1.6;
}

.model-fetch-search {
  width: 100%;
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

@media (max-width: 720px) {
  .sync-grid {
    grid-template-columns: 1fr;
  }

  .cover-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .model-fetch-grid {
    grid-template-columns: 1fr;
  }
}
</style>
