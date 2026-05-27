<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useTaskStore, type GenerationTask, type TaskStatusFilter } from '../stores/taskStore'
import { formatBeijingDateTime } from '../utils/time'

const taskStore = useTaskStore()
const {
  generationTasks,
  filteredGenerationTasks,
  statusFilter,
  workflowFilter,
  modelFilter,
  projectFilter,
  searchQuery: taskSearchQuery,
  selectedTaskIds,
  selectedTaskCount,
  taskStatusCounts,
  workflowOptions,
  modelOptions,
  projectOptions,
  isLoadingTasks,
  lastTaskError,
} = storeToRefs(taskStore)
const pageMessage = ref('')

const statusOptions: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '排队' },
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
]

const workflowLabels: Record<string, string> = {
  daily: '日常生图',
  img2img: '图生图',
  icon: 'ICON',
  storyboard: '分镜',
  batch: '批量',
  compare: '多模型对比',
}

const selectedTaskIdSet = computed(() => new Set(selectedTaskIds.value))
const visibleTaskIds = computed(() => filteredGenerationTasks.value.map((task) => task.id))
const allVisibleTasksSelected = computed(
  () => visibleTaskIds.value.length > 0 && visibleTaskIds.value.every((id) => selectedTaskIdSet.value.has(id)),
)
const hasFinishedTasks = computed(() =>
  generationTasks.value.some((task) => task.status === 'succeeded' || task.status === 'cancelled'),
)
const canRunSelectedPendingTasks = computed(() =>
  filteredGenerationTasks.value.some((task) => selectedTaskIdSet.value.has(task.id) && canRunTask(task)),
)
const canCancelSelectedTasks = computed(() =>
  filteredGenerationTasks.value.some((task) => selectedTaskIdSet.value.has(task.id) && canCancelTask(task)),
)
const selectedTaskId = ref<string | null>(null)
const selectedTask = computed(
  () => generationTasks.value.find((task) => task.id === selectedTaskId.value) ?? null
)

onMounted(() => {
  void taskStore.loadGenerationTasks()
})

function getStatusLabel(status: GenerationTask['status']) {
  return statusOptions.find((option) => option.value === status)?.label ?? status
}

function getStatusCount(status: TaskStatusFilter) {
  return status === 'all' ? taskStatusCounts.value.total : taskStatusCounts.value[status]
}

function getTaskInputText(task: GenerationTask, key: string) {
  const value = task.input[key]
  return typeof value === 'string' ? value : ''
}

function getTaskOutputAssetIds(task: GenerationTask) {
  const assetIds = task.output.assetIds
  if (Array.isArray(assetIds)) {
    return assetIds.filter((item): item is string => typeof item === 'string')
  }
  return typeof task.output.assetId === 'string' ? [task.output.assetId] : []
}

