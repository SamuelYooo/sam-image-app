import { describe, expect, it } from 'vitest'
import { addReferenceImages, mergePromptText } from '../../src/stores/workspaceStore'

describe('workspace prompt draft store helpers', () => {
  it('replaces blank prompt insert with the incoming prompt', () => {
    expect(mergePromptText('   ', '  neon city poster  ')).toBe('neon city poster')
  })

  it('appends inserted prompt on a new line', () => {
    expect(mergePromptText('coffee shop', '  cinematic lighting  ')).toBe('coffee shop\ncinematic lighting')
  })

  it('ignores empty inserted prompt', () => {
    expect(mergePromptText('coffee shop', '   ')).toBe('coffee shop')
  })

  it('adds unique reference images up to the workspace limit', () => {
    const current = [{ id: 'a', name: 'A', uri: 'data:image/png;base64,a', size: 1 }]
    const next = addReferenceImages(current, [
      { id: 'dup', name: 'Dup', uri: 'data:image/png;base64,a', size: 1 },
      { id: 'b', name: 'B', uri: 'https://example.com/b.png', size: 0 },
      { id: 'c', name: 'C', uri: 'https://example.com/c.png', size: 0 },
      { id: 'd', name: 'D', uri: 'https://example.com/d.png', size: 0 },
      { id: 'e', name: 'E', uri: 'https://example.com/e.png', size: 0 },
    ])

    expect(next.map((image) => image.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps reference preview URLs while deduping by source URI', () => {
    const current = [
      {
        id: 'a',
        name: 'A',
        uri: 'assets/images/generated/a.png',
        previewUri: 'asset://localhost/a.png',
        size: 0,
      },
    ]
    const next = addReferenceImages(current, [
      {
        id: 'dup',
        name: 'Dup',
        uri: 'assets/images/generated/a.png',
        previewUri: 'asset://localhost/a-copy.png',
        size: 0,
      },
      {
        id: 'b',
        name: 'B',
        uri: 'assets/images/generated/b.png',
        previewUri: 'asset://localhost/b.png',
        size: 0,
      },
    ])

    expect(next.map((image) => image.id)).toEqual(['a', 'b'])
    expect(next[1].previewUri).toBe('asset://localhost/b.png')
  })
})
