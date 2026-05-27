<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, onMounted } from 'vue'
import { createPromptMarketTemplateJson } from '../data/promptMarketTemplate'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  getPromptUseCaseLabel,
  promptSourceOptions,
  promptUseCaseOptions,
  usePromptMarketStore,
  type SyncablePromptSource,
} from '../stores/promptMarketStore'
import type { PromptAsset } from '../utils/promptMarket'

const promptMarketStore = usePromptMarketStore()
const workspaceStore = useWorkspaceStore()
const {
  sourceFilter,
  useCaseFilter,
  favoriteOnly,
  searchQuery,
  filteredPromptAssets,
  isLoadingPrompts,
  isSyncingPrompts,
  lastImportError,
  lastSyncMessage,
} = storeToRefs(promptMarketStore)
const importFileInput = ref<HTMLInputElement | null>(null)
const pageMessage = ref('')
const promptMetaLabelMap: Record<string, string> = {
  txt2img: '文生图',
  img2img: '图生图',
  icon: 'ICON',
  storyboard: '分镜',
  reference: '参考',
  workflow: '工作流',
}

onMounted(() => {
  void promptMarketStore.loadPromptAssets()
})

function getPromptSourceLabel(source: PromptAsset['source']) {
  return promptSourceOptions.find((item) => item.value === source)?.label ?? source
}

function getPromptTagLabel(tag: string) {
  return promptMetaLabelMap[tag.trim().toLowerCase()] ?? tag
}

function getPromptDisplayTags(item: PromptAsset) {
  const useCaseLabels = new Set(item.useCases.map(useCase => getPromptUseCaseLabel(useCase)))
  return item.tags.filter(tag => !useCaseLabels.has(getPromptTagLabel(tag))).slice(0, 3)
}

function triggerImport() {
  importFileInput.value?.click()
}

async function importPromptFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  const count = await promptMarketStore.importPromptJsonText(await file.text())
  if (count > 0) {
    pageMessage.value = `已导入 ${count} 条提示词`
    promptMarketStore.setSourceFilter('custom_json')
  }
  input.value = ''
}

function downloadTemplate() {
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

async function syncSource(source: SyncablePromptSource) {
  const count = await promptMarketStore.syncPromptSource(source)
  if (count > 0) {
    pageMessage.value = `已同步 ${count} 条提示词`
  }
}

async function copyPrompt(item: PromptAsset) {
  try {
    await navigator.clipboard?.writeText(item.content)
    pageMessage.value = '已复制提示词'
    void promptMarketStore.markPromptUsed(item.id)
  } catch {
    pageMessage.value = '当前环境不支持复制'
  }
}

function replaceWorkspacePrompt(item: PromptAsset) {
  workspaceStore.replacePromptText(item.content)
  pageMessage.value = '已覆盖工作台提示词'
  void promptMarketStore.markPromptUsed(item.id)
}

function insertWorkspacePrompt(item: PromptAsset) {
  workspaceStore.insertPromptText(item.content)
  pageMessage.value = '已插入到工作台提示词'
  void promptMarketStore.markPromptUsed(item.id)
}
</script>

<template>
  <section class="sam-prompts-page">
    <header class="sam-prompts-hero">
      <div>
        <span class="sam-eyebrow">提示词市场</span>
        <h1>统一管理生图、ICON、分镜和工作流提示词</h1>
        <p>内置离线快照、GitHub 手动同步、自定义 JSON 导入和模板下载都在这里完成。</p>
      </div>
      <div>
        <button type="button" @click="triggerImport">
          <span class="i-mdi-file-import-outline" aria-hidden="true" />
          导入 JSON
        </button>
        <button type="button" @click="downloadTemplate">
          <span class="i-mdi-download-outline" aria-hidden="true" />
          下载模板
        </button>
      </div>
      <input
        ref="importFileInput"
        class="sam-hidden-file"
        type="file"
        accept="application/json,.json"
        @change="importPromptFile"
      />
    </header>

    <section class="sam-prompts-toolbar">
      <input
        v-model="searchQuery"
        type="search"
        placeholder="搜索标题、内容、标签、用途、作者"
        @input="promptMarketStore.setSearchQuery(searchQuery)"
      />
      <select v-model="sourceFilter" @change="promptMarketStore.setSourceFilter(sourceFilter)">
        <option v-for="source in promptSourceOptions" :key="source.value" :value="source.value">
          {{ source.label }}
        </option>
      </select>
      <select v-model="useCaseFilter" @change="promptMarketStore.setUseCaseFilter(useCaseFilter)">
        <option v-for="useCase in promptUseCaseOptions" :key="useCase.value" :value="useCase.value">
          {{ useCase.label }}
        </option>
      </select>
      <button type="button" :disabled="isLoadingPrompts" @click="promptMarketStore.loadPromptAssets">
        {{ isLoadingPrompts ? '刷新中' : '刷新' }}
      </button>
      <button
        type="button"
        :class="{ active: favoriteOnly }"
        @click="promptMarketStore.setFavoriteOnly(!favoriteOnly)"
      >
        仅看收藏
      </button>
    </section>

    <section class="sam-prompts-syncbar">
      <span>{{ filteredPromptAssets.length }} 条匹配结果</span>
      <div>
        <button type="button" :disabled="isSyncingPrompts" @click="syncSource('glidea')">同步 glidea</button>
        <button type="button" :disabled="isSyncingPrompts" @click="syncSource('evolink')">同步 EvoLinkAI</button>
      </div>
    </section>

    <p v-if="lastImportError" class="sam-config-error prompts-page">{{ lastImportError }}</p>
    <p v-else-if="pageMessage || lastSyncMessage" class="sam-workspace-message prompts-page">
      {{ pageMessage || lastSyncMessage }}
    </p>

    <section v-if="filteredPromptAssets.length" class="sam-prompts-grid">
      <article v-for="item in filteredPromptAssets" :key="item.id" class="sam-prompt-market-card">
        <small>{{ getPromptSourceLabel(item.source) }}</small>
        <strong>{{ item.title }}</strong>
        <p>{{ item.content }}</p>
        <div class="sam-prompt-card-meta">
          <span v-for="useCase in item.useCases" :key="useCase">{{ getPromptUseCaseLabel(useCase) }}</span>
          <span v-for="tag in getPromptDisplayTags(item)" :key="tag">{{ getPromptTagLabel(tag) }}</span>
        </div>
        <footer>
          <span>使用 {{ item.usageCount }}</span>
          <div class="sam-prompt-card-actions">
            <button
              type="button"
              :title="item.favorite ? '取消收藏' : '收藏'"
              :aria-label="item.favorite ? '取消收藏' : '收藏'"
              @click="promptMarketStore.togglePromptFavorite(item.id)"
            >
              {{ item.favorite ? '已收藏' : '收藏' }}
            </button>
            <button type="button" title="插入到工作台" aria-label="插入到工作台" @click="insertWorkspacePrompt(item)">
              插入
            </button>
            <button type="button" title="覆盖工作台" aria-label="覆盖工作台" @click="replaceWorkspacePrompt(item)">
              覆盖
            </button>
            <button type="button" title="复制提示词" aria-label="复制提示词" @click="copyPrompt(item)">复制</button>
          </div>
        </footer>
      </article>
    </section>

    <section v-else class="sam-prompts-empty">
      <span class="i-mdi-store-search-outline" aria-hidden="true" />
      <p>没有匹配的提示词。可以调整筛选，或导入自定义 JSON。</p>
    </section>
  </section>
</template>
