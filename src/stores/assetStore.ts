import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { createDefaultCreativeAssets } from '../data/defaultCreativeAssets'
import { hasTauriRuntime } from '../utils/tauriRuntime'

export type CreativeAssetKind = 'image' | 'icon' | 'storyboard_frame' | 'reference' | 'pdf' | 'zip' | 'json_export'
export type AssetKindFilter = 'all' | CreativeAssetKind

export interface AssetFilters {
  kindFilter: AssetKindFilter
  favoriteOnly: boolean
  searchQuery: string
  modelFilter: string
  workflowFilter: string
}

export interface CreativeAsset {
  id: string
  kind: CreativeAssetKind
  uri: string
  previewUri?: string
  thumbnailUri?: string
  promptText?: string
  negativePrompt?: string
  modelProfileId?: string
  width?: number
  height?: number
  seed?: number
  sourceTaskId?: string
  projectId?: string
  workflowId?: string
  tags: string[]
  favorite: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error || '资产加载失败')
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function filterCreativeAssets(assets: CreativeAsset[], filters: AssetFilters) {
  const query = normalized(filters.searchQuery)
  const model = normalized(filters.modelFilter)
  const workflow = normalized(filters.workflowFilter)

  return assets.filter(asset => {
    const matchesKind = filters.kindFilter === 'all' || asset.kind === filters.kindFilter
    const matchesFavorite = !filters.favoriteOnly || asset.favorite
    const matchesModel = !model || model === 'all' || normalized(asset.modelProfileId) === model
    const matchesWorkflow = !workflow || workflow === 'all' || normalized(asset.workflowId) === workflow
    const searchable = [
      asset.promptText,
      asset.negativePrompt,
      asset.modelProfileId,
      asset.workflowId,
      asset.sourceTaskId,
      asset.projectId,
      asset.uri,
      JSON.stringify(asset.metadata ?? {}),
      ...asset.tags,
    ]
      .map(item => normalized(item))
      .join(' ')
    const matchesQuery = !query || searchable.includes(query)

    return matchesKind && matchesFavorite && matchesModel && matchesWorkflow && matchesQuery
  })
}

export function pruneSelectedAssetIds(selectedIds: string[], assets: CreativeAsset[]) {
  const availableIds = new Set(assets.map(asset => asset.id))
  return Array.from(new Set(selectedIds.filter(id => availableIds.has(id))))
}

export function mergeAssetTags(current: string[], incoming: string[]) {
  const tags = new Set(current.map(tag => tag.trim()).filter(Boolean))
  for (const tag of incoming.map(item => item.trim()).filter(Boolean)) {
    tags.add(tag)
  }
  return Array.from(tags)
}

function extensionFromUri(uri: string) {
  const mimeMatch = uri.match(/^data:([^;,]+)/)
  if (mimeMatch) {
    const mimeExtensions: Record<string, string> = {
      'application/json': 'json',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    }
    return mimeExtensions[mimeMatch[1]] ?? 'bin'
  }

  const pathname = uri.split('?')[0]?.split('#')[0] ?? ''
  const extMatch = pathname.match(/\.([a-z0-9]{2,5})$/i)
  return extMatch?.[1]?.toLowerCase() ?? ''
}

