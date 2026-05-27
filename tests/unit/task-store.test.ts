import { describe, expect, it } from 'vitest'
import {
  filterGenerationTasks,
  getGenerationTaskStatusCounts,
  normalizeGenerationImageCount,
  pruneSelectedTaskIds,
  type GenerationTask,
} from '../../src/stores/taskStore'

const baseTask: GenerationTask = {
  id: 'task-1',
  groupId: 'group-1',
  projectId: 'project-1',
  taskType: 'image_generation',
  status: 'pending',
  priority: 0,
  input: {
    workflowId: 'storyboard',
    promptText: '雨夜街道分镜',
    referenceImages: ['data:image/png;base64,ref'],
    negativePrompt: '水印',
    model: 'image-a',
    imageSize: '1024x1024',
    quality: 'high',
    shotId: 'shot-1',
  },
  output: {},
  progressCurrent: 0,
  progressTotal: 1,
  createdAt: '2026-05-22T00:00:00.000Z',
}

describe('task store helpers', () => {
  it('filters generation tasks by status, workflow, project, and keyword', () => {
    const tasks: GenerationTask[] = [
      baseTask,
      {
        ...baseTask,
        id: 'task-2',
        projectId: undefined,
        status: 'failed',
        input: {
          ...baseTask.input,
          workflowId: 'icon',
          promptText: '蓝色天气图标',
          model: 'image-b',
        },
        error: 'provider timeout',
      },
    ]

    const filtered = filterGenerationTasks(tasks, {
      statusFilter: 'failed',
      workflowFilter: 'icon',
      modelFilter: 'all',
      projectFilter: 'all',
      searchQuery: '天气',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('task-2')
  })

  it('filters generation tasks by exact model id', () => {
    const tasks: GenerationTask[] = [
      baseTask,
      {
        ...baseTask,
        id: 'task-2',
        input: {
          ...baseTask.input,
          model: 'image-b',
        },
      },
    ]

    const filtered = filterGenerationTasks(tasks, {
      statusFilter: 'all',
      workflowFilter: 'all',
      modelFilter: 'image-b',
      projectFilter: 'all',
      searchQuery: '',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('task-2')
  })

  it('counts task statuses for queue summary cards', () => {
    const counts = getGenerationTaskStatusCounts([
      baseTask,
      { ...baseTask, id: 'task-2', status: 'succeeded' },
      { ...baseTask, id: 'task-3', status: 'cancelled' },
    ])

    expect(counts.total).toBe(3)
    expect(counts.pending).toBe(1)
    expect(counts.succeeded).toBe(1)
    expect(counts.cancelled).toBe(1)
  })

  it('prunes selected task ids after loading or clearing tasks', () => {
    const pruned = pruneSelectedTaskIds(['task-2', 'missing', 'task-1', 'task-2'], [
      baseTask,
      { ...baseTask, id: 'task-2' },
    ])

    expect(pruned).toEqual(['task-2', 'task-1'])
  })

  it('forces image-to-image tasks to request a single output', () => {
    expect(normalizeGenerationImageCount('img2img', 2)).toBe(1)
    expect(normalizeGenerationImageCount('img2img', 8)).toBe(1)
    expect(normalizeGenerationImageCount('icon', 2)).toBe(1)
    expect(normalizeGenerationImageCount('daily', 12)).toBe(8)
    expect(normalizeGenerationImageCount('daily', 0)).toBe(1)
  })
})
