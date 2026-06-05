<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { RotateCcw, Search, Trash2 } from 'lucide-vue-next'
import { modeLabels } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { GenerationMode, GenerationTask, TaskStatus } from '@/types/domain'

const router = useRouter()
const store = useAppStore()
const search = ref('')
const modeFilter = ref<'all' | GenerationMode>('all')
const statusFilter = ref<'all' | TaskStatus>('all')
const visibleCount = ref(24)

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.operationTasks.filter((task) => {
    if (modeFilter.value !== 'all' && task.mode !== modeFilter.value) return false
    if (statusFilter.value !== 'all' && task.status !== statusFilter.value) return false
    if (!keyword) return true
    return [
      task.prompt,
      task.negativePrompt,
      task.modelId,
      task.style,
      task.status,
      task.error,
      JSON.stringify(task.errorDetails ?? {}),
      JSON.stringify(task.modeOptions ?? {}),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

const visibleTasks = computed(() => filteredTasks.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleTasks.value.length < filteredTasks.value.length)
const stats = computed(() => ({
  total: store.operationTasks.length,
  failed: store.operationTasks.filter((task) => task.status === 'failed').length,
  completed: store.operationTasks.filter((task) => task.status === 'completed').length,
  historyResults: store.historyTasks.length,
}))

watch([search, modeFilter, statusFilter], () => {
  visibleCount.value = 24
})

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    queued: '排队中',
    running: '运行中',
    completed: '成功',
    failed: '失败',
  }
  return labels[status]
}

function failureSummary(task: GenerationTask): string {
  const message = task.error?.trim()
  if (!message) return '未记录错误信息'
  const statusCode = message.match(/HTTP\s+(\d{3})/)?.[1]
  if (statusCode === '400') return '请求参数被模型服务拒绝，请检查模型 ID、尺寸、批量或协议参数。'
  if (statusCode === '401' || statusCode === '403') return '鉴权失败，请检查 API Key、账号权限或模型访问授权。'
  if (statusCode === '404') return '接口地址、接口路径或模型 ID 未命中，通常是 Endpoint/API Path/模型名称不匹配。'
  if (statusCode === '429') return '请求触发限流或额度不足，请检查服务商额度、频率限制和账单状态。'
  if (statusCode?.startsWith('5')) return '模型服务端返回 5xx，可能是上游服务异常或当前模型暂不可用。'
  if (message.includes('request') || message.includes('请求失败')) return '请求未成功发出或网络连接失败，请检查网络、代理和服务地址。'
  return message
}

function failureHint(task: GenerationTask): string {
  const message = task.error?.trim() ?? ''
  const statusCode = message.match(/HTTP\s+(\d{3})/)?.[1]
  if (statusCode) return `原始错误：${message}`
  return '原始错误已保留在下方请求细节中。'
}

function diagnosticValue(task: GenerationTask, key: string): string {
  const value = task.errorDetails?.[key]
  return value === undefined || value === null || value === '' ? '未记录' : String(value)
}

function callEndpoint(task: GenerationTask): string {
  const endpoint = diagnosticValue(task, 'endpoint')
  const apiPath = diagnosticValue(task, 'apiPath')
  if (endpoint === '未记录') return endpoint
  if (apiPath === '未记录') return endpoint
  return `${endpoint.replace(/\/+$/g, '')}/${apiPath.replace(/^\/+/g, '')}`
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
  if (!window.confirm('确定清空所有生成与操作记录？此操作不可恢复。')) return
  store.clearHistory()
}
</script>

<template>
  <div class="page-wide operation-page">
    <div class="page-header">
      <div>
        <p class="page-kicker">Operation Trace</p>
        <h1 class="page-title">操作记录</h1>
        <p class="page-desc">查询生成请求、失败原因、模型参数和重试入口，用于排查模型调用问题。</p>
      </div>
      <button class="btn-danger" type="button" @click="clearHistory">
        <Trash2 :size="16" />
        清空记录
      </button>
    </div>

    <div class="operation-stats">
      <div class="stat-card"><strong>{{ stats.total }} 条</strong><span>全部操作</span></div>
      <div class="stat-card"><strong>{{ stats.failed }} 条</strong><span>失败记录</span></div>
      <div class="stat-card"><strong>{{ stats.completed }} 条</strong><span>成功记录</span></div>
      <div class="stat-card"><strong>{{ stats.historyResults }} 条</strong><span>资产资源</span></div>
    </div>

    <div class="operation-toolbar">
      <label class="operation-search">
        <Search :size="16" />
        <input v-model="search" placeholder="搜索提示词、模型、错误信息或参数" aria-label="搜索操作记录" />
      </label>
      <select v-model="statusFilter" class="operation-filter" aria-label="状态筛选">
        <option value="all">全部状态</option>
        <option value="failed">仅失败</option>
        <option value="completed">仅成功</option>
        <option value="running">运行中</option>
        <option value="queued">排队中</option>
      </select>
      <select v-model="modeFilter" class="operation-filter" aria-label="模式筛选">
        <option value="all">全部模式</option>
        <option v-for="(label, key) in modeLabels" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>

    <div v-if="visibleTasks.length" class="operation-list">
      <article v-for="task in visibleTasks" :key="task.id" class="operation-item">
        <div class="operation-main">
          <div class="operation-line">
            <span class="status-pill" :class="{ error: task.status === 'failed' }">
              <span class="status-dot" :class="{ error: task.status === 'failed', warn: task.status === 'queued' || task.status === 'running' }" />
              {{ statusLabel(task.status) }}
            </span>
            <span class="chip accent">{{ modeLabels[task.mode] }}</span>
            <span class="muted">{{ new Date(task.createdAt).toLocaleString() }}</span>
          </div>
          <h2>{{ task.prompt || '未填写提示词' }}</h2>
          <p v-if="task.error" class="operation-error">{{ task.error }}</p>
          <div v-if="task.status === 'failed'" class="operation-diagnostics">
            <div>
              <strong>失败原因</strong>
              <p>{{ failureSummary(task) }}</p>
              <small>{{ failureHint(task) }}</small>
            </div>
            <div class="diagnostic-grid">
              <span><b>调用地址</b><em>{{ callEndpoint(task) }}</em></span>
              <span><b>协议</b><em>{{ diagnosticValue(task, 'apiProtocol') }}</em></span>
              <span><b>模型配置</b><em>{{ diagnosticValue(task, 'modelName') }}</em></span>
              <span><b>模型 ID</b><em>{{ diagnosticValue(task, 'model') }}</em></span>
              <span><b>错误类型</b><em>{{ diagnosticValue(task, 'errorKind') }}</em></span>
              <span><b>检测状态</b><em>{{ diagnosticValue(task, 'modelStatus') }}</em></span>
            </div>
          </div>
          <div class="operation-meta">
            <span>模型：{{ task.modelId || '未选择' }}</span>
            <span>尺寸：{{ task.width }} x {{ task.height }}</span>
            <span>批量：{{ task.batchSize }}</span>
            <span>步数：{{ task.steps }}</span>
            <span>Seed：{{ task.seed }}</span>
            <span>风格：{{ task.style }}</span>
          </div>
          <details v-if="task.negativePrompt || task.modeOptions || task.errorDetails" class="operation-details">
            <summary>查看请求细节</summary>
            <pre>{{ JSON.stringify({ negativePrompt: task.negativePrompt, modeOptions: task.modeOptions ?? {}, errorDetails: task.errorDetails ?? {} }, null, 2) }}</pre>
          </details>
        </div>
        <div class="operation-actions">
          <button class="btn-soft btn-sm" type="button" @click="retryTask(task)">
            <RotateCcw :size="14" />
            重试
          </button>
        </div>
      </article>
      <div v-if="hasMore" class="load-more-row">
        <button class="btn-soft" type="button" @click="visibleCount += 24">加载更多</button>
      </div>
    </div>

    <div v-else class="operation-empty empty-state card">
      <strong>暂无操作记录</strong>
      <span>生成成功或失败后都会在这里记录，方便后续排查。</span>
    </div>
  </div>
</template>

<style scoped>
.operation-page {
  display: grid;
  gap: 18px;
}

.operation-page :deep(.page-header > div),
.operation-page :deep(.page-desc) {
  min-width: 0;
}

.operation-stats,
.operation-toolbar {
  display: grid;
  gap: 12px;
}

.operation-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.stat-card {
  min-width: 0;
  padding: 16px;
  display: grid;
  gap: 5px;
  background: var(--tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.stat-card strong {
  color: var(--fg);
  font-size: 17px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.stat-card span {
  color: var(--muted);
  font-size: 12px;
}

.operation-toolbar {
  grid-template-columns: minmax(320px, 1fr) minmax(144px, 168px) minmax(144px, 168px);
  align-items: center;
  min-width: 0;
  padding: 12px;
  background: var(--tint);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
}

.operation-search {
  min-width: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  color: var(--muted);
  background: var(--tint-strong);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.operation-search svg {
  flex: 0 0 auto;
}

.operation-search input:not([type="checkbox"]):not([type="radio"]) {
  min-width: 0;
  width: 100%;
  padding: 0;
  color: var(--fg);
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.operation-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  background: rgba(255, 255, 255, 0.95);
}

.operation-search input:not([type="checkbox"]):not([type="radio"]):focus {
  box-shadow: none;
  background: transparent;
}

.operation-filter {
  min-height: 40px;
}

.operation-list {
  display: grid;
  gap: 12px;
}

.operation-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(72px, auto);
  gap: 16px;
  align-items: start;
  min-width: 0;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.operation-main {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.operation-line,
.operation-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.operation-item h2 {
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 15px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.operation-error {
  padding: 10px 12px;
  color: var(--danger);
  background: rgba(255, 107, 122, 0.08);
  border: 1px solid rgba(255, 107, 122, 0.24);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}

.operation-diagnostics {
  display: grid;
  gap: 12px;
  padding: 12px;
  color: var(--fg-2);
  background: rgba(255, 107, 122, 0.055);
  border: 1px solid rgba(255, 107, 122, 0.18);
  border-radius: var(--radius-md);
}

.operation-diagnostics strong {
  color: var(--danger);
}

.operation-diagnostics p {
  margin-top: 5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.operation-diagnostics small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.diagnostic-grid span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.diagnostic-grid b {
  color: var(--muted);
  font-size: 11px;
}

.diagnostic-grid em {
  color: var(--fg);
  font-style: normal;
  overflow-wrap: anywhere;
}

.operation-meta {
  color: var(--muted);
  font-size: 12px;
}

.operation-meta span {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.operation-details summary {
  cursor: pointer;
  color: var(--fg-2);
  font-size: 12px;
}

.operation-details pre {
  margin-top: 8px;
  min-width: 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  color: var(--fg-2);
  background: var(--tint);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.operation-actions {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.operation-empty {
  min-height: 132px;
  padding: 28px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: var(--muted);
  text-align: center;
}

.operation-empty strong {
  color: var(--fg);
  font-size: 15px;
}

.status-pill.error {
  color: var(--danger);
}

@media (max-width: 1040px) {
  .operation-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .operation-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .operation-search {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .operation-stats,
  .operation-toolbar,
  .operation-item {
    grid-template-columns: 1fr;
  }

  .diagnostic-grid {
    grid-template-columns: 1fr;
  }

  .operation-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .operation-stats,
  .operation-toolbar {
    grid-template-columns: 1fr;
  }

  .operation-search {
    grid-column: auto;
  }
}
</style>
