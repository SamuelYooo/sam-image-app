<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Eye, FolderOpen, RotateCcw, Search, Star, Trash2, ZoomIn } from 'lucide-vue-next'
import { getAvailableIcoExportSizes, getExportFormatOptions, defaultIconProjectName, iconExportFormatOptions, iconSizePresets, modeLabels } from '@/data/catalog'
import type { IconExportKind } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/tauri'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask } from '@/types/domain'

type ExportSource = 'original' | 'adjusted'
type PreviewFilterId = 'none' | 'soft' | 'warm' | 'cool' | 'mono' | 'cinematic'

type PreviewFilterOption = {
  value: PreviewFilterId
  label: string
  cssFilter: string
  canvasFilter: string
}

const router = useRouter()
const store = useAppStore()
const search = ref('')
const filter = ref<'all' | GenerationMode>('all')
const sortMode = ref<'newest' | 'oldest' | 'model'>('newest')
const favoritesOnly = ref(false)
const visibleCount = ref(8)
const selected = ref<{ task: GenerationTask; asset: GeneratedAsset } | null>(null)
const exportOpen = ref<'selected' | 'all' | null>(null)
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)
const exportSource = ref<ExportSource>('original')
const viewerOpen = ref(false)
const viewerZoom = ref(1)
const selectedIcoExportSizes = ref<number[]>([])
const iconExportKind = ref<IconExportKind>('ico')
const iconProjectName = ref(defaultIconProjectName())
const isIconSelected = computed(() => selected.value?.task.mode === 'icon')
const historyExportButtonLabel = computed(() => {
  if (exportOpen.value === 'all') return '确认导出全部'
  if (isIconSelected.value) {
    const labels: Record<IconExportKind, string> = { png: '导出 PNG', ico: '导出 ICO' }
    return labels[iconExportKind.value]
  }
  return '确认导出'
})
const previewFilter = ref<PreviewFilterId>('none')
const previewFilters: PreviewFilterOption[] = [
  { value: 'none', label: '原图', cssFilter: 'none', canvasFilter: 'none' },
  { value: 'soft', label: '柔和', cssFilter: 'contrast(0.98) saturate(1.06) brightness(1.02)', canvasFilter: 'contrast(0.98) saturate(1.06) brightness(1.02)' },
  { value: 'warm', label: '暖色', cssFilter: 'sepia(0.18) saturate(1.16) contrast(1.03)', canvasFilter: 'sepia(0.18) saturate(1.16) contrast(1.03)' },
  { value: 'cool', label: '冷色', cssFilter: 'hue-rotate(185deg) saturate(1.12) contrast(1.02)', canvasFilter: 'hue-rotate(185deg) saturate(1.12) contrast(1.02)' },
  { value: 'mono', label: '黑白', cssFilter: 'grayscale(1) contrast(1.08)', canvasFilter: 'grayscale(1) contrast(1.08)' },
  { value: 'cinematic', label: '电影感', cssFilter: 'contrast(1.08) saturate(0.96) brightness(0.98)', canvasFilter: 'contrast(1.08) saturate(0.96) brightness(0.98)' },
]
const selectedPreviewFilter = computed(() => previewFilters.find((item) => item.value === previewFilter.value) ?? previewFilters[0])
const availableExportFormatOptions = computed(() => {
  if (exportOpen.value === 'selected') {
    const current = selected.value
    if (!current) return getExportFormatOptions()
    if (isIconSelected.value) return iconExportFormatOptions
    return getSelectedExportFormatOptions(current)
  }
  return getExportFormatOptions()
})
const availableIcoExportSizes = computed(() => {
  if (exportOpen.value === 'all') return [...iconSizePresets]
  const asset = selected.value?.asset
  if (!asset) return [...iconSizePresets]
  const maxSide = Math.max(16, Math.min(asset.width, asset.height))
  return getAvailableIcoExportSizes(maxSide)
})

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.historyTasks.filter((task) => {
    if (filter.value !== 'all' && task.mode !== filter.value) return false
    // 只看收藏模式：要求 task 内至少有 1 张 asset.isFavorite 的图片
    if (favoritesOnly.value && !task.assets.some((asset) => asset.isFavorite)) return false
    if (!keyword) return true
    return `${task.prompt} ${task.modelId} ${task.style}`.toLowerCase().includes(keyword)
  })
})

