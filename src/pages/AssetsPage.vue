<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import {
  canDownloadAsset,
  canPreviewAsset,
  canUseAssetAsReference,
  resolveAssetPreviewSrc,
  useAssetStore,
  type AssetKindFilter,
  type CreativeAsset,
} from '../stores/assetStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

const assetStore = useAssetStore()
const workspaceStore = useWorkspaceStore()
const {
  creativeAssets,
  filteredCreativeAssets,
  kindFilter,
  favoriteOnly,
  searchQuery: assetSearchQuery,
  modelFilter: assetModelFilter,
  workflowFilter: assetWorkflowFilter,
  selectedAssetIds,
  selectedCreativeAssets,
  selectedAssetCount,
  isLoadingAssets,
  lastAssetError,
} = storeToRefs(assetStore)
const selectedAsset = ref<CreativeAsset | null>(null)
const pageMessage = ref('')

const assetKindOptions: Array<{ value: AssetKindFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'icon', label: 'ICON' },
  { value: 'storyboard_frame', label: '分镜' },
  { value: 'reference', label: '参考图' },
  { value: 'pdf', label: 'PDF' },
  { value: 'zip', label: 'ZIP' },
]
const workflowLabels: Record<string, string> = {
  daily: '日常生图',
  img2img: '图生图',
  icon: 'ICON',
  storyboard: '分镜',
  batch: '批量生成',
  compare: '多模型对比',
}

const assetModelOptions = computed(() =>
  Array.from(new Set(creativeAssets.value.map(asset => asset.modelProfileId).filter(Boolean))).sort()
)
const assetWorkflowOptions = computed(() =>
  Array.from(new Set(creativeAssets.value.map(asset => asset.workflowId).filter(Boolean))).sort()
)
const selectedAssetIdSet = computed(() => new Set(selectedAssetIds.value))
const visibleAssetIds = computed(() => filteredCreativeAssets.value.map(asset => asset.id))
const allVisibleAssetsSelected = computed(
  () => visibleAssetIds.value.length > 0 && visibleAssetIds.value.every(id => selectedAssetIdSet.value.has(id))
)

onMounted(() => {
  void assetStore.loadAssets()
})

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

function getWorkflowLabel(workflow: string | undefined) {
  return workflow ? workflowLabels[workflow] ?? workflow : '未记录'
}

function getAssetDetail(asset: CreativeAsset) {
  return [asset.modelProfileId, asset.width && asset.height ? `${asset.width}x${asset.height}` : '', asset.promptText]
    .filter(Boolean)
    .join(' · ')
}

function openAssetDetail(asset: CreativeAsset) {
  selectedAsset.value = asset
}

function closeAssetDetail() {
  selectedAsset.value = null
}

function toggleVisibleAssetSelection() {
  const visibleIds = new Set(visibleAssetIds.value)
  if (allVisibleAssetsSelected.value) {
    assetStore.selectAssetIds(selectedAssetIds.value.filter(id => !visibleIds.has(id)))
    return
  }
  assetStore.selectAssetIds([...selectedAssetIds.value, ...visibleAssetIds.value])
}

async function copyAssetPrompt(asset: CreativeAsset) {
  if (!asset.promptText?.trim()) {
    return
  }
  try {
    await navigator.clipboard?.writeText(asset.promptText)
    pageMessage.value = '已复制资产提示词'
  } catch {
    pageMessage.value = '当前环境不支持复制'
  }
}

function reuseAssetPrompt(asset: CreativeAsset) {
  if (!asset.promptText?.trim()) {
    pageMessage.value = '这个资产没有可复用的提示词'
    return
  }
  workspaceStore.replacePromptText(asset.promptText)
  pageMessage.value = '已套用资产提示词到工作台'
  if (typeof window !== 'undefined') {
    window.location.hash = ''
  }
}

function useAssetAsReference(asset: CreativeAsset) {
  if (!canUseAssetAsReference(asset)) {
    pageMessage.value = '这个资产不能作为参考图'
    return
  }
  const previewUri = resolveAssetPreviewSrc(asset)
  workspaceStore.addReferenceImages([
    {
      id: `asset-ref-${asset.id}`,
      name: asset.promptText?.slice(0, 24) || asset.id,
      uri: asset.uri,
      previewUri: previewUri || undefined,
      size: 0,
    },
  ])
  pageMessage.value = '已添加为工作台参考图'
  if (typeof window !== 'undefined') {
    window.location.hash = ''
  }
}

