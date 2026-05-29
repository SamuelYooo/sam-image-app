<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Eye, RotateCcw, Search, Star, Trash2 } from 'lucide-vue-next'
import { exportFormatOptions, modeLabels } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask } from '@/types/domain'

const router = useRouter()
const store = useAppStore()
const search = ref('')
const filter = ref<'all' | GenerationMode>('all')
const sortMode = ref<'newest' | 'oldest' | 'model'>('newest')
const visibleCount = ref(8)
const selected = ref<{ task: GenerationTask; asset: GeneratedAsset } | null>(null)
const exportOpen = ref(false)
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.tasks.filter((task) => {
    if (filter.value !== 'all' && task.mode !== filter.value) return false
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

const visibleTasks = computed(() => sortedTasks.value.slice(0, visibleCount.value))
const hasMoreTasks = computed(() => visibleTasks.value.length < sortedTasks.value.length)

const stats = computed(() => ({
  total: store.tasks.reduce((sum, task) => sum + task.assets.length, 0),
  today: store.tasks.filter((task) => new Date(task.createdAt).toDateString() === new Date().toDateString()).reduce((sum, task) => sum + task.assets.length, 0),
  favorites: store.favoriteTasks.length,
}))

watch([search, filter, sortMode], () => {
  visibleCount.value = 8
})

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
    },
  })
}

function clearHistory(): void {
  if (!window.confirm('确定清空所有历史记录？此操作不可恢复。')) return
  store.clearHistory()
}

function openHistoryExport(): void {
  exportFormat.value = store.settings.defaultExportFormat
  exportOpen.value = true
}

function loadMore(): void {
  visibleCount.value += 8
}

async function confirmHistoryExport(): Promise<void> {
  if (!selected.value) return
  await store.downloadAsset(selected.value.asset, exportFormat.value, 1, selected.value.task)
  exportOpen.value = false
}
</script>

<template>
  <div class="page-wide">
    <div class="page-header">
      <div>
        <p class="page-kicker">Local Gallery</p>
        <h1 class="page-title">历史记录</h1>
        <p class="page-desc">查看所有本地生成结果，筛选、复用提示词或导出图片。</p>
      </div>
      <div class="btn-row">
        <button class="btn-soft" type="button" @click="store.downloadAllAssets">
          <Download :size="16" />
          导出全部
        </button>
        <button class="btn-danger" type="button" @click="clearHistory">
          <Trash2 :size="16" />
          清空历史
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
    </div>

    <div class="stats-row">
      <div class="stat-card"><strong>{{ stats.total }} 张</strong><span>共生成</span></div>
      <div class="stat-card"><strong>{{ stats.today }} 张</strong><span>今日生成</span></div>
      <div class="stat-card"><strong>{{ stats.favorites }} 条</strong><span>已收藏</span></div>
    </div>

    <div v-if="sortedTasks.length">
      <div class="image-grid">
        <article v-for="task in visibleTasks" :key="task.id" class="history-card">
          <button
            class="favorite-button"
            :class="{ active: task.isFavorite }"
            type="button"
            :aria-label="task.isFavorite ? '取消收藏' : '收藏'"
            :title="`${task.isFavorite ? '取消收藏' : '收藏'} ${task.prompt}`"
            @click="store.toggleTaskFavorite(task.id)"
          >
            <Star :size="15" :fill="task.isFavorite ? 'currentColor' : 'none'" />
          </button>
          <button
            v-for="asset in task.assets"
            :key="asset.id"
            class="image-card"
            type="button"
            @click="selected = { task, asset }"
          >
            <span class="art-preview thumb"><img :src="asset.dataUrl" :alt="asset.title" /></span>
            <span class="image-info">
              <span class="mode-chip">{{ modeLabels[task.mode] }}</span>
              <strong>{{ task.prompt }}</strong>
              <small>
                {{ new Date(task.createdAt).toLocaleString() }} · {{ task.width }} x {{ task.height }}
                <span v-if="task.status === 'failed'" class="status-text error"> · 失败</span>
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
      <strong>暂无历史记录</strong>
      <span>在工作台生成结果后会自动出现在这里。</span>
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
          <img :src="selected.asset.dataUrl" :alt="selected.asset.title" />
          <div class="stack">
            <div class="detail-row"><span>生成类型</span><strong>{{ modeLabels[selected.task.mode] }}</strong></div>
            <div class="detail-row"><span>模型</span><strong>{{ selected.task.modelId }}</strong></div>
            <div class="detail-row"><span>尺寸</span><strong>{{ selected.asset.width }} x {{ selected.asset.height }}</strong></div>
            <div class="detail-row"><span>状态</span><strong :class="{ 'status-error': selected.task.status === 'failed' }">{{ selected.task.status === 'failed' ? '失败' : selected.task.status === 'completed' ? '完成' : selected.task.status }}</strong></div>
            <div v-if="selected.task.error" class="prompt-box error-box">{{ selected.task.error }}</div>
            <div class="prompt-box">{{ selected.task.prompt }}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button
            class="btn-soft"
            type="button"
            @click="store.toggleTaskFavorite(selected.task.id)"
          >
            <Star :size="15" :fill="selected.task.isFavorite ? 'currentColor' : 'none'" />
            {{ selected.task.isFavorite ? '取消收藏' : '收藏' }}
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
        </div>
      </div>
    </div>

    <div v-if="exportOpen && selected" class="modal-overlay" @click.self="exportOpen = false">
      <div class="modal small">
        <div class="modal-head">
          <div>
            <h2>导出到本地</h2>
            <p class="muted">默认读取设置中的输出目录，也可以临时调整格式。</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="history-export-dir">导出目录</label>
            <input id="history-export-dir" v-model="store.settings.defaultOutputDir" />
          </div>
          <div class="field">
            <label for="history-export-format">格式</label>
            <select id="history-export-format" v-model="exportFormat">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <p class="muted">导出将使用当前结果并保留可用的提示词元数据。</p>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="exportOpen = false">取消</button>
          <button class="btn-primary" type="button" @click="confirmHistoryExport">确认导出</button>
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
  height: 100%;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
}

.favorite-button {
  position: absolute;
  z-index: 2;
  top: 10px;
  right: 10px;
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

.favorite-button.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.favorite-button:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.thumb {
  aspect-ratio: 1;
}

.image-info {
  display: grid;
  gap: 6px;
  padding: 12px;
}

.image-info strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-info small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
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
  grid-template-columns: 260px 1fr;
  gap: 18px;
}

.detail-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-md);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 10px;
}

.detail-row span {
  color: var(--muted);
}

.prompt-box {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(6, 10, 18, .42);
  line-height: 1.7;
}

.error-box {
  color: var(--danger);
  border-color: rgba(184, 76, 76, .42);
  background: rgba(184, 76, 76, .1);
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
</style>
