<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Eye, Search, Trash2 } from 'lucide-vue-next'
import { modeLabels } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { GeneratedAsset, GenerationMode, GenerationTask } from '@/types/domain'

const router = useRouter()
const store = useAppStore()
const search = ref('')
const filter = ref<'all' | GenerationMode>('all')
const selected = ref<{ task: GenerationTask; asset: GeneratedAsset } | null>(null)

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.tasks.filter((task) => {
    if (filter.value !== 'all' && task.mode !== filter.value) return false
    if (!keyword) return true
    return `${task.prompt} ${task.modelId} ${task.style}`.toLowerCase().includes(keyword)
  })
})

const stats = computed(() => ({
  total: store.tasks.reduce((sum, task) => sum + task.assets.length, 0),
  today: store.tasks.filter((task) => new Date(task.createdAt).toDateString() === new Date().toDateString()).reduce((sum, task) => sum + task.assets.length, 0),
  prompts: store.prompts.length,
}))

function reusePrompt(task: GenerationTask): void {
  store.setActivePrompt(task.prompt)
  router.push({ path: '/workspace', query: { mode: task.mode, prompt: task.prompt } })
}

function clearHistory(): void {
  if (!window.confirm('确定清空所有历史记录？此操作不可恢复。')) return
  store.tasks.length = 0
  store.notify('历史记录已清空')
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
        <button class="btn-soft" type="button" @click="store.completedAssets.forEach(({ asset }) => store.downloadAsset(asset))">
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
    </div>

    <div class="stats-row">
      <div class="stat-card"><strong>{{ stats.total }} 张</strong><span>共生成</span></div>
      <div class="stat-card"><strong>{{ stats.today }} 张</strong><span>今日生成</span></div>
      <div class="stat-card"><strong>{{ stats.prompts }} 条</strong><span>提示词库</span></div>
    </div>

    <div v-if="filteredTasks.length" class="image-grid">
      <article v-for="task in filteredTasks" :key="task.id" class="history-card">
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
            <small>{{ new Date(task.createdAt).toLocaleString() }} · {{ task.width }} x {{ task.height }}</small>
          </span>
        </button>
      </article>
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
            <div class="prompt-box">{{ selected.task.prompt }}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="reusePrompt(selected.task)">
            <Eye :size="15" />
            复用提示词
          </button>
          <button class="btn-primary" type="button" @click="store.downloadAsset(selected.asset)">
            <Download :size="15" />
            导出到本地
          </button>
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

.history-card {
  display: contents;
}

.image-card {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
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

@media (max-width: 980px) {
  .image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
