import { invoke } from '@tauri-apps/api/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { promptMarketSnapshot } from '../data/promptMarketSnapshot'
import { parsePromptAssets, type PromptAsset, type PromptSource, type PromptUseCase } from '../utils/promptMarket'
import { hasTauriRuntime } from '../utils/tauriRuntime'

export type PromptSourceFilter = 'all' | PromptSource
export type PromptUseCaseFilter = 'all' | PromptUseCase
export type SyncablePromptSource = 'glidea' | 'evolink'

export const promptSourceOptions: Array<{ value: PromptSourceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'builtin', label: '内置' },
  { value: 'glidea', label: 'glidea' },
  { value: 'evolink', label: 'EvoLinkAI' },
  { value: 'custom_json', label: '自定义' },
]

export const promptUseCaseOptions: Array<{ value: PromptUseCaseFilter; label: string }> = [
  { value: 'all', label: '全部用途' },
  { value: 'txt2img', label: '文生图' },
  { value: 'img2img', label: '图生图' },
  { value: 'icon', label: 'ICON' },
  { value: 'storyboard', label: '分镜' },
  { value: 'reference', label: '参考' },
  { value: 'workflow', label: '工作流' },
]

export function getPromptUseCaseLabel(useCase: PromptUseCase) {
  return promptUseCaseOptions.find((option) => option.value === useCase)?.label ?? useCase
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function mergePromptAssets(current: PromptAsset[], incoming: PromptAsset[]) {
  const next = [...current]
  const indexes = new Map<string, number>()

  next.forEach((asset, index) => {
    const key = asset.sourceId ? `${asset.source}:${asset.sourceId}` : asset.content
    indexes.set(key, index)
  })

  for (const asset of incoming) {
    const key = asset.sourceId ? `${asset.source}:${asset.sourceId}` : asset.content
    const existingIndex = indexes.get(key)
    if (existingIndex === undefined) {
      indexes.set(key, next.length)
      next.push(asset)
    } else {
      next[existingIndex] = {
        ...next[existingIndex],
        ...asset,
        favorite: next[existingIndex].favorite,
        usageCount: next[existingIndex].usageCount,
      }
    }
  }

  return next
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '提示词市场操作失败')
}

interface PromptSourcePayload {
  source: SyncablePromptSource
  url: string
  content: string
}

export const usePromptMarketStore = defineStore('promptMarket', {
  state: () => ({
    promptAssets: [...promptMarketSnapshot] as PromptAsset[],
    sourceFilter: 'all' as PromptSourceFilter,
    useCaseFilter: 'all' as PromptUseCaseFilter,
    favoriteOnly: false,
    searchQuery: '',
    isLoadingPrompts: false,
    isSyncingPrompts: false,
    lastImportError: '',
    lastSyncMessage: '',
  }),

  getters: {
    filteredPromptAssets: (state) => {
      const query = normalized(state.searchQuery)
      return state.promptAssets.filter((asset) => {
        const matchesSource = state.sourceFilter === 'all' || asset.source === state.sourceFilter
        const matchesUseCase = state.useCaseFilter === 'all' || asset.useCases.includes(state.useCaseFilter)
        const matchesFavorite = !state.favoriteOnly || asset.favorite
        const searchable = [
          asset.title,
          asset.content,
          asset.author,
          asset.source,
          ...asset.categories,
          ...asset.tags,
          ...asset.useCases,
        ]
          .map((item) => normalized(item))
          .join(' ')
        const matchesQuery = !query || searchable.includes(query)

        return matchesSource && matchesUseCase && matchesFavorite && matchesQuery
      })
    },
  },

  actions: {
    async loadPromptAssets() {
      this.isLoadingPrompts = true
      this.lastImportError = ''
      if (!hasTauriRuntime()) {
        this.promptAssets = [...promptMarketSnapshot]
        this.isLoadingPrompts = false
        return
      }

      try {
        const assets = await invoke<PromptAsset[]>('list_prompt_assets')
        if (assets.length) {
          this.promptAssets = assets
        } else {
          this.promptAssets = await invoke<PromptAsset[]>('import_prompt_assets', {
            assets: promptMarketSnapshot,
          })
        }
      } catch (error) {
        this.lastImportError = formatError(error)
        this.promptAssets = [...promptMarketSnapshot]
      } finally {
        this.isLoadingPrompts = false
      }
    },

    setSourceFilter(source: PromptSourceFilter) {
      this.sourceFilter = source
    },

    setUseCaseFilter(useCase: PromptUseCaseFilter) {
      this.useCaseFilter = useCase
    },

    setFavoriteOnly(enabled: boolean) {
      this.favoriteOnly = enabled
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    async importPromptJson(input: unknown, source: PromptSource = 'custom_json') {
      this.lastImportError = ''
      const assets = parsePromptAssets(input, { source })
      if (!assets.length) {
        this.lastImportError = '未识别到可导入的提示词'
        return 0
      }
      this.promptAssets = mergePromptAssets(this.promptAssets, assets)
      if (!hasTauriRuntime()) {
        return assets.length
      }

      try {
        this.promptAssets = await invoke<PromptAsset[]>('import_prompt_assets', { assets })
      } catch (error) {
        this.lastImportError = formatError(error)
      }
      return assets.length
    },

    async importPromptJsonText(text: string, source: PromptSource = 'custom_json') {
      this.lastImportError = ''
      try {
        const input = JSON.parse(text)
        return await this.importPromptJson(input, source)
      } catch (error) {
        this.lastImportError = error instanceof SyntaxError ? 'JSON 格式错误，无法导入' : formatError(error)
        return 0
      }
    },

    async syncPromptSource(source: SyncablePromptSource) {
      this.isSyncingPrompts = true
      this.lastImportError = ''
      this.lastSyncMessage = ''
      if (!hasTauriRuntime()) {
        this.lastImportError = '桌面应用中可同步 GitHub 最新提示词'
        this.isSyncingPrompts = false
        return 0
      }

      try {
        const payload = await invoke<PromptSourcePayload>('sync_prompt_source', { source })
        const count = await this.importPromptJsonText(payload.content, payload.source)
        if (count > 0) {
          this.sourceFilter = payload.source
          this.lastSyncMessage = `已从 ${payload.source === 'glidea' ? 'glidea' : 'EvoLinkAI'} 同步 ${count} 条提示词`
        }
        return count
      } catch (error) {
        this.lastImportError = formatError(error)
        return 0
      } finally {
        this.isSyncingPrompts = false
      }
    },

    async markPromptUsed(id: string) {
      const prompt = this.promptAssets.find((item) => item.id === id)
      if (prompt) {
        prompt.usageCount += 1
      }
      if (!hasTauriRuntime()) {
        return
      }
      try {
        this.promptAssets = await invoke<PromptAsset[]>('increment_prompt_usage', { id })
      } catch {
        // Browser-only fallback keeps offline prompt usage responsive without Tauri IPC.
      }
    },

    async togglePromptFavorite(id: string) {
      const prompt = this.promptAssets.find((item) => item.id === id)
      const previousFavorite = prompt?.favorite
      if (prompt) {
        prompt.favorite = !prompt.favorite
      }
      if (!hasTauriRuntime()) {
        return
      }
      try {
        this.promptAssets = await invoke<PromptAsset[]>('toggle_prompt_favorite', { id })
      } catch (error) {
        if (prompt && previousFavorite !== undefined) {
          prompt.favorite = previousFavorite
        }
        this.lastImportError = formatError(error)
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePromptMarketStore, import.meta.hot))
}