function toggleAssetFavorite(asset: CreativeAsset) {
  void assetStore.toggleAssetFavorite(asset.id)
}

async function downloadAsset(asset: CreativeAsset) {
  if (!canDownloadAsset(asset)) {
    pageMessage.value = '这个资产没有可下载的 URI'
    return
  }
  try {
    const savedPath = await assetStore.downloadAssetWithDialog(asset.id)
    pageMessage.value = savedPath
      ? `已保存到 ${savedPath}`
      : savedPath === null
        ? '已取消保存'
        : assetStore.lastAssetError || '资产保存失败'
  } catch (error) {
    pageMessage.value = error instanceof Error ? error.message : String(error || '资产保存失败')
  }
}

function deleteAsset(asset: CreativeAsset) {
  void assetStore.deleteAsset(asset.id)
  if (selectedAsset.value?.id === asset.id) {
    selectedAsset.value = null
  }
  pageMessage.value = '已删除资产记录'
}

async function exportIconPackage(asset: CreativeAsset) {
  const exported = await assetStore.exportIconPackage(asset.id)
  if (exported) {
    pageMessage.value = '已导出 ICON 图标包并写入资产库'
    selectedAsset.value = exported
  }
}

async function copySelectedPrompts() {
  const prompts = selectedCreativeAssets.value
    .map(asset => asset.promptText?.trim())
    .filter((prompt): prompt is string => Boolean(prompt))
  if (!prompts.length) {
    pageMessage.value = '选中的资产没有可复制的提示词'
    return
  }
  try {
    await navigator.clipboard?.writeText(prompts.join('\n\n---\n\n'))
    pageMessage.value = `已复制 ${prompts.length} 条提示词`
  } catch {
    pageMessage.value = '当前环境不支持复制'
  }
}

async function deleteSelectedAssets() {
  const ids = [...selectedAssetIds.value]
  if (!ids.length) {
    return
  }
  await assetStore.deleteAssets(ids)
  if (selectedAsset.value && ids.includes(selectedAsset.value.id)) {
    selectedAsset.value = null
  }
  pageMessage.value = `已删除 ${ids.length} 条资产记录`
}
</script>

