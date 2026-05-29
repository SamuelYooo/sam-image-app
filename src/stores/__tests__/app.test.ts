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
})
