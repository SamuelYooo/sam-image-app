import { describe, expect, it } from 'vitest'
import { mergePromptItems, normalizeBilingualPromptMarkdown, normalizePromptImport, normalizePromptSync } from '../promptImport'

describe('prompt import normalization', () => {
  it('normalizes array, wrapped, and loose prompt fields into one stable shape', () => {
    const imported = normalizePromptImport(
      JSON.stringify({
        prompts: [
          { title: '封面模板', prompt: '醒目的中文标题，赛博科技风', tags: ['封面'], author: 'sam' },
          { name: '图标模板', content: '玻璃拟态 app icon', category: 'ICON' },
        ],
      }),
      'custom-prompts.json',
    )

    expect(imported).toEqual([
      expect.objectContaining({
        title: '封面模板',
        prompt: '醒目的中文标题，赛博科技风',
        source: 'custom',
        category: '封面',
        author: 'sam',
      }),
      expect.objectContaining({
        title: '图标模板',
        prompt: '玻璃拟态 app icon',
        source: 'custom',
        category: 'ICON',
      }),
    ])
  })

  it('deduplicates by source id and custom prompt content', () => {
    const existing = normalizePromptImport(
      JSON.stringify([{ title: '封面模板', prompt: '醒目的中文标题，赛博科技风' }]),
      'custom.json',
    )
    const incoming = normalizePromptImport(
      JSON.stringify([
        { title: '封面模板副本', prompt: '醒目的中文标题，赛博科技风' },
        { title: '新增', prompt: '干净的 3D 产品渲染' },
      ]),
      'custom-more.json',
    )

    expect(mergePromptItems(existing, incoming)).toHaveLength(2)
  })

  it('extracts prompt code blocks from synced markdown readmes', () => {
    const imported = normalizePromptSync(
      [
        '# Awesome prompts',
        '## 封面',
        '### 霓虹封面',
        '```',
        '小红书封面，赛博霓虹标题，清晰信息层级',
        '```',
      ].join('\n'),
      'EvoLinkAI',
      'https://example.test/README.md',
    )

    expect(imported).toEqual([
      expect.objectContaining({
        title: '霓虹封面',
        prompt: '小红书封面，赛博霓虹标题，清晰信息层级',
        source: 'EvoLinkAI',
        category: '封面',
      }),
    ])
  })

  it('extracts bilingual prompt table rows from local markdown presets', () => {
    const imported = normalizeBilingualPromptMarkdown([
      '## 一、文生图（Text-to-Image）',
      '| 序号 | 中文 | 英文 |',
      '| ---- | ---- | ---- |',
      '| 1 | 一位老渔民在黎明时分修补渔网的电影级镜头 | `A cinematic shot of an elderly fisherman mending his net at dawn` |',
      '### 6.1、通用自媒体封面（15条）',
      '| 序号 | 中文提示词 | 英文提示词 |',
      '| ---- | ---- | ---- |',
      '| 1 | 自媒体封面：年轻女性睁大嘴巴的惊讶表情 | `Social media thumbnail: young woman with open mouth surprised expression` |',
    ].join('\n'))

    expect(imported).toEqual([
      expect.objectContaining({
        title: '文生图 1',
        category: '文生图',
        prompt: 'A cinematic shot of an elderly fisherman mending his net at dawn',
        promptZh: '一位老渔民在黎明时分修补渔网的电影级镜头',
        promptEn: 'A cinematic shot of an elderly fisherman mending his net at dawn',
        language: 'bilingual',
      }),
      expect.objectContaining({
        title: '通用自媒体封面 1',
        category: '封面',
        subCategory: '通用自媒体封面',
        prompt: 'Social media thumbnail: young woman with open mouth surprised expression',
      }),
    ])
  })

  it('filters blocked prompt categories from markdown and imports', () => {
    const markdown = [
      '## AGENT skill',
      '| 序号 | 中文 | 英文 |',
      '| ---- | ---- | ---- |',
      '| 1 | 自动化代理提示词 | `Agent automation prompt` |',
      '## Website Auth & Generation',
      '| 序号 | 中文 | 英文 |',
      '| ---- | ---- | ---- |',
      '| 1 | 网站登录生成提示词 | `Website auth generation prompt` |',
      '## 工作',
      '| 序号 | 中文 | 英文 |',
      '| ---- | ---- | ---- |',
      '| 1 | 远程办公场景 | `Remote work scene` |',
    ].join('\n')

    const imported = normalizeBilingualPromptMarkdown(markdown)

    expect(imported).toHaveLength(1)
    expect(imported[0]).toEqual(expect.objectContaining({
      category: '工作',
      prompt: 'Remote work scene',
    }))

    const custom = normalizePromptImport(
      JSON.stringify([
        { title: '代理', prompt: 'agent prompt', category: 'AGENT skill' },
        { title: '网站', prompt: 'website prompt', category: 'Website Auth & Generation' },
        { title: '保留', prompt: '正常工作提示词', category: '工作' },
      ]),
      'custom-prompts.json',
    )

    expect(custom).toHaveLength(1)
    expect(custom[0].category).toBe('工作')
  })
})