<template>
  <section class="sam-assets-page">
    <header class="sam-assets-hero">
      <div>
        <span class="sam-eyebrow">资产库</span>
        <h1>统一管理图片、ICON、分镜帧和导出文件</h1>
        <p>搜索、筛选、收藏、复制提示词和删除记录都在这里完成。</p>
      </div>
      <button type="button" :disabled="isLoadingAssets" @click="assetStore.loadAssets">
        <span class="i-mdi-refresh" aria-hidden="true" />
        {{ isLoadingAssets ? '刷新中' : '刷新' }}
      </button>
    </header>

    <section class="sam-assets-toolbar">
      <input
        v-model="assetSearchQuery"
        type="search"
        placeholder="搜索提示词、模型、标签、文件 URI"
        @input="assetStore.setSearchQuery(assetSearchQuery)"
      />
      <select v-model="assetModelFilter" @change="assetStore.setModelFilter(assetModelFilter)">
        <option value="all">全部模型</option>
        <option v-for="model in assetModelOptions" :key="model" :value="model">{{ model }}</option>
      </select>
      <select v-model="assetWorkflowFilter" @change="assetStore.setWorkflowFilter(assetWorkflowFilter)">
        <option value="all">全部工作流</option>
        <option v-for="workflow in assetWorkflowOptions" :key="workflow" :value="workflow">
          {{ getWorkflowLabel(workflow) }}
        </option>
      </select>
      <button type="button" :class="{ active: favoriteOnly }" @click="assetStore.setFavoriteOnly(!favoriteOnly)">
        收藏
      </button>
    </section>

    <div class="sam-filter-pills asset-page">
      <button
        v-for="option in assetKindOptions"
        :key="option.value"
        type="button"
        :class="{ active: kindFilter === option.value }"
        @click="assetStore.setKindFilter(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <section v-if="filteredCreativeAssets.length || selectedAssetCount" class="sam-assets-bulkbar">
      <div>
        <strong>{{ selectedAssetCount ? `已选择 ${selectedAssetCount} 项` : '批量管理' }}</strong>
        <span>{{ filteredCreativeAssets.length }} 项匹配当前筛选</span>
      </div>
      <div>
        <button type="button" :disabled="!filteredCreativeAssets.length" @click="toggleVisibleAssetSelection">
          {{ allVisibleAssetsSelected ? '取消当前筛选' : '全选当前筛选' }}
        </button>
        <button type="button" :disabled="!selectedAssetCount" @click="copySelectedPrompts">复制提示词</button>
        <button type="button" :disabled="!selectedAssetCount" @click="deleteSelectedAssets">批量删除</button>
        <button type="button" :disabled="!selectedAssetCount" @click="assetStore.clearSelectedAssets">清空选择</button>
      </div>
    </section>

    <p v-if="pageMessage" class="sam-workspace-message">{{ pageMessage }}</p>
    <p v-if="lastAssetError" class="sam-config-error assets-page">{{ lastAssetError }}</p>

    <section v-if="filteredCreativeAssets.length" class="sam-assets-grid">
      <article
        v-for="asset in filteredCreativeAssets"
        :key="asset.id"
        class="sam-asset-card"
        :class="{ selected: selectedAssetIdSet.has(asset.id) }"
      >
        <button class="sam-asset-card-preview" type="button" @click="openAssetDetail(asset)">
          <img
            v-if="canPreviewAsset(asset)"
            :src="resolveAssetPreviewSrc(asset)"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span v-else class="i-mdi-image-outline" aria-hidden="true" />
        </button>
        <div class="sam-asset-card-body">
          <div class="sam-result-heading">
            <label class="sam-asset-select" @click.stop>
              <input
                type="checkbox"
                :checked="selectedAssetIdSet.has(asset.id)"
                :aria-label="`选择${getAssetTitle(asset)}`"
                @change="assetStore.toggleAssetSelection(asset.id)"
              />
            </label>
            <strong>{{ getAssetTitle(asset) }}</strong>
            <button
              type="button"
              :aria-label="asset.favorite ? '取消收藏' : '收藏'"
              @click="toggleAssetFavorite(asset)"
            >
              <span :class="asset.favorite ? 'i-mdi-star' : 'i-mdi-star-outline'" aria-hidden="true" />
            </button>
          </div>
          <p>{{ getAssetDetail(asset) || asset.uri }}</p>
          <div class="sam-asset-actions">
            <button type="button" @click="openAssetDetail(asset)">详情</button>
            <button type="button" @click="reuseAssetPrompt(asset)">再次生成</button>
            <button type="button" @click="useAssetAsReference(asset)">作为参考图</button>
            <button type="button" @click="downloadAsset(asset)">下载</button>
            <button type="button" @click="copyAssetPrompt(asset)">复制提示词</button>
            <button v-if="asset.kind === 'icon'" type="button" @click="exportIconPackage(asset)">导出包</button>
            <button type="button" @click="deleteAsset(asset)">删除</button>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="sam-assets-empty">
      <span class="i-mdi-image-search-outline" aria-hidden="true" />
      <p>还没有匹配的资产。生成成功后的图片会自动进入资产库。</p>
    </section>

    <div v-if="selectedAsset" class="sam-modal-backdrop" role="presentation" @click.self="closeAssetDetail">
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
              v-if="canPreviewAsset(selectedAsset)"
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
              <dt>模型</dt>
              <dd>{{ selectedAsset.modelProfileId || '未记录' }}</dd>
            </div>
            <div>
              <dt>工作流</dt>
              <dd>{{ getWorkflowLabel(selectedAsset.workflowId) }}</dd>
            </div>
            <div>
              <dt>URI</dt>
              <dd>{{ selectedAsset.uri }}</dd>
            </div>
          </dl>
        </div>

        <footer class="sam-model-modal-footer sam-asset-detail-footer">
          <button class="sam-secondary-action" type="button" @click="reuseAssetPrompt(selectedAsset)">再次生成</button>
          <button class="sam-secondary-action" type="button" @click="useAssetAsReference(selectedAsset)">
            作为参考图
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
  </section>
</template>
