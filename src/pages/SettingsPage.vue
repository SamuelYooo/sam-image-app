<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { createLegacyImportTemplateJson } from '../data/legacyImportTemplate'
import { useAssetStore } from '../stores/assetStore'
import {
  MODEL_PROVIDER_OPTIONS,
  hasConfiguredModel,
  useModelStore,
  type ModelCapability,
  type ModelProfileDraft,
} from '../stores/modelStore'
import { usePromptMarketStore } from '../stores/promptMarketStore'

interface LegacyImportReport {
  assetsImported: number
  promptsImported: number
  skipped: number
  message: string
}

const modelStore = useModelStore()
const assetStore = useAssetStore()
const promptMarketStore = usePromptMarketStore()
const {
  isLoadingProfiles,
  lastError,
  activeModelCapability,
  modelProfiles,
  activeCapabilityProfiles,
  modelDrafts,
  modelOptions,
  modelHealthResults,
  isCheckingModelHealth,
  isFetchingModelOptions,
  lastModelFetchMessage,
  lastModelHealthMessage,
  hasTextModel,
  hasImageModel,
  textModelStatus,
  imageModelStatus,
  activeModelHint,
} = storeToRefs(modelStore)
const legacyFileInput = ref<HTMLInputElement | null>(null)
const legacyImportMessage = ref('')
const legacyImportError = ref('')
const isImportingLegacy = ref(false)
const settingsModelOptionSearch = ref('')

const capabilityTabs: Array<{ value: ModelCapability; label: string; icon: string }> = [
  { value: 'image', label: '图像模型配置', icon: 'i-mdi-image-sparkle-outline' },
  { value: 'text', label: '文本模型配置', icon: 'i-mdi-text-box-edit-outline' },
]

const providerOptions = MODEL_PROVIDER_OPTIONS

const filteredSettingsModelOptions = computed(() =>
  filterModelOptions(modelOptions.value[activeModelCapability.value], settingsModelOptionSearch.value),
)

const selectedSettingsModelCount = computed(() =>
  modelDrafts.value[activeModelCapability.value].model.trim() ? 1 : 0,
)

onMounted(async () => {
  await modelStore.loadModelProfiles()
  modelStore.editModelProfile(activeModelCapability.value)
})

function selectCapability(capability: ModelCapability) {
  modelStore.editModelProfile(capability)
}

function getCapabilityLabel(capability: ModelCapability) {
  return capability === 'text' ? '文本模型' : '图像模型'
}

function getProfileStatus(profile: ModelProfileDraft) {
  if (!profile.enabled) {
    return '已停用'
  }
  if (hasConfiguredModel(profile)) {
    return profile.model
  }
  return profile.capability === 'text' ? '未配置文本模型' : '未配置图像模型'
}

function filterModelOptions(options: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return options.filter((model) => !normalizedQuery || model.toLowerCase().includes(normalizedQuery))
}

function getProviderLabel(provider: string) {
  return providerOptions.find((item) => item.value === provider)?.label ?? provider
}

function getActiveModelHealth(model: string) {
  return modelHealthResults.value[activeModelCapability.value][model]
}

