import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../app'
import { invokeOptional, isTauriRuntime } from '@/services/tauri'

vi.mock('@/services/tauri', () => ({
  invokeOptional: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
}))

const mockedInvokeOptional = vi.mocked(invokeOptional)
const mockedIsTauriRuntime = vi.mocked(isTauriRuntime)

describe('app store generation bridge', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockedInvokeOptional.mockReset()
    mockedInvokeOptional.mockResolvedValue(null)
    mockedIsTauriRuntime.mockReset()
    mockedIsTauriRuntime.mockReturnValue(true)
  })

  it('does not expose the local preview model in default model configuration', () => {
    const store = useAppStore()

    expect(store.models.some((model) => model.id === 'local-preview')).toBe(false)
    expect(store.imageModels.some((model) => model.provider === 'local-preview')).toBe(false)
    expect(store.settings.defaultImageModelId).toBe('')
  })

  it('removes legacy local preview models from persisted app state', async () => {
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command === 'load_app_state') {
        return {
          models: [
            {
              id: 'local-preview',
              name: 'Local Preview',
              provider: 'local-preview',
              endpoint: '',
              apiKey: '',
              model: 'samimage-local-preview',
              kind: 'image',
              isPrimary: true,
              status: 'connected',
            },
            {
              id: 'remote-image',
              name: 'Remote Image',
              provider: 'openai-compatible',
              endpoint: 'https://api.example.test/v1/images/generations',
              apiKey: 'sk-image',
              model: 'gpt-image-1',
              kind: 'image',
              isPrimary: false,
              status: 'connected',
            },
            {
              id: 'text-polish',
              name: 'Text Polish',
              provider: 'openai-compatible',
              endpoint: '',
              apiKey: '',
              model: '',
              kind: 'text',
              isPrimary: false,
              status: 'untested',
            },
          ],
          prompts: [],
          tasks: [],
          coverPresets: [],
          settings: {
            defaultOutputDir: 'D:\\SamImage\\Exports',
            defaultExportFormat: 'png',
            defaultImageModelId: 'local-preview',
            defaultGenerationSize: 1024,
            defaultBatchSize: 1,
            defaultStyle: '自然',
            autoSaveHistory: true,
            includePromptMetadata: true,
            theme: 'dark',
          },
        }
      }
      if (command === 'list_generation_tasks') return []
      return null
    })
    const store = useAppStore()

    await store.loadPersistedTasks()

    expect(store.models.some((model) => model.id === 'local-preview')).toBe(false)
    expect(store.imageModels).toEqual([
      expect.objectContaining({
        id: 'remote-image',
        isPrimary: false,
      }),
    ])
    expect(store.settings.defaultImageModelId).toBe('remote-image')
  })

  it('removes blocked prompt categories from persisted app state', () => {
    localStorage.setItem('samimage.v3.state', JSON.stringify({
      models: [],
      prompts: [
        {
          id: 'prompt-agent-skill',
          title: 'Agent Skill',
          prompt: 'agent prompt',
          source: 'custom',
          sourceId: 'agent-skill',
          category: 'AGENT skill',
          subCategory: '',
          author: '',
          tags: ['AGENT skill'],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'prompt-website-auth',
          title: 'Website Auth',
          prompt: 'website prompt',
          source: 'custom',
          sourceId: 'website-auth',
          category: 'Website Auth & Generation',
          subCategory: '',
          author: '',
          tags: [],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'prompt-work',
          title: '工作提示词',
          prompt: '正常工作提示词',
          source: 'custom',
          sourceId: 'work',
          category: '工作',
          subCategory: '',
          author: '',
          tags: ['工作'],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      tasks: [],
      coverPresets: [],
      settings: {},
    }))

    const store = useAppStore()
    const categories = new Set(store.prompts.flatMap((item) => [item.category, item.subCategory, ...(item.tags ?? [])].filter(Boolean)))

    expect(categories).not.toContain('AGENT skill')
    expect(categories).not.toContain('Website Auth & Generation')
    expect(store.prompts.some((item) => item.title === '工作提示词')).toBe(true)
  })

  it('passes the selected image model configuration to the Tauri generation command', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image',
      name: 'Remote Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockResolvedValueOnce({
      id: 'task-remote',
      mode: 'txt2img',
      prompt: '真实模型生成桥接测试',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
      status: 'completed',
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '真实模型生成桥接测试',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'create_generation_task',
      expect.objectContaining({
        input: expect.objectContaining({ modelId: 'remote-image' }),
        model: expect.objectContaining({
          id: 'remote-image',
          provider: 'openai-compatible',
          endpoint: 'https://api.example.test',
          apiPath: 'v1/images/generations',
          apiKey: 'sk-test',
          model: 'gpt-image-1',
        }),
      }),
    )
  })

  it('rejects workspace generation when only the local preview model is selected', async () => {
    const store = useAppStore()
    mockedInvokeOptional.mockClear()

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '不要再生成占位图',
      negativePrompt: '',
      modelId: 'local-preview',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('请先配置并选择真实图像模型')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('create_generation_task', expect.anything())
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '请先配置并选择真实图像模型',
      prompt: '不要再生成占位图',
    }))
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请先配置并选择真实图像模型',
      type: 'error',
    }))
  })

  it('records failed remote generation attempts for operation history', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-fails',
      name: 'Remote Image Fails',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockRejectedValueOnce(new Error('HTTP 500 upstream failed'))

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '失败也要进入操作记录',
      negativePrompt: '低清晰度',
      modelId: 'remote-image-fails',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: { detailLevel: 72 },
    })).rejects.toThrow('HTTP 500 upstream failed')

    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'HTTP 500 upstream failed',
      modelId: 'remote-image-fails',
      prompt: '失败也要进入操作记录',
    }))
    expect(store.operationTasks[0].modeOptions).toEqual({ detailLevel: 72 })
  })

  it('keeps structured Tauri generation errors and model call context for diagnostics', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-structured-error',
      name: 'Structured Error Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command !== 'create_generation_task') return null
      throw {
        kind: 'Validation',
        message: '图像模型响应失败: HTTP 404 {"error":"model not found"}',
      }
    })

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '结构化错误也要保留原因',
      negativePrompt: '',
      modelId: 'remote-image-structured-error',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('图像模型响应失败: HTTP 404 {"error":"model not found"}')

    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '图像模型响应失败: HTTP 404 {"error":"model not found"}',
      errorDetails: expect.objectContaining({
        errorKind: 'Validation',
        modelName: 'Structured Error Image',
        endpoint: 'https://api.example.test',
        apiPath: 'v1/images/generations',
        apiProtocol: 'openai-images',
        model: 'gpt-image-1',
      }),
    }))
  })

  it('requires MGTV image Secret Key before generation', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'mgtv-image-missing-secret',
      name: 'MGTV Missing Secret',
      provider: 'openai-compatible',
      endpoint: 'https://aigc-llm.mgtv.com',
      apiPath: 'openapi/v1/storyboard/generateByPromptV2',
      apiProtocol: 'mgtv-storyboard',
      apiKey: 'access-test',
      apiSecret: '',
      model: '35',
      kind: 'image',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '芒果协议缺少 Secret',
      negativePrompt: '',
      modelId: 'mgtv-image-missing-secret',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('请填写 MGTV 图像模型 Secret Key')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('create_generation_task', expect.anything())
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '请填写 MGTV 图像模型 Secret Key',
      errorDetails: expect.objectContaining({
        apiProtocol: 'mgtv-storyboard',
        apiSecret: null,
      }),
    }))
  })

  it('keeps failed operations out of gallery history counts', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-history-count',
      name: 'History Count Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    let generationCalls = 0
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command !== 'create_generation_task') return null
      generationCalls += 1
      if (generationCalls === 2) throw new Error('HTTP 500 upstream failed')
      return {
        id: 'task-success-history-count',
        mode: 'txt2img',
        prompt: '成功图片',
        negativePrompt: '',
        modelId: 'remote-image-history-count',
        width: 1024,
        height: 1024,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [{
          id: 'asset-success-history-count',
          taskId: 'task-success-history-count',
          title: '成功图片',
          width: 1024,
          height: 1024,
          format: 'png',
          dataUrl: 'data:image/png;base64,ok',
          createdAt: '2026-05-31T00:00:00.000Z',
        }],
        createdAt: '2026-05-31T00:00:00.000Z',
      }
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '成功图片',
      negativePrompt: '',
      modelId: 'remote-image-history-count',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })
    await expect(store.generate({
      mode: 'txt2img',
      prompt: '失败图片',
      negativePrompt: '',
      modelId: 'remote-image-history-count',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 43,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('HTTP 500 upstream failed')

    expect(store.operationTasks).toHaveLength(2)
    expect(store.historyTasks).toHaveLength(1)
    expect(store.historyTasks[0].status).toBe('completed')
    expect(store.historyAssetCount).toBe(1)
  })

  it('removes one generated asset from the asset library and persists the deletion', async () => {
    const store = useAppStore()
    const task = {
      id: 'task-remove-asset',
      mode: 'txt2img' as const,
      prompt: '资产库删除单张图片',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 2,
      steps: 24,
      seed: 42,
      style: '自然',
      status: 'completed' as const,
      assets: [
        {
          id: 'asset-remove-a',
          taskId: 'task-remove-asset',
          title: '资源 A',
          width: 1024,
          height: 1024,
          format: 'png' as const,
          dataUrl: 'data:image/png;base64,a',
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        {
          id: 'asset-remove-b',
          taskId: 'task-remove-asset',
          title: '资源 B',
          width: 1024,
          height: 1024,
          format: 'png' as const,
          dataUrl: 'data:image/png;base64,b',
          createdAt: '2026-05-31T00:00:01.000Z',
        },
      ],
      createdAt: '2026-05-31T00:00:00.000Z',
    }
    store.recordGenerationTask(task)
    mockedInvokeOptional.mockClear()

    await store.removeGeneratedAsset('task-remove-asset', 'asset-remove-a')

    expect(store.historyAssetCount).toBe(1)
    expect(store.historyTasks[0].assets.map((asset) => asset.id)).toEqual(['asset-remove-b'])
    expect(mockedInvokeOptional).toHaveBeenCalledWith('delete_generation_asset', {
      taskId: 'task-remove-asset',
      assetId: 'asset-remove-a',
    })
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          tasks: [
            expect.objectContaining({
              id: 'task-remove-asset',
              assets: [expect.objectContaining({ id: 'asset-remove-b' })],
            }),
          ],
        }),
      }),
    )

    await store.removeGeneratedAsset('task-remove-asset', 'asset-remove-b')

    expect(store.historyAssetCount).toBe(0)
    expect(store.tasks.some((item) => item.id === 'task-remove-asset')).toBe(false)
  })

  it('applies the selected preview filter when exporting the adjusted image', async () => {
    const store = useAppStore()
    const filterHistory: string[] = []
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    Object.defineProperty(context, 'filter', {
      configurable: true,
      enumerable: true,
      get: () => filterHistory[filterHistory.length - 1] ?? 'none',
      set: (value: string) => {
        filterHistory.push(value)
      },
    })

    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const toDataURLSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,filtered')
    const originalImage = globalThis.Image

    class MockImage {
      onload: null | (() => void) = null
      onerror: null | ((event?: unknown) => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    // @ts-expect-error test stub
    globalThis.Image = MockImage
    mockedInvokeOptional.mockResolvedValueOnce({ path: 'D:\\SamImage\\Exports\\filtered.png' })

    try {
      await store.downloadAsset(
        {
          id: 'asset-filtered',
          taskId: 'task-filtered',
          title: '调整后图片',
          width: 1024,
          height: 1024,
          format: 'png',
          dataUrl: 'data:image/png;base64,source',
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        'png',
        1,
        {
          id: 'task-filtered',
          mode: 'txt2img',
          prompt: '滤镜导出测试',
          negativePrompt: '',
          modelId: 'remote-image',
          width: 1024,
          height: 1024,
          batchSize: 1,
          steps: 24,
          seed: 42,
          style: '自然',
          status: 'completed',
          assets: [],
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        { canvasFilter: 'grayscale(1) contrast(1.08)', titleSuffix: '-filtered' },
      )

      expect(filterHistory).toContain('grayscale(1) contrast(1.08)')
      expect(filterHistory.at(-1)).toBe('none')
      expect(context.drawImage).toHaveBeenCalled()
      expect(mockedInvokeOptional).toHaveBeenCalledWith(
        'export_generated_asset',
        expect.objectContaining({
          request: expect.objectContaining({
            title: '调整后图片-filtered',
            dataUrl: 'data:image/png;base64,filtered',
          }),
        }),
      )
    } finally {
      getContextSpy.mockRestore()
      toDataURLSpy.mockRestore()
      globalThis.Image = originalImage
    }
  })

  it('exports legacy png assets from gif tasks as real gif data', async () => {
    const store = useAppStore()
    mockedInvokeOptional.mockResolvedValueOnce({ path: 'D:\\SamImage\\Exports\\legacy.gif' })

    await store.downloadAsset(
      {
        id: 'asset-legacy-gif',
        taskId: 'task-legacy-gif',
        title: '旧版 GIF 资源',
        width: 512,
        height: 512,
        format: 'png',
        dataUrl: 'data:image/png;base64,source',
        createdAt: '2026-05-31T00:00:00.000Z',
      },
      'gif',
      1,
      {
        id: 'task-legacy-gif',
        mode: 'gif',
        prompt: '旧版 GIF 导出回归测试',
        negativePrompt: '',
        modelId: 'remote-image',
        width: 512,
        height: 512,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [],
        createdAt: '2026-05-31T00:00:00.000Z',
      },
    )

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'export_generated_asset',
      expect.objectContaining({
        request: expect.objectContaining({
          format: 'gif',
          dataUrl: expect.stringMatching(/^data:image\/gif;base64,/),
        }),
      }),
    )
  })

  it('does not write large generated image data URLs into browser local storage', () => {
    const store = useAppStore()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementation((key: string, value: string) => {
      if (key === 'samimage.v3.state' && value.includes('large-image-payload')) {
        throw new DOMException(
          "Failed to execute 'setItem' on 'Storage': Setting the value of 'samimage.v3.state' exceeded the quota.",
          'QuotaExceededError',
        )
      }
    })

    expect(() => store.recordGenerationTask({
      id: 'task-large-local-storage',
      mode: 'txt2img',
      prompt: '大图不应写入 localStorage',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 2048,
      height: 2048,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      status: 'completed',
      assets: [{
        id: 'asset-large-local-storage',
        taskId: 'task-large-local-storage',
        title: '大图资源',
        width: 2048,
        height: 2048,
        format: 'png',
        dataUrl: `data:image/png;base64,${'large-image-payload'.repeat(512)}`,
        createdAt: '2026-05-31T00:00:00.000Z',
      }],
      createdAt: '2026-05-31T00:00:00.000Z',
    })).not.toThrow()

    const browserState = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    expect(browserState.tasks[0].assets[0].dataUrl).toBe('')
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          tasks: [
            expect.objectContaining({
              assets: [expect.objectContaining({
                dataUrl: expect.stringContaining('large-image-payload'),
              })],
            }),
          ],
        }),
      }),
    )

    setItem.mockRestore()
  })

  it('replaces legacy oversized browser state when compact persistence first hits quota', () => {
    const legacyState = {
      models: [],
      prompts: [],
      tasks: [{
        id: 'legacy-large-task',
        mode: 'txt2img',
        prompt: '旧版大图状态',
        negativePrompt: '',
        modelId: 'remote-image',
        width: 2048,
        height: 2048,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [{
          id: 'legacy-large-asset',
          taskId: 'legacy-large-task',
          title: '旧版大图',
          width: 2048,
          height: 2048,
          format: 'png',
          dataUrl: `data:image/png;base64,${'legacy-large-payload'.repeat(512)}`,
          createdAt: '2026-05-31T00:00:00.000Z',
        }],
        createdAt: '2026-05-31T00:00:00.000Z',
      }],
      coverPresets: [],
      settings: {
        defaultOutputDir: 'D:\\SamImage\\Exports',
        defaultExportFormat: 'png',
        defaultImageModelId: '',
        defaultGenerationSize: 1024,
        defaultBatchSize: 1,
        defaultStyle: '自然',
        autoSaveHistory: true,
        includePromptMetadata: true,
        theme: 'dark',
      },
    }
    localStorage.setItem('samimage.v3.state', JSON.stringify(legacyState))
    const store = useAppStore()
    let failedOnce = false
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const setItem = vi.spyOn(localStorage, 'setItem')
    setItem.mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'samimage.v3.state' && !failedOnce) {
        failedOnce = true
        throw new DOMException(
          "Failed to execute 'setItem' on 'Storage': Setting the value of 'samimage.v3.state' exceeded the quota.",
          'QuotaExceededError',
        )
      }
      return originalSetItem(key, value)
    })

    expect(() => store.recordGenerationTask({
      id: 'task-after-legacy-quota',
      mode: 'txt2img',
      prompt: '旧状态瘦身后保存',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 43,
      style: '自然',
      status: 'completed',
      assets: [{
        id: 'asset-after-legacy-quota',
        taskId: 'task-after-legacy-quota',
        title: '新图',
        width: 1024,
        height: 1024,
        format: 'png',
        dataUrl: 'data:image/png;base64,new-image',
        createdAt: '2026-05-31T00:00:01.000Z',
      }],
      createdAt: '2026-05-31T00:00:01.000Z',
    })).not.toThrow()

    const browserState = localStorage.getItem('samimage.v3.state') ?? ''
    expect(browserState).not.toContain('legacy-large-payload')
    expect(JSON.parse(browserState).tasks.every((task: { assets: Array<{ dataUrl: string }> }) => (
      task.assets.every((asset) => asset.dataUrl === '')
    ))).toBe(true)

    setItem.mockRestore()
  })

  it('uses the real image model command even when history auto-save is disabled', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-no-history',
      name: 'Remote Image No History',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    store.saveSettings({ autoSaveHistory: false })
    mockedInvokeOptional.mockClear()
    mockedInvokeOptional.mockResolvedValueOnce({
      id: 'task-remote-no-history',
      mode: 'txt2img',
      prompt: '真实模型生成但不写入前端资产库',
      negativePrompt: '',
      modelId: 'remote-image-no-history',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
      status: 'completed',
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '真实模型生成但不写入前端资产库',
      negativePrompt: '',
      modelId: 'remote-image-no-history',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'create_generation_task',
      expect.objectContaining({
        input: expect.objectContaining({ modelId: 'remote-image-no-history' }),
        model: expect.objectContaining({ id: 'remote-image-no-history' }),
      }),
    )
    expect(store.tasks).toHaveLength(0)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '已生成 0 张文生图结果，未保存到资产库',
      type: 'info',
    }))
  })

  it('passes the selected text model configuration to the Tauri polish command', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-text',
      name: 'Remote Text',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockResolvedValueOnce({
      prompt: '精修后的提示词',
      modelName: 'Remote Text',
    })

    const result = await store.polishPrompt(
      {
        prompt: '产品海报',
        modeLabel: '文生图',
        style: '自然',
      },
      'remote-text',
    )

    expect(result.prompt).toBe('精修后的提示词')
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'polish_prompt',
      expect.objectContaining({
        input: {
          prompt: '产品海报',
          modeLabel: '文生图',
          style: '自然',
        },
        model: expect.objectContaining({
          id: 'remote-text',
          provider: 'openai-compatible',
          endpoint: 'https://api.example.test',
          apiPath: 'v1/chat/completions',
          apiKey: 'sk-text',
          model: 'gpt-4o-mini',
        }),
      }),
    )
  })

  it('persists model configuration to the Tauri app state store', async () => {
    const store = useAppStore()

    store.saveModel({
      id: 'persisted-image',
      name: 'Persisted Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-persisted',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({
              id: 'persisted-image',
              apiKey: 'sk-persisted',
            }),
          ]),
        }),
      }),
    )
  })

  it('loads full app state from Tauri before merging persisted tasks', async () => {
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command === 'load_app_state') {
        return {
          models: [
            {
              id: 'sqlite-image',
              name: 'SQLite Image',
              provider: 'openai-compatible',
              endpoint: 'https://api.example.test/v1/images/generations',
              apiKey: 'sk-sqlite',
              model: 'gpt-image-1',
              kind: 'image',
              isPrimary: true,
              status: 'connected',
            },
          ],
          prompts: [],
          tasks: [],
          coverPresets: [],
          settings: {
            defaultOutputDir: 'D:\\SamImage\\Exports',
            defaultExportFormat: 'png',
            defaultImageModelId: 'sqlite-image',
            defaultGenerationSize: 1024,
            defaultBatchSize: 1,
            defaultStyle: '自然',
            autoSaveHistory: true,
            includePromptMetadata: true,
            theme: 'dark',
          },
        }
      }
      if (command === 'list_generation_tasks') return []
      return null
    })
    const store = useAppStore()

    await store.loadPersistedTasks()

    expect(store.models[0]).toEqual(expect.objectContaining({
      id: 'sqlite-image',
      apiKey: 'sk-sqlite',
    }))
    expect(store.settings.defaultExportFormat).toBe('png')
    expect(JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}').models[0].id).toBe('sqlite-image')
  })

  it('reports invalid cover preset dimensions without adding a preset', () => {
    const store = useAppStore()
    const beforeCount = store.coverPresets.length

    const saved = store.addCoverPreset({
      name: 'Invalid preset',
      width: 80,
      height: 608,
      enabled: true,
    })

    expect(saved).toBe(false)
    expect(store.coverPresets).toHaveLength(beforeCount)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请输入 128 到 4096 之间的有效尺寸',
      type: 'error',
    }))
  })

  it('removes imported prompts while keeping builtin prompts intact', () => {
    const store = useAppStore()
    const importedCount = store.importPromptBatch([
      {
        filename: 'custom-prompts.json',
        content: JSON.stringify([
          { title: '可删除提示词', prompt: '这是一条可删除的导入提示词', category: '测试' },
        ]),
      },
    ])

    expect(importedCount).toBe(1)
    const importedPrompt = store.prompts.find((item) => item.title === '可删除提示词')
    expect(importedPrompt).toBeTruthy()

    store.removePrompt(importedPrompt!.id)
    expect(store.prompts.some((item) => item.id === importedPrompt!.id)).toBe(false)

    const builtinPrompt = store.prompts.find((item) => item.source === 'builtin')
    expect(builtinPrompt).toBeTruthy()
    store.removePrompt(builtinPrompt!.id)
    expect(store.prompts.some((item) => item.id === builtinPrompt!.id)).toBe(true)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '内置提示词不能删除',
      type: 'error',
    }))
  })

  it('does not mark remote models failed when connection testing runs in browser preview', async () => {
    mockedIsTauriRuntime.mockReturnValue(false)
    const store = useAppStore()
    store.saveModel({
      id: 'browser-preview-text',
      name: 'Browser Preview Text',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'untested',
    })

    await store.testModel('browser-preview-text')

    expect(store.models.find((model) => model.id === 'browser-preview-text')?.status).toBe('untested')
    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.toast).toEqual(expect.objectContaining({
      message: '浏览器预览模式不能直连模型 API，请在桌面版检测连接',
      type: 'info',
    }))
  })

  it('validates text model configuration before running connection test', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'missing-text-model-id',
      name: 'Missing Text Model ID',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await store.testModel('missing-text-model-id')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.models.find((model) => model.id === 'missing-text-model-id')?.status).toBe('failed')
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请填写文本模型 ID',
      type: 'error',
    }))
  })

  it('validates image model configuration before running connection test', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'missing-image-model-id',
      name: 'Missing Image Model ID',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-image',
      model: '',
      kind: 'image',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await store.testModel('missing-image-model-id')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.models.find((model) => model.id === 'missing-image-model-id')?.status).toBe('failed')
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请填写图像模型 ID',
      type: 'error',
    }))
  })

  it('fetches model catalog through Tauri when running in desktop runtime', async () => {
    const store = useAppStore()
    const profile = {
      id: 'remote-text',
      name: 'Remote Text',
      provider: 'openai-compatible' as const,
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text' as const,
      isPrimary: false,
      status: 'untested' as const,
    }
    mockedInvokeOptional.mockResolvedValueOnce([
      {
        id: 'gpt-4o-mini',
        name: 'gpt-4o-mini',
        kind: 'text',
        source: 'remote',
      },
    ])

    const models = await store.fetchModelCatalog(profile)

    expect(models).toEqual([
      expect.objectContaining({
        id: 'gpt-4o-mini',
        kind: 'text',
      }),
    ])
    expect(mockedInvokeOptional).toHaveBeenCalledWith('list_model_catalog', { profile })
  })
})
