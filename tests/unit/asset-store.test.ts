import { describe, expect, it } from 'vitest'
import { createDefaultCreativeAssets } from '../../src/data/defaultCreativeAssets'
import {
  canDownloadAsset,
  canPreviewAsset,
  canUseAssetAsReference,
  createAssetDownloadName,
  filterCreativeAssets,
  pruneSelectedAssetIds,
  resolveAssetPreviewSrc,
  resolveReferenceImagePreviewSrc,
  type CreativeAsset,
} from '../../src/stores/assetStore'

const baseAsset: CreativeAsset = {
  id: 'asset-1',
  kind: 'image',
  uri: 'https://example.com/a.png',
  promptText: '清晨街角咖啡馆，暖色灯光',
  negativePrompt: '水印',
  modelProfileId: 'image-a',
  width: 1024,
  height: 1024,
  seed: 123,
  sourceTaskId: 'task-1',
  workflowId: 'daily',
  tags: ['generated', 'daily'],
  favorite: false,
  metadata: {},
  createdAt: '2026-05-22T00:00:00.000Z',
}

describe('asset store helpers', () => {
  it('filters assets by kind, favorite, keyword, model, and workflow', () => {
    const assets: CreativeAsset[] = [
      baseAsset,
      {
        ...baseAsset,
        id: 'asset-2',
        kind: 'icon',
        promptText: '蓝色天气应用图标',
        modelProfileId: 'image-b',
        workflowId: 'icon',
        favorite: true,
      },
    ]

    const filtered = filterCreativeAssets(assets, {
      kindFilter: 'icon',
      favoriteOnly: true,
      searchQuery: '天气',
      modelFilter: 'image-b',
      workflowFilter: 'icon',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('asset-2')
  })

  it('prunes selected asset ids after filtering, loading, or deletion', () => {
    const pruned = pruneSelectedAssetIds(['asset-2', 'asset-missing', 'asset-2', 'asset-1'], [
      baseAsset,
      { ...baseAsset, id: 'asset-2' },
    ])

    expect(pruned).toEqual(['asset-2', 'asset-1'])
  })

  it('searches task, project, and metadata fields for comparison results', () => {
    const filtered = filterCreativeAssets(
      [
        {
          ...baseAsset,
          id: 'asset-compare',
          projectId: 'project-a',
          workflowId: 'compare',
          metadata: { compareGroupId: 'group-compare-1' },
        },
      ],
      {
        kindFilter: 'all',
        favoriteOnly: false,
        searchQuery: 'group-compare-1',
        modelFilter: 'all',
        workflowFilter: 'all',
      },
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('asset-compare')
  })

  it('derives stable download names from asset kind and URI', () => {
    expect(createAssetDownloadName(baseAsset)).toBe('samimage-image-asset-1.png')
    expect(
      createAssetDownloadName({
        ...baseAsset,
        id: 'asset-webp',
        uri: 'data:image/webp;base64,abc',
      }),
    ).toBe('samimage-image-asset-webp.webp')
    expect(
      createAssetDownloadName({
        ...baseAsset,
        id: 'asset-pdf',
        kind: 'pdf',
        uri: 'assets/exports/storyboard.pdf?download=1',
      }),
    ).toBe('samimage-pdf-asset-pdf.pdf')
    expect(canDownloadAsset({ ...baseAsset, uri: '  ' })).toBe(false)
  })

  it('resolves local preview paths without requiring the stored URI to be online', () => {
    const localAsset: CreativeAsset = {
      ...baseAsset,
      uri: 'assets/images/generated/asset-1.png',
      previewUri: 'C:\\Users\\Sam\\AppData\\Roaming\\SamImage\\assets\\images\\generated\\asset-1.png',
    }

    expect(resolveAssetPreviewSrc(localAsset)).toBe(localAsset.previewUri)
    expect(canPreviewAsset(localAsset)).toBe(true)
    expect(canPreviewAsset({ ...localAsset, previewUri: undefined })).toBe(false)
    expect(canUseAssetAsReference(localAsset)).toBe(true)
  })

  it('renders reference images with local or direct preview sources', () => {
    expect(
      resolveReferenceImagePreviewSrc({
        uri: 'data:image/png;base64,abc',
        previewUri: undefined,
      }),
    ).toBe('data:image/png;base64,abc')
    expect(
      resolveReferenceImagePreviewSrc({
        uri: 'assets/images/generated/asset-1.png',
        previewUri: 'http://asset.localhost/C:/Users/Sam/AppData/Roaming/SamImage/assets/images/generated/asset-1.png',
      }),
    ).toBe(
      'http://asset.localhost/C:/Users/Sam/AppData/Roaming/SamImage/assets/images/generated/asset-1.png',
    )
  })

  it('provides default visual samples for browser preview without enabling generation', () => {
    const defaultAssets = createDefaultCreativeAssets()

    expect(defaultAssets).toHaveLength(3)
    expect(defaultAssets.every((asset) => asset.uri.startsWith('data:image/svg+xml'))).toBe(true)
    expect(defaultAssets.map((asset) => asset.workflowId)).toEqual(['daily', 'icon', 'storyboard'])
    expect(defaultAssets.map((asset) => asset.modelProfileId)).toEqual(['示例素材', '示例素材', '示例素材'])
    expect(defaultAssets.map((asset) => asset.tags[0])).toEqual(['示例', '示例', '示例'])
    expect(defaultAssets.every((asset) => asset.metadata.source === 'samimage_default_preview')).toBe(true)
    expect(decodeURIComponent(defaultAssets[0].uri)).toContain('日常生图草稿')
    expect(decodeURIComponent(defaultAssets[1].uri)).toContain('ICON 母图')
    expect(decodeURIComponent(defaultAssets[2].uri)).toContain('分镜帧示例')
  })
})