const sortedTasks = computed(() => {
  return filteredTasks.value.slice().sort((a, b) => {
    if (sortMode.value === 'oldest') return a.createdAt.localeCompare(b.createdAt)
    if (sortMode.value === 'model') {
      const modelOrder = a.modelId.localeCompare(b.modelId)
      return modelOrder || b.createdAt.localeCompare(a.createdAt)
    }
    return b.createdAt.localeCompare(a.createdAt)
  })
})

const visibleEntries = computed(() => {
  // "只看收藏" 模式：只显示被收藏的 asset，不显示未收藏的
  return sortedTasks.value
    .flatMap((task) => task.assets
      .filter((asset) => favoritesOnly.value ? asset.isFavorite : true)
      .map((asset) => ({ task, asset })))
    .slice(0, visibleCount.value)
})
const hasMoreTasks = computed(() => {
  const total = sortedTasks.value.reduce((sum, task) => {
    const count = favoritesOnly.value
      ? task.assets.filter((asset) => asset.isFavorite).length
      : task.assets.length
    return sum + count
  }, 0)
  return visibleEntries.value.length < total
})

const stats = computed(() => ({
  total: store.historyAssetCount,
  today: store.historyTasks.filter((task) => new Date(task.createdAt).toDateString() === new Date().toDateString()).reduce((sum, task) => sum + task.assets.length, 0),
  favorites: store.favoriteAssets.length,
}))

watch([search, filter, sortMode], () => {
  visibleCount.value = 8
})

watch([exportOpen, exportFormat, selected], () => {
  if (!exportOpen.value) return
  // ICON 资产使用 iconExportKind，不走 exportFormat 自动修正
  if (isIconSelected.value && exportOpen.value === 'selected') return
  if (!availableExportFormatOptions.value.some((option) => option.value === exportFormat.value)) {
    exportFormat.value = (availableExportFormatOptions.value[0]?.value ?? 'png') as ExportFormat
  }
  if (exportFormat.value !== 'ico') return
  const allowed = new Set<number>(availableIcoExportSizes.value.map((preset) => preset.width))
  const next = selectedIcoExportSizes.value.filter((size) => allowed.has(size))
  selectedIcoExportSizes.value = next.length ? next : availableIcoExportSizes.value.map((preset) => preset.width)
})

watch([selected, previewFilter], () => {
  if (!selected.value) return
  if (selected.value.asset.format === 'gif' || selected.value.task.mode === 'gif') {
    if (exportSource.value === 'adjusted') exportSource.value = 'original'
    return
  }
  if (previewFilter.value === 'none' && exportSource.value === 'adjusted') {
    exportSource.value = 'original'
  }
})

const selectedPreviewStyle = computed(() => ({
  filter: selectedPreviewFilter.value.cssFilter,
}))

const viewerImageStyle = computed(() => ({
  filter: selectedPreviewFilter.value.cssFilter,
  width: `${Math.round(viewerZoom.value * 100)}%`,
  maxWidth: 'none',
  maxHeight: 'none',
}))

const selectedAssetSizeLabel = computed(() => {
  if (!selected.value) return ''
  const area = (selected.value.asset.width * selected.value.asset.height) / 1_000_000
  return `${selected.value.asset.width} x ${selected.value.asset.height} · ${area.toFixed(2)} MP`
})

function isGifEntry(task: GenerationTask, asset: GeneratedAsset): boolean {
  return task.mode === 'gif' || asset.format === 'gif'
}

function isIconEntry(task: GenerationTask): boolean {
  return task.mode === 'icon'
}

function getSelectedExportFormatOptions(entry: { task: GenerationTask; asset: GeneratedAsset }): Array<{ value: ExportFormat; label: string }> {
  const options = getExportFormatOptions(entry.task.mode)
  if (isGifEntry(entry.task, entry.asset)) return options.filter((option) => option.value === 'gif')

  const rasterValues = new Set<ExportFormat>(['png', 'jpg', 'webp'])
  return options.filter((option) => rasterValues.has(option.value) || (isIconEntry(entry.task) && option.value === 'ico'))
}

function canExportAdjustedEntry(entry: { task: GenerationTask; asset: GeneratedAsset } | null): boolean {
  if (!entry) return false
  if (isGifEntry(entry.task, entry.asset)) return false
  return selectedPreviewFilter.value.value !== 'none'
}

