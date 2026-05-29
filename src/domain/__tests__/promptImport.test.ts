import { describe, expect, it } from 'vitest'
import { mergePromptItems, normalizePromptImport, normalizePromptSync } from '../promptImport'

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
})
