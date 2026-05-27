import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStoryboardStore, type StoryboardDraft } from '../../src/stores/storyboardStore'

const storyboardDraft: StoryboardDraft = {
  project: {
    id: 'project-storyboard',
    projectType: 'storyboard',
    name: '测试分镜',
    description: '用于验证工作流切换的分镜草案',
    status: 'draft',
    settings: { draftProvider: 'unit-test' },
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
  },
  characters: [],
  scenes: [],
  shots: [
    {
      id: 'shot-1',
      projectId: 'project-storyboard',
      orderIndex: 0,
      title: '建立镜头',
      description: '测试镜头',
      promptText: 'cinematic test shot',
      framing: 'wide shot',
      angle: 'eye level',
      movement: 'static',
      status: 'draft',
    },
  ],
}

describe('storyboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('clears the active storyboard draft without deleting known projects', () => {
    const store = useStoryboardStore()
    store.currentDraft = storyboardDraft
    store.storyboardProjects = [storyboardDraft.project]
    store.lastStoryboardError = '旧错误'

    store.clearCurrentDraft()

    expect(store.currentDraft).toBeNull()
    expect(store.hasStoryboardDraft).toBe(false)
    expect(store.storyboardProjects).toEqual([storyboardDraft.project])
    expect(store.lastStoryboardError).toBe('')
  })
})