function openImageViewer(): void {
  if (!selected.value) return
  viewerZoom.value = 1
  viewerOpen.value = true
}

function closeImageViewer(): void {
  viewerOpen.value = false
  viewerZoom.value = 1
}

function adjustViewerZoom(delta: number): void {
  viewerZoom.value = Math.min(4, Math.max(0.5, Number((viewerZoom.value + delta).toFixed(2))))
}

function reusePrompt(task: GenerationTask): void {
  store.setActivePrompt(task.prompt)
  router.push({
    path: '/workspace',
    query: {
      mode: task.mode,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      modelId: task.modelId,
      width: String(task.width),
      height: String(task.height),
      batchSize: String(task.batchSize),
      steps: String(task.steps),
      seed: String(task.seed),
      style: task.style,
      modeOptions: JSON.stringify(task.modeOptions ?? {}),
    },
  })
}

function retryTask(task: GenerationTask): void {
  store.setActivePrompt(task.prompt)
  router.push({
    path: '/workspace',
    query: {
      retryTaskId: task.id,
      mode: task.mode,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      modelId: task.modelId,
      width: String(task.width),
      height: String(task.height),
      batchSize: String(task.batchSize),
      steps: String(task.steps),
      seed: String(task.seed),
      style: task.style,
      modeOptions: JSON.stringify(task.modeOptions ?? {}),
    },
  })
}

function clearHistory(): void {
  if (!window.confirm('确定清空资产库？此操作不可恢复。')) return
  store.clearHistory()
}

async function deleteAsset(task: GenerationTask, asset: GeneratedAsset, closeDetail = false): Promise<void> {
  if (!window.confirm('确定删除这张图片？此操作不可恢复。')) return
  await store.removeGeneratedAsset(task.id, asset.id)
  if (closeDetail || selected.value?.asset.id === asset.id) {
    selected.value = null
    if (exportOpen.value === 'selected') exportOpen.value = null
  }
}

function openHistoryExport(): void {
  if (isIconSelected.value) {
    iconExportKind.value = 'ico'
    iconProjectName.value = defaultIconProjectName()
  } else {
    const options = selected.value ? getSelectedExportFormatOptions(selected.value) : getExportFormatOptions()
    exportFormat.value = options.some((option) => option.value === store.settings.defaultExportFormat)
      ? store.settings.defaultExportFormat
      : options[0]?.value ?? 'png'
  }
  exportSource.value = 'original'
  selectedIcoExportSizes.value = availableIcoExportSizes.value.map((preset) => preset.width)
  exportOpen.value = 'selected'
}

function openAllHistoryExport(): void {
  const options = getExportFormatOptions()
  exportFormat.value = options.some((option) => option.value === store.settings.defaultExportFormat)
    ? store.settings.defaultExportFormat
    : options[0]?.value ?? 'png'
  selectedIcoExportSizes.value = iconSizePresets.map((preset) => preset.width)
  exportOpen.value = 'all'
}

function loadMore(): void {
  visibleCount.value += 8
}

async function chooseHistoryExportDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.saveSettings({ defaultOutputDir: directory })
  store.notify(`已选择导出目录：${directory}`)
}

async function confirmHistoryExport(): Promise<void> {
  // ICON 资产使用独立的格式体系
  if (isIconSelected.value && exportOpen.value === 'selected') {
    if (iconExportKind.value === 'ico' && !selectedIcoExportSizes.value.length) {
      store.notify('请至少勾选一个导出尺寸', 'error')
      return
    }
    if (iconExportKind.value === 'png') {
      await store.downloadAsset(selected.value!.asset, 'png', 1, selected.value!.task, { customTitle: iconProjectName.value })
    } else if (iconExportKind.value === 'ico') {
      await store.downloadIconBundle(selected.value!.asset, selectedIcoExportSizes.value, iconProjectName.value)
    }
    exportOpen.value = null
    return
  }

  if (exportFormat.value === 'ico' && !selectedIcoExportSizes.value.length) {
    store.notify('请至少勾选一个 ICO 导出尺寸', 'error')
    return
  }

  if (exportOpen.value === 'all') {
    await store.downloadAllAssets(
      exportFormat.value,
      exportFormat.value === 'ico' ? { iconSizes: selectedIcoExportSizes.value } : undefined,
    )
    exportOpen.value = null
    return
  }
  if (!selected.value) return
  const adjusted = exportSource.value === 'adjusted' && canExportAdjustedEntry(selected.value)
  if (exportSource.value === 'adjusted' && !adjusted) {
    store.notify('当前图片不支持导出调整后版本，请改为导出原图', 'error')
    return
  }
  await store.downloadAsset(
    selected.value.asset,
    exportFormat.value,
    1,
    selected.value.task,
    exportFormat.value === 'ico'
      ? { iconSizes: selectedIcoExportSizes.value }
      : adjusted
        ? { canvasFilter: selectedPreviewFilter.value.canvasFilter, titleSuffix: '-filtered' }
        : undefined,
  )
  exportOpen.value = null
}
</script>

