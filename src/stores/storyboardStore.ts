import { invoke } from '@tauri-apps/api/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { hasTauriRuntime } from '../utils/tauriRuntime'
import type { CreativeAsset } from './assetStore'

export interface StoryboardDraftInput {
  concept: string
  projectName: string
  styleHint: string
  shotCount: number
}

export interface StoryboardProject {
  id: string
  projectType: string
  name: string
  description?: string
  status: string
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StoryboardCharacter {
  id: string
  projectId: string
  name: string
  role: string
  appearance: string
  personality?: string
  referenceAssetIds: string[]
}

export interface StoryboardScene {
  id: string
  projectId: string
  name: string
  summary: string
  location: string
  timeOfDay?: string
  mood?: string
  orderIndex: number
}

export interface StoryboardShot {
  id: string
  projectId: string
  sceneId?: string
  orderIndex: number
  title: string
  description: string
  promptText: string
  framing: string
  angle: string
  movement: string
  durationSec?: number
  transition?: string
  assetId?: string
  status: 'draft' | 'ready' | 'generating' | 'done' | 'failed'
}

export interface StoryboardDraft {
  project: StoryboardProject
  characters: StoryboardCharacter[]
  scenes: StoryboardScene[]
  shots: StoryboardShot[]
}

export interface UpdateStoryboardShotInput {
  id: string
  title: string
  description: string
  promptText: string
  framing: string
  angle: string
  movement: string
  durationSec?: number
  transition?: string
  status: StoryboardShot['status']
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '分镜草案生成失败')
}

function createBrowserFallbackDraft(input: StoryboardDraftInput): StoryboardDraft {
  const projectId = `project-${Date.now()}`
  const sceneId = `scene-${Date.now()}`
  const concept = input.concept.trim() || '未命名故事概念'
  const shotTitles = ['建立镜头', '角色亮相', '关键动作', '情绪反应', '收束镜头']
  const now = new Date().toISOString()
  return {
    project: {
      id: projectId,
      projectType: 'storyboard',
      name: input.projectName.trim() || '未命名分镜项目',
      description: concept,
      status: 'draft',
      settings: { styleHint: input.styleHint, draftProvider: 'browser-fallback' },
      createdAt: now,
      updatedAt: now,
    },
    characters: [
      {
        id: `character-${Date.now()}-lead`,
        projectId,
        name: '主角',
        role: 'protagonist',
        appearance: '与故事概念一致的核心人物',
        personality: '目标明确，情绪可见',
        referenceAssetIds: [],
      },
    ],
    scenes: [
      {
        id: sceneId,
        projectId,
        name: '核心场景',
        summary: `围绕“${concept}”展开的主要视觉段落`,
        location: '按故事概念设定的主要空间',
        timeOfDay: '高辨识度光线',
        mood: '电影感',
        orderIndex: 0,
      },
    ],
    shots: shotTitles.slice(0, Math.max(3, Math.min(12, input.shotCount))).map((title, index) => ({
      id: `shot-${Date.now()}-${index}`,
      projectId,
      sceneId,
      orderIndex: index,
      title,
      description: `${title}：推进“${concept}”的叙事信息`,
      promptText: `${concept}，${title}，${input.styleHint}，电影感分镜画面`,
      framing: index === 0 ? 'wide shot' : 'medium shot',
      angle: 'eye level',
      movement: index === 0 ? 'slow push in' : 'static hold',
      durationSec: 4,
      transition: index === 0 ? 'fade in' : 'cut',
      status: 'draft',
    })),
  }
}