function formatModelHealthLatency(latencyMs: number) {
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(2)}s` : `${latencyMs}ms`
}

function getModelHealthLatencyLabel(model: string) {
  const latencyMs = getActiveModelHealth(model)?.latencyMs
  return typeof latencyMs === 'number' ? formatModelHealthLatency(latencyMs) : ''
}

function getModelHealthTitle(model: string) {
  const result = getActiveModelHealth(model)
  if (!result) {
    return '未健康检查'
  }
  return `${result.ok ? '检查通过' : '检查失败'}${result.latencyMs ? `，${formatModelHealthLatency(result.latencyMs)}` : ''}：${result.message}`
}

function selectDetectedModel(model: string) {
  modelDrafts.value[activeModelCapability.value].model = model
}

function clearSelectedModel() {
  modelDrafts.value[activeModelCapability.value].model = ''
}

function useFirstDetectedModel() {
  const firstModel = filteredSettingsModelOptions.value[0] ?? modelOptions.value[activeModelCapability.value][0]
  if (firstModel) {
    selectDetectedModel(firstModel)
  }
}

async function detectModels() {
  await modelStore.fetchModelOptions()
}

async function checkModelHealth() {
  await modelStore.checkModelHealth()
}

async function saveProfile() {
  await modelStore.saveModelProfile()
}

async function deleteProfile() {
  await modelStore.deleteModelProfile()
}

async function setDefaultProfile() {
  await modelStore.setDefaultModelProfile()
}

function createProfile() {
  modelStore.createNewModelProfile(activeModelCapability.value)
}

function editProfile(profile: ModelProfileDraft) {
  modelStore.editModelProfile(profile.capability, profile.id)
}

function triggerLegacyImport() {
  legacyFileInput.value?.click()
}

function downloadLegacyTemplate() {
  const blob = new Blob([createLegacyImportTemplateJson()], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'samimage-legacy-import-template.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function importLegacyFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  legacyImportError.value = ''
  legacyImportMessage.value = ''
  isImportingLegacy.value = true
  try {
    const payload = JSON.parse(await file.text()) as unknown
    const report = await invoke<LegacyImportReport>('import_legacy_json', { payload })
    legacyImportMessage.value = report.message
    await Promise.all([assetStore.loadAssets(), promptMarketStore.loadPromptAssets()])
  } catch (error) {
    legacyImportError.value = error instanceof Error ? error.message : String(error || '旧数据导入失败')
  } finally {
    isImportingLegacy.value = false
    input.value = ''
  }
}
</script>

<template>
  <section class="sam-settings-page">
    <header class="sam-settings-hero">
      <div>
        <span class="sam-eyebrow">设置</span>
        <h1>模型配置中心</h1>
        <p>SamImage 2.0 不内置默认模型。草案生成依赖文本模型，出图必须先配置图像模型。</p>
      </div>
      <button type="button" :disabled="isLoadingProfiles" @click="modelStore.loadModelProfiles">
        <span class="i-mdi-refresh" aria-hidden="true" />
        {{ isLoadingProfiles ? '刷新中' : '刷新配置' }}
      </button>
    </header>

    <div class="sam-settings-layout">
      <aside class="sam-settings-sidebar" aria-label="模型配置导航与导入">
        <section class="sam-settings-status-grid" aria-label="模型配置状态">
          <button
            v-for="tab in capabilityTabs"
            :key="tab.value"
            type="button"
            class="sam-settings-status"
            :class="{ active: activeModelCapability === tab.value }"
            @click="selectCapability(tab.value)"
          >
            <span class="sam-settings-status-icon">
              <span :class="tab.icon" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ tab.label }}</strong>
              <small>{{ tab.value === 'text' ? textModelStatus : imageModelStatus }}</small>
            </span>
            <em
              :class="{
                ready: tab.value === 'text' ? hasTextModel : hasImageModel,
                danger: tab.value === 'image' && !hasImageModel,
              }"
            >
              {{ getProfileStatus(modelProfiles[tab.value]) }}
            </em>
          </button>
        </section>

        <section class="sam-settings-panel legacy-import">
          <header>
            <div>
              <span>旧数据导入</span>
              <h2>手动导入 1.x JSON</h2>
              <p>2.0 使用新数据库结构，不自动迁移 1.x 数据。这里支持导入旧版 artifacts、promptTemplates 或标准 assets/prompts JSON。</p>
            </div>
            <div class="sam-settings-panel-actions">
              <button type="button" @click="downloadLegacyTemplate">
                <span class="i-mdi-download-outline" aria-hidden="true" />
                下载模板
              </button>
              <button type="button" :disabled="isImportingLegacy" @click="triggerLegacyImport">
                <span class="i-mdi-database-import-outline" aria-hidden="true" />
                {{ isImportingLegacy ? '导入中' : '导入旧数据' }}
              </button>
            </div>
            <input
              ref="legacyFileInput"
              class="sam-hidden-file"
              type="file"
              accept="application/json,.json"
              @change="importLegacyFile"
            />
          </header>

          <div class="sam-legacy-import-grid">
            <article>
              <strong>可识别资产</strong>
              <p>读取 `artifacts`、`galleryArtifacts`、`historyArtifacts`、`assets`、`images` 中的图片 URL、提示词、模型、尺寸、收藏和标签。</p>
            </article>
            <article>
              <strong>可识别提示词</strong>
              <p>读取 `promptTemplates`、`prompt_templates`、`templates`、`prompts` 中的标题、prompt、分类、标签和使用次数。</p>
            </article>
          </div>

          <p v-if="legacyImportError" class="sam-config-error settings-page">{{ legacyImportError }}</p>
          <p v-else-if="legacyImportMessage" class="sam-config-success settings-page">{{ legacyImportMessage }}</p>
        </section>
      </aside>

      <section class="sam-settings-panel sam-channel-editor settings-channel">
      <header>
        <div>
          <span>{{ getCapabilityLabel(activeModelCapability) }}</span>
          <h2>编辑渠道</h2>
          <p>{{ activeModelHint }}</p>
        </div>
        <div class="sam-settings-panel-actions">
          <button type="button" @click="createProfile">
            <span class="i-mdi-plus" aria-hidden="true" />
            新增配置
          </button>
          <button type="button" :disabled="isFetchingModelOptions" @click="detectModels">
            <span class="i-mdi-radar" aria-hidden="true" />
            {{ isFetchingModelOptions ? '检测中' : '检测并获取模型' }}
          </button>
          <button type="button" :disabled="!modelDrafts[activeModelCapability].id" @click="setDefaultProfile">
            <span class="i-mdi-check-circle-outline" aria-hidden="true" />
            设为当前生效
          </button>
          <button type="button" @click="deleteProfile">
            <span class="i-mdi-trash-can-outline" aria-hidden="true" />
            删除配置
          </button>
        </div>
      </header>

      <div class="sam-model-profile-list">
        <button
          v-for="profile in activeCapabilityProfiles"
          :key="profile.id"
          type="button"
          :class="{ active: modelDrafts[activeModelCapability].id === profile.id }"
          @click="editProfile(profile)"
        >
          <span>
            <strong>{{ profile.name }}</strong>
            <small>{{ profile.model || '未填写模型名称' }}</small>
          </span>
          <em v-if="profile.isDefault">当前生效</em>
          <em v-else-if="!profile.enabled" class="muted">已停用</em>
        </button>
        <p v-if="!activeCapabilityProfiles.length">
          还没有{{ activeModelCapability === 'text' ? '文本' : '图像' }}模型配置，点击“新增配置”开始。
        </p>
      </div>

      <p v-if="lastError" class="sam-config-error settings-page">{{ lastError }}</p>
      <p v-else-if="lastModelFetchMessage" class="sam-config-success settings-page">{{ lastModelFetchMessage }}</p>
      <p v-else-if="lastModelHealthMessage" class="sam-config-success settings-page">{{ lastModelHealthMessage }}</p>

      <div class="sam-channel-form-grid settings">
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
          <input v-model="modelDrafts[activeModelCapability].baseUrl" placeholder="https://api.example.com/v1" />
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

      <section class="sam-channel-model-list settings">
        <header>
          <div>
            <strong>真实模型列表（{{ modelOptions[activeModelCapability].length }}）</strong>
            <span>已选择 {{ selectedSettingsModelCount }} 个</span>
          </div>
          <div class="sam-channel-model-actions">
            <input v-model="settingsModelOptionSearch" type="search" placeholder="搜索模型" />
            <button type="button" :disabled="!filteredSettingsModelOptions.length" @click="useFirstDetectedModel">选择首个</button>
            <button type="button" :disabled="!modelDrafts[activeModelCapability].model" @click="clearSelectedModel">清空已选</button>
            <button
              class="sam-health-check-button"
              :class="{ checking: isCheckingModelHealth[activeModelCapability] }"
              type="button"
              :disabled="isCheckingModelHealth[activeModelCapability] || !modelOptions[activeModelCapability].length"
              @click="checkModelHealth"
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
            <button type="button" :disabled="isFetchingModelOptions" @click="detectModels">
              <span class="i-mdi-refresh" aria-hidden="true" />
              {{ isFetchingModelOptions ? '获取中' : '获取模型' }}
            </button>
          </div>
        </header>
        <input
          v-model="modelDrafts[activeModelCapability].model"
          class="sam-channel-model-manual"
          :list="`settings-model-options-list-${activeModelCapability}`"
          placeholder="手动输入或从下方选择模型"
        />
        <datalist :id="`settings-model-options-list-${activeModelCapability}`">
          <option v-for="model in modelOptions[activeModelCapability]" :key="model" :value="model" />
        </datalist>
        <div v-if="filteredSettingsModelOptions.length" class="sam-channel-model-grid">
          <button
            v-for="model in filteredSettingsModelOptions"
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

      <label class="sam-settings-toggle">
        <input v-model="modelDrafts[activeModelCapability].enabled" type="checkbox" />
        <span>启用这个{{ activeModelCapability === 'text' ? '文本' : '图像' }}模型配置</span>
      </label>

      <footer>
        <button type="button" class="sam-secondary-action" @click="selectCapability(activeModelCapability)">
          重置未保存修改
        </button>
        <button
          type="button"
          class="sam-secondary-action"
          :disabled="!modelDrafts[activeModelCapability].id"
          @click="setDefaultProfile"
        >
          设为当前生效
        </button>
        <button type="button" class="sam-primary-action" :disabled="isLoadingProfiles" @click="saveProfile">
          {{ isLoadingProfiles ? '保存中' : '保存配置' }}
        </button>
      </footer>
      </section>
    </div>
  </section>
</template>