function isDirectPreviewUri(uri: string | undefined) {
  const value = uri?.trim() ?? ''
  return (
    value.startsWith('asset:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  )
}

function isLocalFilePath(uri: string) {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(uri.trim())
}

function resolvePreviewSource(previewUri: string | undefined, fallbackUri: string) {
  const preview = previewUri?.trim() ?? ''
  if (preview) {
    if (isDirectPreviewUri(preview)) {
      return preview
    }
    if (hasTauriRuntime() && isLocalFilePath(preview)) {
      return convertFileSrc(preview)
    }
    return preview
  }

  const fallback = fallbackUri.trim()
  if (!fallback) {
    return ''
  }
  if (isDirectPreviewUri(fallback)) {
    return fallback
  }
  if (hasTauriRuntime() && isLocalFilePath(fallback)) {
    return convertFileSrc(fallback)
  }
  return ''
}

export function resolveAssetPreviewSrc(asset: CreativeAsset | undefined) {
  if (!asset) {
    return ''
  }
  return resolvePreviewSource(asset.previewUri, asset.thumbnailUri?.trim() || asset.uri.trim())
}

export function resolveReferenceImagePreviewSrc(image: Pick<CreativeAsset, 'uri' | 'previewUri'> | undefined) {
  if (!image) {
    return ''
  }
  return resolvePreviewSource(image.previewUri, image.uri)
}

export function canPreviewAsset(asset: CreativeAsset | undefined) {
  return Boolean(resolveAssetPreviewSrc(asset))
}

export function canUseAssetAsReference(asset: CreativeAsset) {
  return Boolean(asset.uri.trim() || asset.previewUri?.trim())
}

export function canDownloadAsset(asset: CreativeAsset) {
  return Boolean(asset.uri.trim())
}

export function createAssetDownloadName(asset: CreativeAsset) {
  const extension =
    extensionFromUri(asset.uri) ||
    (
      {
        icon: 'png',
        image: 'png',
        storyboard_frame: 'png',
        reference: 'png',
        pdf: 'pdf',
        zip: 'zip',
        json_export: 'json',
      } satisfies Record<CreativeAssetKind, string>
    )[asset.kind]
  return `samimage-${asset.kind}-${asset.id}.${extension}`
}

export async function chooseAssetDownloadPath(asset: CreativeAsset) {
  if (!hasTauriRuntime()) {
    return undefined
  }
  return invoke<string | null>('choose_asset_download_path', {
    defaultFileName: createAssetDownloadName(asset),
  })
}

export const useAssetStore = defineStore('asset', {
  state: () => ({
    creativeAssets: [] as CreativeAsset[],
    kindFilter: 'all' as AssetKindFilter,
    favoriteOnly: false,
    searchQuery: '',
    modelFilter: 'all',
    workflowFilter: 'all',
    selectedAssetIds: [] as string[],
    isLoadingAssets: false,
    lastAssetError: '',
  }),

  getters: {
    filteredCreativeAssets: state =>
      filterCreativeAssets(state.creativeAssets, {
        kindFilter: state.kindFilter,
        favoriteOnly: state.favoriteOnly,
        searchQuery: state.searchQuery,
        modelFilter: state.modelFilter,
        workflowFilter: state.workflowFilter,
      }),
    selectedCreativeAssets: state => state.creativeAssets.filter(asset => state.selectedAssetIds.includes(asset.id)),
    selectedAssetCount: state => state.selectedAssetIds.length,
  },

  actions: {
    async loadAssets() {
      this.lastAssetError = ''
      if (!hasTauriRuntime()) {
        if (!this.creativeAssets.length) {
          this.creativeAssets = createDefaultCreativeAssets()
        }
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
        return
      }

      this.isLoadingAssets = true
      try {
        this.creativeAssets = await invoke<CreativeAsset[]>('list_assets')
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
      } catch (error) {
        this.lastAssetError = formatError(error)
        this.creativeAssets = []
        this.selectedAssetIds = []
      } finally {
        this.isLoadingAssets = false
      }
    },

    setKindFilter(kind: AssetKindFilter) {
      this.kindFilter = kind
    },

    setFavoriteOnly(enabled: boolean) {
      this.favoriteOnly = enabled
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    setModelFilter(model: string) {
      this.modelFilter = model
    },

    setWorkflowFilter(workflow: string) {
      this.workflowFilter = workflow
    },

    toggleAssetSelection(id: string) {
      if (this.selectedAssetIds.includes(id)) {
        this.selectedAssetIds = this.selectedAssetIds.filter(selectedId => selectedId !== id)
        return
      }
      if (this.creativeAssets.some(asset => asset.id === id)) {
        this.selectedAssetIds = [...this.selectedAssetIds, id]
      }
    },

    selectAssetIds(ids: string[]) {
      this.selectedAssetIds = pruneSelectedAssetIds(ids, this.creativeAssets)
    },

    clearSelectedAssets() {
      this.selectedAssetIds = []
    },

    async toggleAssetFavorite(id: string) {
      const asset = this.creativeAssets.find(item => item.id === id)
      const previousFavorite = asset?.favorite
      if (asset) {
        asset.favorite = !asset.favorite
      }

      if (!hasTauriRuntime()) {
        return
      }

      try {
        this.creativeAssets = await invoke<CreativeAsset[]>('toggle_asset_favorite', { id })
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
      } catch (error) {
        if (asset && previousFavorite !== undefined) {
          asset.favorite = previousFavorite
        }
        this.lastAssetError = formatError(error)
      }
    },

    async deleteAsset(id: string) {
      const previousAssets = [...this.creativeAssets]
      this.creativeAssets = this.creativeAssets.filter(asset => asset.id !== id)
      this.selectedAssetIds = this.selectedAssetIds.filter(selectedId => selectedId !== id)

      if (!hasTauriRuntime()) {
        return
      }

      try {
        this.creativeAssets = await invoke<CreativeAsset[]>('delete_asset', { id })
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
      } catch (error) {
        this.creativeAssets = previousAssets
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
        this.lastAssetError = formatError(error)
      }
    },

    async deleteAssets(ids: string[]) {
      const idsToDelete = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)))
      if (!idsToDelete.length) {
        return
      }

      const previousAssets = [...this.creativeAssets]
      const deleteSet = new Set(idsToDelete)
      this.creativeAssets = this.creativeAssets.filter(asset => !deleteSet.has(asset.id))
      this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)

      if (!hasTauriRuntime()) {
        return
      }

      try {
        this.creativeAssets = await invoke<CreativeAsset[]>('delete_assets', { ids: idsToDelete })
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
      } catch (error) {
        this.creativeAssets = previousAssets
        this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
        this.lastAssetError = formatError(error)
      }
    },

    async addTagsToAssets(ids: string[], tags: string[]) {
      const idsToTag = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)))
      const cleanedTags = Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean)))
      if (!idsToTag.length || !cleanedTags.length) {
        return
      }

      this.creativeAssets = this.creativeAssets.map(asset =>
        idsToTag.includes(asset.id) ? { ...asset, tags: mergeAssetTags(asset.tags, cleanedTags) } : asset
      )
      this.selectedAssetIds = pruneSelectedAssetIds(this.selectedAssetIds, this.creativeAssets)
      this.lastAssetError = ''

      if (!hasTauriRuntime()) {
        return
      }

      this.lastAssetError = '桌面应用中可批量打标签'
    },

    async exportIconPackage(assetId: string) {
      this.lastAssetError = ''
      const source = this.creativeAssets.find(asset => asset.id === assetId)
      if (!source || source.kind !== 'icon') {
        this.lastAssetError = '请选择 ICON 资产后再导出图标包'
        return undefined
      }
      if (!hasTauriRuntime()) {
        this.lastAssetError = '桌面应用中可导出 ICON 图标包'
        return undefined
      }

      try {
        const exported = await invoke<CreativeAsset>('export_icon_package', { assetId })
        this.creativeAssets = [exported, ...this.creativeAssets.filter(asset => asset.id !== exported.id)]
        return exported
      } catch (error) {
        this.lastAssetError = formatError(error)
        return undefined
      }
    },

    async downloadAssetToPath(assetId: string, destinationPath: string) {
      this.lastAssetError = ''
      if (!hasTauriRuntime()) {
        this.lastAssetError = '桌面应用中可选择本地保存路径'
        return undefined
      }

      try {
        return await invoke<string>('download_asset_to_path', { assetId, destinationPath })
      } catch (error) {
        this.lastAssetError = formatError(error)
        return undefined
      }
    },

    async downloadAssetWithDialog(assetId: string) {
      this.lastAssetError = ''
      if (!hasTauriRuntime()) {
        this.lastAssetError = '桌面应用中可选择本地保存路径'
        return undefined
      }

      try {
        return await invoke<string | null>('download_asset_with_dialog', { assetId })
      } catch (error) {
        this.lastAssetError = formatError(error)
        return undefined
      }
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAssetStore, import.meta.hot))
}