<template>
  <div class="page-wide">
    <div class="page-header">
      <div>
        <p class="page-kicker">Asset Library</p>
        <h1 class="page-title">资产库</h1>
        <p class="page-desc">管理所有本地生成资源，筛选、复用提示词、导出或删除单张图片。</p>
      </div>
      <div class="btn-row">
        <button class="btn-soft" type="button" @click="openAllHistoryExport">
          <Download :size="16" />
          导出全部
        </button>
        <button class="btn-danger" type="button" @click="clearHistory">
          <Trash2 :size="16" />
          清空资产库
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <Search :size="16" />
        <input v-model="search" placeholder="搜索提示词、模型、风格…" />
      </div>
      <button class="filter-chip" :class="{ active: filter === 'all' }" type="button" @click="filter = 'all'">全部</button>
      <button v-for="(label, key) in modeLabels" :key="key" class="filter-chip" :class="{ active: filter === key }" type="button" @click="filter = key as GenerationMode">
        {{ label }}
      </button>
      <div class="sort-box">
        <label for="history-sort">排序</label>
        <select id="history-sort" v-model="sortMode">
          <option value="newest">最新优先</option>
          <option value="oldest">最早优先</option>
          <option value="model">按模型</option>
        </select>
      </div>
      <label class="favorites-toggle" :class="{ active: favoritesOnly }">
        <input v-model="favoritesOnly" type="checkbox" />
        <Star :size="14" :fill="favoritesOnly ? 'currentColor' : 'none'" />
        只看收藏
      </label>
    </div>

    <div class="stats-row">
      <div class="stat-card"><strong>{{ stats.total }} 张</strong><span>共生成</span></div>
      <div class="stat-card"><strong>{{ stats.today }} 张</strong><span>今日生成</span></div>
      <div class="stat-card"><strong>{{ stats.favorites }} 条</strong><span>已收藏</span></div>
    </div>

    <div v-if="sortedTasks.length">
      <div class="image-grid">
        <article v-for="entry in visibleEntries" :key="entry.asset.id" class="history-card" :class="{ 'history-card-fav': entry.asset.isFavorite }">
          <button
            class="favorite-button"
            :class="{ active: entry.asset.isFavorite }"
            type="button"
            :aria-label="entry.asset.isFavorite ? '取消收藏' : '收藏'"
            :title="`${entry.asset.isFavorite ? '取消收藏' : '收藏'} ${entry.task.prompt}`"
            @click="store.toggleAssetFavorite(entry.asset.id)"
          >
            <Star :size="15" :fill="entry.asset.isFavorite ? 'currentColor' : 'none'" />
          </button>
          <button
            class="delete-button"
            type="button"
            :aria-label="`删除图片 ${entry.asset.title}`"
            :title="`删除图片 ${entry.asset.title}`"
            @click.stop="deleteAsset(entry.task, entry.asset)"
          >
            <Trash2 :size="15" />
          </button>
          <button
            class="image-card"
            type="button"
            @click="selected = { task: entry.task, asset: entry.asset }"
          >
            <span class="art-preview thumb"><img :src="entry.asset.dataUrl" :alt="entry.asset.title" /></span>
            <span class="image-info">
              <span class="mode-chip">{{ modeLabels[entry.task.mode] }}</span>
              <strong>{{ entry.task.prompt }}</strong>
              <small>
                {{ new Date(entry.task.createdAt).toLocaleString() }} · {{ entry.asset.width }} x {{ entry.asset.height }}
                <span v-if="entry.task.status === 'failed'" class="status-text error"> · 失败</span>
              </small>
            </span>
          </button>
        </article>
      </div>
      <div v-if="hasMoreTasks" class="load-more-row">
        <button class="btn-soft" type="button" @click="loadMore">加载更多</button>
      </div>
    </div>
    <div v-else class="empty-state card">
      <strong>暂无资产</strong>
      <span>在工作台生成结果后会自动进入资产库。</span>
    </div>

    <div v-if="selected" class="modal-overlay" @click.self="selected = null">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>生成详情</h2>
            <p class="muted">查看结果信息，复用提示词或导出到本地。</p>
          </div>
          <button class="btn-icon" type="button" @click="selected = null">×</button>
        </div>
        <div class="modal-body detail-grid">
          <div class="detail-preview-wrap">
            <button class="detail-preview-button" type="button" @click="openImageViewer">
              <img :src="selected.asset.dataUrl" :alt="selected.asset.title" :style="selectedPreviewStyle" />
              <span>
                <ZoomIn :size="15" />
                放大查看
              </span>
            </button>
            <div class="detail-preview-meta">
              <span>{{ selected.asset.format.toUpperCase() }}</span>
              <span>{{ selectedAssetSizeLabel }}</span>
              <span>{{ modeLabels[selected.task.mode] }}</span>
            </div>
          </div>
          <div class="stack">
            <div class="detail-row"><span>生成类型</span><strong>{{ modeLabels[selected.task.mode] }}</strong></div>
            <div class="detail-row"><span>模型</span><strong>{{ selected.task.modelId }}</strong></div>
            <div class="detail-row"><span>尺寸</span><strong>{{ selected.asset.width }} x {{ selected.asset.height }}</strong></div>
            <div class="detail-row"><span>状态</span><strong :class="{ 'status-error': selected.task.status === 'failed' }">{{ selected.task.status === 'failed' ? '失败' : selected.task.status === 'completed' ? '完成' : selected.task.status }}</strong></div>
            <div class="field">
              <label>滤镜预览</label>
              <div class="filter-chip-row">
                <button
                  v-for="item in previewFilters"
                  :key="item.value"
                  class="filter-chip"
                  :class="{ active: previewFilter === item.value }"
                  type="button"
                  @click="previewFilter = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div v-if="selected.task.mode === 'gif' || selected.asset.format === 'gif'" class="prompt-box info-box">
              GIF 动图保持原图导出，不提供调整后版本。
            </div>
            <div v-else class="field">
              <label>导出来源</label>
              <div class="source-toggle">
                <button class="filter-chip" :class="{ active: exportSource === 'original' }" type="button" @click="exportSource = 'original'">导出原图</button>
                <button class="filter-chip" :class="{ active: exportSource === 'adjusted' }" type="button" :disabled="previewFilter === 'none'" @click="exportSource = 'adjusted'">导出调整后图片</button>
              </div>
            </div>
            <div v-if="selected.task.error" class="prompt-box error-box">{{ selected.task.error }}</div>
            <div class="prompt-box">{{ selected.task.prompt }}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button
            class="btn-soft"
            type="button"
            @click="store.toggleAssetFavorite(selected.asset.id)"
          >
            <Star :size="15" :fill="selected.asset.isFavorite ? 'currentColor' : 'none'" />
            {{ selected.asset.isFavorite ? '取消收藏' : '收藏' }}
          </button>
          <button class="btn-soft" type="button" @click="reusePrompt(selected.task)">
            <Eye :size="15" />
            复用提示词
          </button>
          <button v-if="selected.task.status === 'failed'" class="btn-soft" type="button" @click="retryTask(selected.task)">
            <RotateCcw :size="15" />
            失败重新生成
          </button>
          <button class="btn-primary" type="button" @click="openHistoryExport">
            <Download :size="15" />
            导出到本地
          </button>
          <button class="btn-danger" type="button" @click="deleteAsset(selected.task, selected.asset, true)">
            <Trash2 :size="15" />
            删除图片
          </button>
        </div>
      </div>
    </div>

    <div v-if="viewerOpen && selected" class="modal-overlay viewer-overlay" @click.self="closeImageViewer">
      <div class="viewer-panel">
        <div class="viewer-toolbar">
          <div>
            <strong>{{ selected.asset.title }}</strong>
            <span>{{ selectedAssetSizeLabel }} · {{ selectedPreviewFilter.label }}</span>
          </div>
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="adjustViewerZoom(-0.25)">缩小</button>
            <button class="btn-soft" type="button" @click="viewerZoom = 1">{{ Math.round(viewerZoom * 100) }}%</button>
            <button class="btn-soft" type="button" @click="adjustViewerZoom(0.25)">
              <ZoomIn :size="15" />
              放大
            </button>
            <button class="btn-icon" type="button" @click="closeImageViewer">×</button>
          </div>
        </div>
        <div class="viewer-stage">
          <img :src="selected.asset.dataUrl" :alt="`${selected.asset.title} 放大查看`" :style="viewerImageStyle" />
        </div>
      </div>
    </div>

    <div v-if="exportOpen" class="modal-overlay" @click.self="exportOpen = null">
      <div class="modal small">
        <div class="modal-head">
          <div>
            <h2>{{ exportOpen === 'all' ? '导出全部' : '导出到本地' }}</h2>
            <p class="muted">默认读取设置中的输出目录，也可以临时调整格式。</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = null">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="history-export-dir">导出目录</label>
            <div class="directory-picker">
              <input id="history-export-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseHistoryExportDir">
                <FolderOpen :size="16" />
                重新选择目录
              </button>
            </div>
          </div>
          <div class="field">
            <label for="history-export-format">格式</label>
            <select v-if="isIconSelected && exportOpen === 'selected'" id="history-export-format" v-model="iconExportKind">
              <option v-for="option in iconExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-else id="history-export-format" v-model="exportFormat">
              <option v-for="option in availableExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <template v-if="isIconSelected && exportOpen === 'selected'">
            <div class="field">
              <label for="history-icon-project-name">项目名称</label>
              <input id="history-icon-project-name" v-model="iconProjectName" placeholder="默认使用时间戳命名" />
            </div>
            <p class="muted">PNG 导出文件名为 <code>{{ iconProjectName || defaultIconProjectName() }}.png</code>；ICO 每个尺寸导出为 <code>{{ iconProjectName || defaultIconProjectName() }}_尺寸x尺寸.ico</code>，全部打包为一个 ZIP。</p>
            <div v-if="iconExportKind !== 'png'" class="field">
              <label>导出尺寸</label>
              <div class="ico-size-checks">
                <label v-for="preset in availableIcoExportSizes" :key="preset.id" class="ico-size-check">
                  <input
                    :aria-label="`导出尺寸 ${preset.name}`"
                    :value="preset.width"
                    v-model="selectedIcoExportSizes"
                    type="checkbox"
                  />
                  <span>{{ preset.name }}<small v-if="preset.hint"> · {{ preset.hint }}</small></span>
                </label>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-if="exportOpen === 'selected'" class="field">
              <label>导出来源</label>
              <div class="source-toggle">
                <button class="filter-chip" :class="{ active: exportSource === 'original' }" type="button" @click="exportSource = 'original'">原图</button>
                <button class="filter-chip" :class="{ active: exportSource === 'adjusted' }" type="button" :disabled="!canExportAdjustedEntry(selected)" @click="exportSource = 'adjusted'">调整后图片</button>
              </div>
            </div>
            <p v-if="exportFormat === 'ico'" class="muted">
              {{ exportOpen === 'all' ? 'ICO 会按勾选尺寸逐个打包，每张源图会自动跳过超过自身尺寸的规格。' : 'ICO 会按勾选尺寸打包，并自动跳过超过当前源图尺寸的规格。' }}
            </p>
            <div v-if="exportFormat === 'ico'" class="field">
              <label>导出尺寸</label>
              <div class="ico-size-checks">
                <label v-for="preset in availableIcoExportSizes" :key="preset.id" class="ico-size-check">
                  <input
                    :aria-label="`导出尺寸 ${preset.name}`"
                    :value="preset.width"
                    v-model="selectedIcoExportSizes"
                    type="checkbox"
                  />
                  <span>{{ preset.name }}<small v-if="preset.hint"> · {{ preset.hint }}</small></span>
                </label>
              </div>
            </div>
          </template>
          <p class="muted">{{ exportOpen === 'all' ? '导出将包含全部已完成结果，并保留可用的提示词元数据。' : '导出将使用当前结果并保留可用的提示词元数据。' }}</p>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="exportOpen = null">取消</button>
          <button class="btn-primary" type="button" @click="confirmHistoryExport">{{ historyExportButtonLabel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.search-box {
  position: relative;
  flex: 1 1 260px;
  min-width: 0;
}

.search-box svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
}

.search-box input {
  padding-left: 36px;
}

.filter-chip {
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--fg-2);
  padding: 7px 13px;
  font-size: 12px;
}