function getTaskInputNumber(task: GenerationTask, key: string) {
  const value = task.input[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getWorkflowLabel(task: GenerationTask) {
  const workflow = getTaskInputText(task, 'workflowId') || 'unknown'
  return workflowLabels[workflow] ?? workflow
}

function getTaskTitle(task: GenerationTask) {
  const shotId = getTaskInputText(task, 'shotId')
  const suffix = shotId ? ` · ${shotId}` : ''
  return `${getWorkflowLabel(task)}${suffix}`
}

function getTaskPrompt(task: GenerationTask) {
  return getTaskInputText(task, 'promptText') || '未记录提示词'
}

function getTaskMeta(task: GenerationTask) {
  return [
    getTaskInputText(task, 'model') || '未记录模型',
    getTaskInputText(task, 'imageSize'),
    task.groupId ? `批次 ${task.groupId}` : '',
    task.projectId ? `项目 ${task.projectId}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function getTaskProgress(task: GenerationTask) {
  if (task.progressTotal <= 0) {
    return 0
  }
  return Math.min(100, Math.round((task.progressCurrent / task.progressTotal) * 100))
}

function formatTaskTime(value?: string) {
  return formatBeijingDateTime(value)
}

function getTaskQualityLabel(task: GenerationTask) {
  const quality = getTaskInputText(task, 'quality')
  const qualityLabels: Record<string, string> = {
    high: '高质量',
    medium: '均衡',
    low: '快速',
  }
  return (qualityLabels[quality] ?? quality) || '未记录'
}

function canRunTask(task: GenerationTask) {
  return task.taskType === 'image_generation' && task.status === 'pending'
}

function canCancelTask(task: GenerationTask) {
  return task.status === 'pending' || task.status === 'running'
}

function canRetryTask(task: GenerationTask) {
  return task.status === 'failed' || task.status === 'cancelled'
}

function isTaskRowControlTarget(event: Event) {
  return event.target instanceof Element && Boolean(event.target.closest('button, input, label, select, textarea, a'))
}

function openTaskDetailFromRow(event: MouseEvent, task: GenerationTask) {
  if (isTaskRowControlTarget(event)) {
    return
  }
  openTaskDetail(task)
}

function openTaskDetail(task: GenerationTask) {
  selectedTaskId.value = task.id
}

function closeTaskDetail() {
  selectedTaskId.value = null
}

function getTaskResultSummary(task: GenerationTask) {
  if (task.status === 'failed') {
    return '生成失败，错误详情已放在下方'
  }
  const assetIds = getTaskOutputAssetIds(task)
  if (assetIds.length) {
    return `输出资产 ${assetIds.join(', ')}`
  }
  if (task.status === 'succeeded') {
    return '任务已完成，等待资产刷新'
  }
  return getTaskPrompt(task)
}

function getTaskDetailRows(task: GenerationTask) {
  return [
    { label: '任务 ID', value: task.id },
    { label: '任务状态', value: getStatusLabel(task.status) },
    { label: '任务类型', value: task.taskType },
    { label: '工作流', value: getWorkflowLabel(task) },
    { label: '模型', value: getTaskInputText(task, 'model') || '未记录模型' },
    { label: '尺寸', value: getTaskInputText(task, 'imageSize') || '未记录' },
    { label: '质量', value: getTaskQualityLabel(task) },
    { label: '张数', value: String(getTaskInputNumber(task, 'imageCount') ?? task.progressTotal ?? 1) },
    { label: '种子', value: getTaskInputText(task, 'seed') || '随机' },
    { label: '项目', value: task.projectId || getTaskInputText(task, 'projectId') || '无' },
    { label: '批次', value: task.groupId || '无' },
    { label: '重试自', value: task.retryOf || '无' },
    { label: '优先级', value: task.priority == null ? '普通' : String(task.priority) },
    { label: '创建时间', value: formatTaskTime(task.createdAt) },
    { label: '开始时间', value: task.startedAt ? formatTaskTime(task.startedAt) : '未开始' },
    { label: '完成时间', value: task.finishedAt ? formatTaskTime(task.finishedAt) : '未完成' },
  ]
}

function toggleVisibleTaskSelection() {
  const visibleIds = new Set(visibleTaskIds.value)
  if (allVisibleTasksSelected.value) {
    taskStore.selectTaskIds(selectedTaskIds.value.filter((id) => !visibleIds.has(id)))
    return
  }
  taskStore.selectTaskIds([...selectedTaskIds.value, ...visibleTaskIds.value])
}

async function runTask(task: GenerationTask) {
  await taskStore.runGenerationTask(task.id)
  pageMessage.value = '已运行选中的排队任务'
}

async function cancelTask(task: GenerationTask) {
  await taskStore.cancelGenerationTask(task.id)
  pageMessage.value = '已取消任务'
}

async function retryTask(task: GenerationTask) {
  await taskStore.retryGenerationTask(task.id)
  if (selectedTaskId.value === task.id) {
    closeTaskDetail()
  }
  pageMessage.value = '已创建重试任务'
}

async function runSelectedPendingTasks() {
  await taskStore.runSelectedPendingGenerationTasks()
  pageMessage.value = '已运行选中的排队任务'
}

async function cancelSelectedTasks() {
  await taskStore.cancelSelectedGenerationTasks()
  pageMessage.value = '已取消选中的任务'
}

async function clearFinishedTasks() {
  await taskStore.clearFinishedGenerationTasks()
  pageMessage.value = '已清理完成和已取消任务'
}

async function copyTaskPrompt(task: GenerationTask) {
  const prompt = getTaskPrompt(task)
  try {
    await navigator.clipboard?.writeText(prompt)
    pageMessage.value = '已复制任务提示词'
  } catch {
    pageMessage.value = '当前环境不支持复制'
  }
}
</script>

<template>
  <section class="sam-tasks-page">
    <header class="sam-tasks-hero">
      <div>
        <span class="sam-eyebrow">任务队列</span>
        <h1>集中管理生图、ICON 和分镜批量任务</h1>
        <p>按状态、工作流、项目和提示词检索任务，处理排队、失败重试、取消和历史清理。</p>
      </div>
      <div>
        <button type="button" :disabled="isLoadingTasks" @click="taskStore.loadGenerationTasks">
          <span class="i-mdi-refresh" aria-hidden="true" />
          {{ isLoadingTasks ? '刷新中' : '刷新任务' }}
        </button>
        <button type="button" :disabled="!hasFinishedTasks || isLoadingTasks" @click="clearFinishedTasks">
          <span class="i-mdi-broom" aria-hidden="true" />
          清理完成
        </button>
      </div>
    </header>

    <section class="sam-tasks-summary" aria-label="任务状态统计">
      <button
        v-for="option in statusOptions"
        :key="option.value"
        type="button"
        :class="{ active: statusFilter === option.value }"
        @click="taskStore.setStatusFilter(option.value)"
      >
        <span>{{ option.label }}</span>
        <strong>{{ getStatusCount(option.value) }}</strong>
      </button>
    </section>

    <section class="sam-tasks-toolbar">
      <input
        v-model="taskSearchQuery"
        type="search"
        placeholder="搜索提示词、模型、任务 ID、输出资产 ID"
        @input="taskStore.setSearchQuery(taskSearchQuery)"
      />
      <select v-model="workflowFilter" @change="taskStore.setWorkflowFilter(workflowFilter)">
        <option value="all">全部工作流</option>
        <option v-for="workflow in workflowOptions" :key="workflow" :value="workflow">
          {{ workflowLabels[workflow] ?? workflow }}
        </option>
      </select>
      <select v-model="modelFilter" @change="taskStore.setModelFilter(modelFilter)">
        <option value="all">全部模型</option>
        <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
      </select>
      <select v-model="projectFilter" @change="taskStore.setProjectFilter(projectFilter)">
        <option value="all">全部项目</option>
        <option v-for="project in projectOptions" :key="project" :value="project">{{ project }}</option>
      </select>
    </section>

    <section v-if="filteredGenerationTasks.length || selectedTaskCount" class="sam-tasks-bulkbar">
      <div>
        <strong>{{ selectedTaskCount ? `已选择 ${selectedTaskCount} 项` : '批量任务操作' }}</strong>
        <span>{{ filteredGenerationTasks.length }} 条任务匹配当前筛选</span>
      </div>
      <div>
        <button type="button" :disabled="!filteredGenerationTasks.length" @click="toggleVisibleTaskSelection">
          {{ allVisibleTasksSelected ? '取消当前筛选' : '全选当前筛选' }}
        </button>
        <button type="button" :disabled="!canRunSelectedPendingTasks || isLoadingTasks" @click="runSelectedPendingTasks">
          运行选中
        </button>
        <button type="button" :disabled="!canCancelSelectedTasks || isLoadingTasks" @click="cancelSelectedTasks">
          取消选中
        </button>
        <button type="button" :disabled="!selectedTaskCount" @click="taskStore.clearSelectedTasks">清空选择</button>
      </div>
    </section>

    <p v-if="pageMessage" class="sam-workspace-message tasks-page">{{ pageMessage }}</p>
    <p v-if="lastTaskError" class="sam-config-error tasks-page">{{ lastTaskError }}</p>

    <section v-if="filteredGenerationTasks.length" class="sam-tasks-list-page">
      <article
        v-for="task in filteredGenerationTasks"
        :key="task.id"
        class="sam-task-row"
        :class="{ selected: selectedTaskIdSet.has(task.id) }"
        :aria-label="`查看${getTaskTitle(task)}详情`"
        @click="openTaskDetailFromRow($event, task)"
      >
        <label class="sam-task-row-select" @click.stop>
          <input
            type="checkbox"
            :checked="selectedTaskIdSet.has(task.id)"
            :aria-label="`选择${getTaskTitle(task)}`"
            @click.stop
            @change="taskStore.toggleTaskSelection(task.id)"
          />
        </label>
        <div class="sam-task-row-main">
          <header>
            <div>
              <strong>{{ getTaskTitle(task) }}</strong>
              <span>{{ task.id }}</span>
            </div>
            <em class="sam-task-status" :class="`status-${task.status}`">{{ getStatusLabel(task.status) }}</em>
          </header>
          <p>{{ getTaskPrompt(task) }}</p>
          <div class="sam-task-row-meta">
            <span>{{ getTaskMeta(task) }}</span>
            <span>创建 {{ formatTaskTime(task.createdAt) }}</span>
            <span v-if="task.finishedAt">完成 {{ formatTaskTime(task.finishedAt) }}</span>
            <span v-if="task.retryOf">重试自 {{ task.retryOf }}</span>
          </div>
          <div class="sam-task-progress" role="progressbar" :aria-valuenow="getTaskProgress(task)">
            <span :style="{ width: `${getTaskProgress(task)}%` }" />
          </div>
          <div class="sam-task-row-output">
            <span>进度 {{ task.progressCurrent }}/{{ task.progressTotal }}</span>
            <span v-if="getTaskOutputAssetIds(task).length">资产 {{ getTaskOutputAssetIds(task).join(', ') }}</span>
            <span v-if="task.error" class="error">{{ task.error }}</span>
          </div>
        </div>
        <footer class="sam-task-row-actions">
          <button type="button" @click.stop="openTaskDetail(task)">详情</button>
          <button v-if="canRunTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="runTask(task)">运行</button>
          <button v-if="canCancelTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="cancelTask(task)">取消</button>
          <button v-if="canRetryTask(task)" type="button" :disabled="isLoadingTasks" @click.stop="retryTask(task)">重试</button>
          <button type="button" @click.stop="copyTaskPrompt(task)">复制提示词</button>
        </footer>
      </article>
    </section>

    <section v-else class="sam-tasks-empty">
      <span class="i-mdi-progress-clock" aria-hidden="true" />
      <p>还没有匹配的任务。工作台创建的日常生图、ICON、批量生成和分镜出图都会进入这里。</p>
    </section>

    <Teleport to="body">
      <div
        v-if="selectedTask"
        class="sam-modal-backdrop sam-task-detail-backdrop"
        role="presentation"
        @click.self="closeTaskDetail"
      >
        <section
          class="sam-model-modal sam-task-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label="任务详情"
          @click.stop
        >
        <header class="sam-model-modal-header">
          <div>
            <span>任务详情</span>
            <h2>{{ getTaskTitle(selectedTask) }}</h2>
            <p>{{ getTaskResultSummary(selectedTask) }}</p>
          </div>
          <button class="sam-icon-button" type="button" title="关闭" aria-label="关闭" @click="closeTaskDetail">
            <span class="i-mdi-close" aria-hidden="true" />
          </button>
        </header>

        <div class="sam-task-detail-body">
          <section class="sam-task-detail-overview">
            <div>
              <span class="sam-task-status" :class="`status-${selectedTask.status}`">
                {{ getStatusLabel(selectedTask.status) }}
              </span>
              <strong>{{ getTaskProgress(selectedTask) }}%</strong>
              <small>{{ formatTaskTime(selectedTask.createdAt) }}</small>
            </div>
            <div class="sam-task-progress" role="progressbar" :aria-valuenow="getTaskProgress(selectedTask)">
              <span :style="{ width: `${getTaskProgress(selectedTask)}%` }" />
            </div>
          </section>

          <section class="sam-task-detail-section">
            <h3>任务信息</h3>
            <dl class="sam-task-detail-grid">
              <div v-for="row in getTaskDetailRows(selectedTask)" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section class="sam-task-detail-section">
            <h3>提示词</h3>
            <p class="sam-task-detail-text">{{ getTaskPrompt(selectedTask) || '无' }}</p>
          </section>

          <section class="sam-task-detail-section">
            <h3>负向提示词</h3>
            <p class="sam-task-detail-text">{{ getTaskInputText(selectedTask, 'negativePrompt') || '无' }}</p>
          </section>

          <section class="sam-task-detail-section">
            <h3>输出资产</h3>
            <p v-if="getTaskOutputAssetIds(selectedTask).length" class="sam-task-detail-text">
              {{ getTaskOutputAssetIds(selectedTask).join('，') }}
            </p>
            <p v-else class="sam-task-detail-empty">暂未产生输出资产</p>
          </section>

          <section v-if="selectedTask.error" class="sam-task-detail-section error">
            <h3>错误信息</h3>
            <p class="sam-task-detail-text">{{ selectedTask.error }}</p>
          </section>
        </div>

        <footer class="sam-model-modal-footer">
          <button v-if="canRunTask(selectedTask)" class="sam-secondary-action" type="button" @click="runTask(selectedTask)">
            运行
          </button>
          <button
            v-if="canCancelTask(selectedTask)"
            class="sam-secondary-action"
            type="button"
            @click="cancelTask(selectedTask)"
          >
            取消任务
          </button>
          <button
            v-if="canRetryTask(selectedTask)"
            class="sam-secondary-action"
            type="button"
            @click="retryTask(selectedTask)"
          >
            重试任务
          </button>
          <button class="sam-primary-action" type="button" @click="closeTaskDetail">关闭</button>
        </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>
