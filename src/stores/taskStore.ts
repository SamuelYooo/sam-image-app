import { invoke } from '@tauri-apps/api/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { hasTauriRuntime } from '../utils/tauriRuntime'

export interface CreateImageGenerationTaskInput {
  workflowId: string
  promptText: string
  referenceImages?: string[]
  negativePrompt: string
  imageSize: string
  quality: string
  imageCount: number
  seed: string
  model: string
}

export interface CreateBatchImageGenerationTasksInput {
  workflowId: string
  projectId?: string
  prompts: string[]
  shotIds?: string[]
  models?: string[]
  referenceImages?: string[]
  negativePrompt: string
  imageSize: string
  quality: string
  imageCount: number
  seed: string
  model: string
}

export interface GenerationTask {
  id: string
  groupId?: string
  projectId?: string
  taskType: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  priority: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
  progressCurrent: number
  progressTotal: number
  retryOf?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export type TaskStatusFilter = 'all' | GenerationTask['status']

export interface TaskFilters {
  statusFilter: TaskStatusFilter
  workflowFilter: string
  modelFilter: string
  projectFilter: string
  searchQuery: string
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '任务操作失败')
}

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function getTaskInputText(task: GenerationTask, key: string) {
  const value = task.input[key]
  return typeof value === 'string' ? value : ''
}

export function normalizeGenerationImageCount(workflowId: string, imageCount: number) {
  const numericCount = Number.isFinite(imageCount) ? Math.trunc(imageCount) : 1
  const clampedCount = Math.min(8, Math.max(1, numericCount))
  return workflowId === 'img2img' || workflowId === 'icon' ? 1 : clampedCount
}

function withNormalizedImageCount<T extends { workflowId: string; imageCount: number }>(input: T): T {
  return {
    ...input,
    imageCount: normalizeGenerationImageCount(input.workflowId, input.imageCount),
  }
}

function getTaskOutputText(task: GenerationTask, key: string) {
  const value = task.output[key]
  return typeof value === 'string' ? value : ''
}