.filter-chip.active {
  background: var(--accent);
  color: var(--accent-on);
  border-color: var(--accent);
}

.sort-box {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.sort-box select {
  width: 122px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 22px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  display: grid;
  gap: 4px;
}

.stat-card strong {
  color: var(--accent);
  font-size: 20px;
}

.stat-card span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.favorites-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  white-space: nowrap;
}

.favorites-toggle input {
  display: none;
}

.favorites-toggle.active {
  color: var(--warn, #f0b400);
  border-color: var(--warn, #f0b400);
  background: rgba(240, 180, 0, 0.08);
}

.history-card-fav {
  border-color: var(--warn, #f0b400);
  box-shadow: 0 0 0 1px var(--warn, #f0b400);
}

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 22px 0 4px;
}

.history-card {
  position: relative;
  min-width: 0;
}

.image-card {
  width: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
  transition: border-color 160ms, box-shadow 160ms, transform 160ms;
  min-width: 0;
}

.image-card:hover {
  border-color: var(--accent);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.34), 0 0 0 1px var(--border-glow);
  transform: translateY(-2px);
}

.favorite-button,
.delete-button {
  position: absolute;
  z-index: 2;
  top: 10px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--fg-2);
  background: rgba(6, 10, 18, .76);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--elev-subtle);
}

