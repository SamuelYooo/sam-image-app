<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Plus, RotateCcw, Save, Star, TestTube2, Trash2, Upload } from 'lucide-vue-next'
import { exportFormatOptions, stylePresets } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { ModelProfile, PromptItem } from '@/types/domain'
import { createId } from '@/domain/ids'

const store = useAppStore()
const activeTab = ref<'models' | 'prompts' | 'generation' | 'system'>('models')
const promptSourceFilter = ref('all')
const promptCategoryFilter = ref('all')
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

const promptSources = computed(() => Array.from(new Set(store.prompts.map((item) => item.source))))
const promptCategories = computed(() => Array.from(new Set(store.prompts.map((item) => item.category).filter(Boolean))))
const filteredPrompts = computed(() => store.prompts.filter((item) => {
  if (promptSourceFilter.value !== 'all' && item.source !== promptSourceFilter.value) return false
  if (promptCategoryFilter.value !== 'all' && item.category !== promptCategoryFilter.value && item.subCategory !== promptCategoryFilter.value) return false
  return true
}))
const enabledCoverPresetCount = computed(() => store.coverPresets.filter((preset) => preset.enabled).length)

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

function saveDraft(): void {
  if (!draft.value.name.trim()) {
    store.notify('请输入模型名称', 'error')
    return
  }
  store.saveModel({ ...draft.value })
}

function importFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return

  Promise.all(files.map(readPromptFile))
    .then((items) => store.importPromptBatch(items))
    .catch((error: unknown) => {
      store.notify(error instanceof Error ? error.message : '导入 Prompts 失败', 'error')
    })
    .finally(() => {
      input.value = ''
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

function toggleCoverPreset(id: string, event: Event): void {
  const input = event.target as HTMLInputElement
  store.setCoverPresetEnabled(id, input.checked)
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
              <button
                v-else-if="model.kind === 'image'"
                class="set-primary-btn"
                type="button"
                @click="store.setPrimaryImageModel(model.id)"
              >
                设为主模型
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
            <button class="btn-danger btn-sm" type="button" @click="store.removeModel(model.id)">删除</button>
          </div>
        </article>
      </div>

      <div class="editor-card card">
        <div class="card-body stack">
          <h3>模型编辑</h3>
          <div class="grid grid-2">
            <div class="field"><label>模型名称</label><input v-model="draft.name" /></div>
            <div class="field"><label>类型</label><select v-model="draft.kind"><option value="image">图像</option><option value="text">文本</option></select></div>
            <div class="field"><label>API 地址</label><input v-model="draft.endpoint" placeholder="https://..." /></div>
            <div class="field"><label>模型 ID</label><input v-model="draft.model" placeholder="gpt-image-1" /></div>
            <div class="field"><label>API Key</label><input v-model="draft.apiKey" type="password" placeholder="sk-..." /></div>
            <label class="toggle-line"><input v-model="draft.isPrimary" type="checkbox" /> 设为主图像模型</label>
          </div>
          <button class="btn-primary" type="button" @click="saveDraft">保存模型</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'prompts'" class="settings-section">
      <div class="section-head">
        <h2>Prompts 市场</h2>
        <div class="btn-row">
          <label class="btn-soft btn-sm">
            <Upload :size="14" />
            导入 JSON
            <input type="file" accept="application/json,.json" multiple hidden @change="importFile" />
          </label>
          <button class="btn-soft btn-sm" type="button" @click="exportPrompts">
            <Download :size="14" />
            导出
          </button>
        </div>
      </div>
      <div class="prompt-summary">
        <div class="stat-card"><strong>{{ store.prompts.length }}</strong><span>提示词总数</span></div>
        <div class="stat-card"><strong>{{ promptSources.length }}</strong><span>来源</span></div>
        <div class="stat-card"><strong>{{ filteredPrompts.length }}</strong><span>当前命中</span></div>
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
            <button class="btn-primary btn-sm" type="button" @click="store.usePrompt(item)">使用</button>
            <button class="btn-soft btn-sm" type="button" @click="copyPrompt(item)">复制</button>
          </div>
        </article>
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
            <input id="default-output-dir" v-model="store.settings.defaultOutputDir" />
          </div>
          <div class="field">
            <label for="default-export-format">默认导出格式</label>
            <select id="default-export-format" v-model="store.settings.defaultExportFormat">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn-primary" type="button" @click="store.saveSettings(store.settings)">保存系统设置</button>
            <button class="btn-danger" type="button" @click="store.resetDemoData">恢复初始数据</button>
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

.prompt-list {
  display: grid;
  gap: 10px;
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
  .cover-row {
    grid-template-columns: 1fr;
    align-items: start;
  }
}
</style>
