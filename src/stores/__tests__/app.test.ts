import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../app'
import { invokeOptional } from '@/services/tauri'

vi.mock('@/services/tauri', () => ({
  invokeOptional: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
}))

const mockedInvokeOptional = vi.mocked(invokeOptional)

describe('app store generation bridge', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockedInvokeOptional.mockReset()
    mockedInvokeOptional.mockResolvedValue(null)
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
          endpoint: 'https://api.example.test/v1/images/generations',
          apiKey: 'sk-test',
          model: 'gpt-image-1',
        }),
      }),
    )
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
          endpoint: 'https://api.example.test/v1/chat/completions',
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
})
