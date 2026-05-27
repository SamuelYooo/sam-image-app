import { describe, expect, it } from 'vitest'
import { createPromptMarketTemplateJson, promptMarketTemplate } from '../../src/data/promptMarketTemplate'
import { promptMarketSnapshot } from '../../src/data/promptMarketSnapshot'
import { parsePromptAssets } from '../../src/utils/promptMarket'

describe('prompt market parsing', () => {
  it('boots an offline snapshot for the market', () => {
    expect(promptMarketSnapshot.length).toBeGreaterThanOrEqual(3)
    expect(promptMarketSnapshot.some((item) => item.source === 'builtin')).toBe(true)
    expect(promptMarketSnapshot.some((item) => item.source === 'glidea')).toBe(true)
    expect(promptMarketSnapshot.some((item) => item.source === 'evolink')).toBe(true)
  })

  it('normalizes glidea raw prompt records', () => {
    const [asset] = parsePromptAssets(
      [
        {
          id: 'glidea-1',
          title: '角色一致性设定',
          prompt: 'consistent character sheet',
          author: 'glidea',
          mode: 'reference',
          category: 'character',
          sub_category: 'consistency',
          reference_image_urls: ['a.png'],
        },
      ],
      { source: 'glidea', now: '2026-05-22T00:00:00.000Z' },
    )

    expect(asset.source).toBe('glidea')
    expect(asset.sourceId).toBe('glidea-1')
    expect(asset.content).toBe('consistent character sheet')
    expect(asset.categories).toEqual(['character', 'consistency', 'reference'])
    expect(asset.referenceImages).toEqual(['a.png'])
  })

  it('normalizes EvoLinkAI raw prompt records and deduplicates repeated source ids', () => {
    const assets = parsePromptAssets(
      {
        records: [
          {
            name: '社媒海报构图',
            category: 'Poster Cases',
            author_handle: 'designer',
            tweet_url: 'https://x.com/example',
          },
          {
            tweet_url: 'https://x.com/example',
            name: '重复项',
          },
        ],
      },
      { source: 'evolink', now: '2026-05-22T00:00:00.000Z' },
    )

    expect(assets).toHaveLength(1)
    expect(assets[0].source).toBe('evolink')
    expect(assets[0].title).toBe('社媒海报构图')
    expect(assets[0].content).toBe('社媒海报构图')
    expect(assets[0].author).toBe('designer')
    expect(assets[0].sourceUrl).toBe('https://x.com/example')
    expect(assets[0].categories).toEqual(['Poster Cases'])
  })

  it('provides a valid SamImage custom JSON template', () => {
    const parsed = JSON.parse(createPromptMarketTemplateJson())
    const assets = parsePromptAssets(parsed, { source: 'custom_json', now: '2026-05-22T00:00:00.000Z' })

    expect(promptMarketTemplate.prompts).toHaveLength(1)
    expect(parsed.prompts[0].content).toContain('高质感产品摄影')
    expect(parsed.prompts[0].language).toBe('zh')
    expect(assets[0].source).toBe('custom_json')
    expect(assets[0].useCases).toContain('txt2img')
  })
})