export const useStoryboardStore = defineStore('storyboard', {
  state: () => ({
    currentDraft: null as StoryboardDraft | null,
    storyboardProjects: [] as StoryboardProject[],
    isLoadingProjects: false,
    isGeneratingDraft: false,
    isExportingPdf: false,
    lastStoryboardError: '',
  }),

  getters: {
    hasStoryboardDraft: (state) => Boolean(state.currentDraft),
  },

  actions: {
    clearCurrentDraft() {
      this.currentDraft = null
      this.lastStoryboardError = ''
    },

    async loadStoryboardProjects() {
      this.lastStoryboardError = ''
      if (!hasTauriRuntime()) {
        this.storyboardProjects = this.currentDraft ? [this.currentDraft.project] : []
        return
      }

      this.isLoadingProjects = true
      try {
        this.storyboardProjects = await invoke<StoryboardProject[]>('list_storyboard_projects')
      } catch (error) {
        this.lastStoryboardError = formatError(error)
        this.storyboardProjects = []
      } finally {
        this.isLoadingProjects = false
      }
    },

    async openStoryboardProject(projectId: string) {
      this.lastStoryboardError = ''
      if (!hasTauriRuntime()) {
        if (this.currentDraft?.project.id === projectId) {
          return this.currentDraft
        }
        return null
      }

      try {
        const draft = await invoke<StoryboardDraft | null>('load_storyboard_draft', { projectId })
        if (draft) {
          this.currentDraft = draft
        } else {
          this.lastStoryboardError = '未找到分镜项目'
        }
        return draft
      } catch (error) {
        this.lastStoryboardError = formatError(error)
        return null
      }
    },

    async updateStoryboardShot(input: UpdateStoryboardShotInput) {
      this.lastStoryboardError = ''
      if (!this.currentDraft) {
        return null
      }
      if (!hasTauriRuntime()) {
        const shot = this.currentDraft.shots.find((item) => item.id === input.id)
        if (shot) {
          Object.assign(shot, input)
        }
        return this.currentDraft
      }

      try {
        const draft = await invoke<StoryboardDraft>('update_storyboard_shot', { input })
        this.currentDraft = draft
        return draft
      } catch (error) {
        this.lastStoryboardError = formatError(error)
        return null
      }
    },

    async reorderStoryboardShots(projectId: string, shotIds: string[]) {
      this.lastStoryboardError = ''
      if (!this.currentDraft) {
        return null
      }
      if (!hasTauriRuntime()) {
        const order = new Map(shotIds.map((id, index) => [id, index]))
        this.currentDraft.shots = [...this.currentDraft.shots]
          .sort((left, right) => (order.get(left.id) ?? left.orderIndex) - (order.get(right.id) ?? right.orderIndex))
          .map((shot, index) => ({ ...shot, orderIndex: index }))
        return this.currentDraft
      }

      try {
        const draft = await invoke<StoryboardDraft>('reorder_storyboard_shots', { projectId, shotIds })
        this.currentDraft = draft
        await this.loadStoryboardProjects()
        return draft
      } catch (error) {
        this.lastStoryboardError = formatError(error)
        return null
      }
    },

    async createStoryboardDraft(input: StoryboardDraftInput) {
      this.lastStoryboardError = ''
      const normalizedInput = {
        ...input,
        concept: input.concept.trim(),
        projectName: input.projectName.trim(),
        styleHint: input.styleHint.trim(),
        shotCount: Math.max(3, Math.min(12, input.shotCount || 6)),
      }
      if (!normalizedInput.concept) {
        this.lastStoryboardError = '故事概念不能为空'
        return
      }

      if (!hasTauriRuntime()) {
        this.currentDraft = createBrowserFallbackDraft(normalizedInput)
        this.storyboardProjects = [this.currentDraft.project]
        return
      }

      this.isGeneratingDraft = true
      try {
        this.currentDraft = await invoke<StoryboardDraft>('create_storyboard_draft', { input: normalizedInput })
        await this.loadStoryboardProjects()
      } catch (error) {
        this.lastStoryboardError = formatError(error)
      } finally {
        this.isGeneratingDraft = false
      }
    },

    async exportStoryboardPdf(projectId: string) {
      this.lastStoryboardError = ''
      if (!this.currentDraft || this.currentDraft.project.id !== projectId) {
        this.lastStoryboardError = '未找到可导出的分镜草案'
        return null
      }

      if (!hasTauriRuntime()) {
        return null
      }

      this.isExportingPdf = true
      try {
        return await invoke<CreativeAsset>('export_storyboard_pdf', { projectId })
      } catch (error) {
        this.lastStoryboardError = formatError(error)
        return null
      } finally {
        this.isExportingPdf = false
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useStoryboardStore, import.meta.hot))
}
