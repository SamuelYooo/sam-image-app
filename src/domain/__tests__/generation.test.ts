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

  it('creates gif preview assets for gif mode', () => {
    const task = createLocalGeneration({
      mode: 'gif',
      prompt: '循环动图导出回归测试',
      negativePrompt: '低清晰度',
      modelId: 'local-preview',
      width: 512,
      height: 512,
      batchSize: 1,
      steps: 24,
      seed: 84,
      style: '像素',
    })

    expect(task.assets[0]).toEqual(
      expect.objectContaining({
        format: 'gif',
        width: 512,
        height: 512,
      }),
    )
    expect(task.assets[0].dataUrl).toContain('data:image/gif')
  })

  it('keeps mode-specific options on generated tasks', () => {
    const task = createLocalGeneration({
      mode: 'img2img',
      prompt: '图生图强度回归测试',
      negativePrompt: '低清晰度',
      modelId: 'local-preview',
      width: 768,
      height: 768,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '摄影',
      referenceImage: 'data:image/png;base64,AAAA',
      modeOptions: {
        imageStrength: 68,
        resizeMode: 'crop-resize',
      },
    })

    expect(task.modeOptions).toEqual({
      imageStrength: 68,
      resizeMode: 'crop-resize',
    })
  })
})
