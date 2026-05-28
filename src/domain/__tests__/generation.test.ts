import { describe, expect, it } from 'vitest'
import { createLocalGeneration, validateGenerationInput } from '../generation'

describe('generation task domain', () => {
  it('rejects blank prompts before a task is created', () => {
    expect(() =>
      validateGenerationInput({
        mode: 'txt2img',
        prompt: '   ',
        negativePrompt: '',
        modelId: 'local-preview',
        width: 1024,
        height: 1024,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
      }),
    ).toThrow('请输入正向提示词')
  })

  it('creates deterministic local preview assets when no model api is available', () => {
    const task = createLocalGeneration({
      mode: 'cover',
      prompt: '小红书 AI 工具合集封面',
      negativePrompt: '低清晰度',
      modelId: 'local-preview',
      width: 1080,
      height: 1440,
      batchSize: 2,
      steps: 28,
      seed: 128409,
      style: '赛博',
    })

    expect(task.status).toBe('completed')
    expect(task.assets).toHaveLength(2)
    expect(task.assets[0]).toEqual(
      expect.objectContaining({
        width: 1080,
        height: 1440,
        format: 'svg',
      }),
    )
    expect(task.assets[0].dataUrl).toContain('data:image/svg+xml')
  })
})