.favorite-button {
  right: 10px;
}

.delete-button {
  left: 10px;
}

.favorite-button.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.favorite-button:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.delete-button:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: rgba(184, 76, 76, .12);
}

.thumb {
  aspect-ratio: 1;
}

.image-info {
  display: grid;
  gap: 6px;
  padding: 12px;
  min-width: 0;
}

.image-info strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.image-info small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-text.error,
.status-error {
  color: var(--danger);
}

.mode-chip {
  width: fit-content;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-pill);
  padding: 2px 9px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 42px;
  color: var(--muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(320px, 1.25fr) minmax(320px, 0.95fr);
  gap: 20px;
  align-items: start;
}

.detail-preview-wrap {
  display: grid;
  gap: 10px;
}

.detail-preview-button {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  text-align: left;
}

.detail-preview-button img {
  width: 100%;
  min-height: 320px;
  max-height: 68vh;
  object-fit: contain;
  background: rgba(6, 10, 18, .45);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.detail-preview-button span {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  background: rgba(6, 10, 18, .78);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 12px;
}

.detail-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.detail-preview-meta span {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 10px;
  min-width: 0;
}

.detail-row span {
  color: var(--muted);
  flex: 0 0 auto;
}

.detail-row strong {
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.prompt-box {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(6, 10, 18, .42);
  line-height: 1.7;
  min-width: 0;
  overflow-wrap: anywhere;
}

.error-box {
  color: var(--danger);
  border-color: rgba(184, 76, 76, .42);
  background: rgba(184, 76, 76, .1);
}

.info-box {
  color: var(--fg-2);
  border-color: var(--border);
}

.filter-chip-row,
.source-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.viewer-overlay {
  z-index: 120;
}

.viewer-panel {
  width: min(1180px, 96vw);
  height: min(88vh, 860px);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: rgba(6, 10, 18, .94);
  box-shadow: var(--elev-raised);
}

.viewer-toolbar {
  min-width: 0;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.viewer-toolbar > div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.viewer-toolbar strong,
.viewer-toolbar span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-toolbar span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.viewer-stage {
  min-height: 0;
  overflow: auto;
  padding: 24px;
  text-align: center;
}

.viewer-stage img {
  display: inline-block;
  height: auto;
  object-fit: contain;
  transition: width 140ms ease;
}

@media (max-width: 980px) {
  .image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sort-box {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 680px) {
  .stats-row,
  .image-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