function getTaskOutputList(task: GenerationTask, key: string) {
  const value = task.output[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function filterGenerationTasks(tasks: GenerationTask[], filters: TaskFilters) {
  const status = filters.statusFilter
  const workflow = normalized(filters.workflowFilter)
  const model = normalized(filters.modelFilter)
  const project = normalized(filters.projectFilter)
  const query = normalized(filters.searchQuery)

  return tasks.filter((task) => {
    const taskWorkflow = normalized(getTaskInputText(task, 'workflowId'))
    const taskModel = normalized(getTaskInputText(task, 'model'))
    const taskProject = normalized(task.projectId || getTaskInputText(task, 'projectId'))
    const outputAssetIds = getTaskOutputList(task, 'assetIds').join(' ')
    const searchable = [
      task.id,
      task.groupId,
      task.projectId,
      task.taskType,
      task.status,
      task.error,
      task.retryOf,
      getTaskInputText(task, 'workflowId'),
      getTaskInputText(task, 'promptText'),
      getTaskInputText(task, 'negativePrompt'),
      getTaskInputText(task, 'model'),
      getTaskInputText(task, 'imageSize'),
      getTaskInputText(task, 'quality'),
      getTaskInputText(task, 'shotId'),
      getTaskOutputText(task, 'assetId'),
      outputAssetIds,
    ]
      .map((item) => normalized(item))
      .join(' ')

    return (
      (status === 'all' || task.status === status) &&
      (!workflow || workflow === 'all' || taskWorkflow === workflow) &&
      (!model || model === 'all' || taskModel === model) &&
      (!project || project === 'all' || taskProject === project) &&
      (!query || searchable.includes(query))
    )
  })
}

export function getGenerationTaskStatusCounts(tasks: GenerationTask[]) {
  return tasks.reduce(
    (counts, task) => {
      counts[task.status] += 1
      counts.total += 1
      return counts
    },
    {
      total: 0,
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    } as Record<GenerationTask['status'] | 'total', number>,
  )
}

export function pruneSelectedTaskIds(selectedIds: string[], tasks: GenerationTask[]) {
  const availableIds = new Set(tasks.map((task) => task.id))
  return Array.from(new Set(selectedIds.filter((id) => availableIds.has(id))))
}

function createFallbackTask(input: CreateImageGenerationTaskInput): GenerationTask {
  const normalizedInput = withNormalizedImageCount(input)
  return {
    id: `task-${Date.now()}`,
    taskType: 'image_generation',
    status: 'pending',
    priority: 0,
    input: { ...normalizedInput },
    output: {},
    progressCurrent: 0,
    progressTotal: normalizedInput.imageCount,
    createdAt: new Date().toISOString(),
  }
}

function createFallbackBatchTasks(input: CreateBatchImageGenerationTasksInput): GenerationTask[] {
  const groupId = `group-${Date.now()}`
  const normalizedInput = withNormalizedImageCount(input)
  return input.prompts
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((prompt, index) => ({
      id: `task-${Date.now()}-${index}`,
      groupId,
      taskType: 'image_generation',
      status: 'pending' as const,
      priority: index,
      input: {
        workflowId: input.workflowId,
        projectId: input.projectId,
        promptText: prompt,
        shotId: input.shotIds?.[index] ?? '',
        model: input.models?.[index] ?? input.model,
        referenceImages: input.referenceImages ?? [],
        negativePrompt: input.negativePrompt,
        imageSize: input.imageSize,
        quality: input.quality,
        imageCount: normalizedInput.imageCount,
        seed: input.seed,
      },
      output: {},
      progressCurrent: 0,
      progressTotal: normalizedInput.imageCount,
      createdAt: new Date().toISOString(),
    }))
}

function pruneTasks(tasks: GenerationTask[]) {
  return tasks.slice(0, 50)
}

export const useTaskStore = defineStore('task', {
  state: () => ({
    generationTasks: [] as GenerationTask[],
    statusFilter: 'all' as TaskStatusFilter,
    workflowFilter: 'all',
    modelFilter: 'all',
    projectFilter: 'all',
    searchQuery: '',
    selectedTaskIds: [] as string[],
    isLoadingTasks: false,
    lastTaskError: '',
  }),

  getters: {
    filteredGenerationTasks: (state) =>
      filterGenerationTasks(state.generationTasks, {
        statusFilter: state.statusFilter,
        workflowFilter: state.workflowFilter,
        modelFilter: state.modelFilter,
        projectFilter: state.projectFilter,
        searchQuery: state.searchQuery,
      }),
    selectedGenerationTasks: (state) => state.generationTasks.filter((task) => state.selectedTaskIds.includes(task.id)),
    selectedTaskCount: (state) => state.selectedTaskIds.length,
    taskStatusCounts: (state) => getGenerationTaskStatusCounts(state.generationTasks),
    workflowOptions: (state) =>
      Array.from(
        new Set(
          state.generationTasks
            .map((task) => getTaskInputText(task, 'workflowId'))
            .map((workflow) => workflow.trim())
            .filter(Boolean),
        ),
      ).sort(),
    projectOptions: (state) =>
      Array.from(
        new Set(
          state.generationTasks
            .map((task) => task.projectId || getTaskInputText(task, 'projectId'))
            .map((project) => project.trim())
            .filter(Boolean),
        ),
      ).sort(),
    modelOptions: (state) =>
      Array.from(
        new Set(
          state.generationTasks
            .map((task) => getTaskInputText(task, 'model'))
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ).sort(),
  },

  actions: {
    async loadGenerationTasks() {
      this.lastTaskError = ''
      if (!hasTauriRuntime()) {
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        this.generationTasks = await invoke<GenerationTask[]>('list_generation_tasks')
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },

    setStatusFilter(status: TaskStatusFilter) {
      this.statusFilter = status
      this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.filteredGenerationTasks)
    },

    setWorkflowFilter(workflow: string) {
      this.workflowFilter = workflow
      this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.filteredGenerationTasks)
    },

    setModelFilter(model: string) {
      this.modelFilter = model
      this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.filteredGenerationTasks)
    },

    setProjectFilter(project: string) {
      this.projectFilter = project
      this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.filteredGenerationTasks)
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
      this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.filteredGenerationTasks)
    },

    toggleTaskSelection(id: string) {
      if (this.selectedTaskIds.includes(id)) {
        this.selectedTaskIds = this.selectedTaskIds.filter((selectedId) => selectedId !== id)
        return
      }
      if (this.generationTasks.some((task) => task.id === id)) {
        this.selectedTaskIds = [...this.selectedTaskIds, id]
      }
    },

    selectTaskIds(ids: string[]) {
      this.selectedTaskIds = pruneSelectedTaskIds(ids, this.generationTasks)
    },

    clearSelectedTasks() {
      this.selectedTaskIds = []
    },

    async createImageGenerationTask(input: CreateImageGenerationTaskInput) {
      this.lastTaskError = ''
      const normalizedInput = withNormalizedImageCount(input)
      if (!hasTauriRuntime()) {
        this.generationTasks = pruneTasks([createFallbackTask(normalizedInput), ...this.generationTasks])
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        const queuedTasks = await invoke<GenerationTask[]>('create_image_generation_task', { input: normalizedInput })
        const task = queuedTasks.find((item) => item.taskType === 'image_generation' && item.status === 'pending')
        this.generationTasks = task
          ? await invoke<GenerationTask[]>('run_image_generation_task', { taskId: task.id })
          : queuedTasks
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
        this.generationTasks = pruneTasks([createFallbackTask(normalizedInput), ...this.generationTasks])
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async createBatchImageGenerationTasks(input: CreateBatchImageGenerationTasksInput) {
      this.lastTaskError = ''
      const prompts = input.prompts.map((prompt) => prompt.trim()).filter(Boolean)
      if (!prompts.length) {
        this.lastTaskError = '批量生成至少需要一条提示词'
        return
      }
      const normalizedInput = withNormalizedImageCount({ ...input, prompts })

      if (!hasTauriRuntime()) {
        this.generationTasks = pruneTasks([...createFallbackBatchTasks(normalizedInput), ...this.generationTasks])
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        let tasks = await invoke<GenerationTask[]>('create_batch_image_generation_tasks', {
          input: {
            ...normalizedInput,
            shotIds: normalizedInput.shotIds ?? [],
            models: normalizedInput.models ?? [],
            referenceImages: normalizedInput.referenceImages ?? [],
          },
        })
        const pendingTasks = tasks
          .filter((task) => task.taskType === 'image_generation' && task.status === 'pending')
          .slice()
          .reverse()
        for (const task of pendingTasks) {
          tasks = await invoke<GenerationTask[]>('run_image_generation_task', { taskId: task.id })
        }
        this.generationTasks = tasks
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
        this.generationTasks = pruneTasks([...createFallbackBatchTasks(normalizedInput), ...this.generationTasks])
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async runGenerationTask(taskId: string) {
      this.lastTaskError = ''
      const task = this.generationTasks.find((item) => item.id === taskId)
      if (!task || task.status !== 'pending') {
        return
      }

      if (!hasTauriRuntime()) {
        this.generationTasks = this.generationTasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                status: 'succeeded',
                progressCurrent: item.progressTotal,
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                output: { browserFallback: true },
              }
            : item,
        )
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        this.generationTasks = await invoke<GenerationTask[]>('run_image_generation_task', { taskId })
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async runPendingGenerationTasks(limit = 20) {
      this.lastTaskError = ''
      const pendingTaskIds = this.generationTasks
        .filter((task) => task.taskType === 'image_generation' && task.status === 'pending')
        .slice(0, limit)
        .map((task) => task.id)
      if (!pendingTaskIds.length) {
        return
      }

      if (!hasTauriRuntime()) {
        const pendingSet = new Set(pendingTaskIds)
        this.generationTasks = this.generationTasks.map((task) =>
          pendingSet.has(task.id)
            ? {
                ...task,
                status: 'succeeded',
                progressCurrent: task.progressTotal,
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                output: { browserFallback: true },
              }
            : task,
        )
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        let tasks = this.generationTasks
        for (const taskId of pendingTaskIds) {
          tasks = await invoke<GenerationTask[]>('run_image_generation_task', { taskId })
        }
        this.generationTasks = tasks
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async cancelGenerationTask(taskId: string) {
      this.lastTaskError = ''
      if (!hasTauriRuntime()) {
        this.generationTasks = this.generationTasks.map((task) =>
          task.id === taskId ? { ...task, status: 'cancelled', finishedAt: new Date().toISOString() } : task,
        )
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        this.generationTasks = await invoke<GenerationTask[]>('cancel_generation_task', { taskId })
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async retryGenerationTask(taskId: string) {
      this.lastTaskError = ''
      if (!hasTauriRuntime()) {
        const task = this.generationTasks.find((item) => item.id === taskId)
        if (task) {
          this.generationTasks = pruneTasks([
            {
              ...task,
              id: `task-${Date.now()}`,
              status: 'pending',
              error: undefined,
              output: {},
              progressCurrent: 0,
              startedAt: undefined,
              finishedAt: undefined,
              retryOf: task.id,
            },
            ...this.generationTasks,
          ])
          this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        }
        return
      }

      this.isLoadingTasks = true
      try {
        const queuedTasks = await invoke<GenerationTask[]>('retry_generation_task', { taskId })
        const retriedTask = queuedTasks.find((task) => task.retryOf === taskId && task.status === 'pending')
        this.generationTasks = retriedTask
          ? await invoke<GenerationTask[]>('run_image_generation_task', { taskId: retriedTask.id })
          : queuedTasks
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },

    async runSelectedPendingGenerationTasks(limit = 20) {
      const selectedSet = new Set(this.selectedTaskIds)
      const taskIds = this.generationTasks
        .filter((task) => selectedSet.has(task.id) && task.taskType === 'image_generation' && task.status === 'pending')
        .slice(0, limit)
        .map((task) => task.id)
      for (const taskId of taskIds) {
        await this.runGenerationTask(taskId)
      }
    },

    async cancelSelectedGenerationTasks() {
      const selectedSet = new Set(this.selectedTaskIds)
      const taskIds = this.generationTasks
        .filter((task) => selectedSet.has(task.id) && (task.status === 'pending' || task.status === 'running'))
        .map((task) => task.id)
      for (const taskId of taskIds) {
        await this.cancelGenerationTask(taskId)
      }
    },

    async clearFinishedGenerationTasks() {
      this.lastTaskError = ''
      const isFinished = (task: GenerationTask) => task.status === 'succeeded' || task.status === 'cancelled'
      if (!hasTauriRuntime()) {
        this.generationTasks = this.generationTasks.filter((task) => !isFinished(task))
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
        return
      }

      this.isLoadingTasks = true
      try {
        this.generationTasks = await invoke<GenerationTask[]>('clear_finished_generation_tasks')
        this.selectedTaskIds = pruneSelectedTaskIds(this.selectedTaskIds, this.generationTasks)
      } catch (error) {
        this.lastTaskError = formatError(error)
      } finally {
        this.isLoadingTasks = false
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTaskStore, import.meta.hot))
}
