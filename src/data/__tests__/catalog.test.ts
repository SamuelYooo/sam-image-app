import { describe, expect, it } from 'vitest'
import type { GenerationMode } from '@/types/domain'
import {
  defaultPrompts,
  defaultToolForMode,
  findToolEntry,
  toolEntries,
  toolGroups,
  type ToolControl,
  type ToolEntry,
} from '../catalog'

const generationModes: GenerationMode[] = ['txt2img', 'img2img', 'cover', 'icon', '3d', 'gif']
const controlTypes = new Set(['range', 'select', 'chips'])

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

describe('catalog tool groups integrity', () => {
  it('exposes non-empty tool groups with required metadata', () => {
    expect(toolGroups.length).toBeGreaterThan(0)
    for (const group of toolGroups) {
      expect(isNonEmptyString(group.id)).toBe(true)
      expect(isNonEmptyString(group.name)).toBe(true)
      expect(isNonEmptyString(group.tone)).toBe(true)
      expect(Array.isArray(group.tools)).toBe(true)
      expect(group.tools.length).toBeGreaterThan(0)
    }
  })

  it('flattens every group tool into toolEntries', () => {
    const flattened = toolGroups.flatMap((group) => group.tools)
    expect(toolEntries).toEqual(flattened)
    expect(toolEntries.length).toBe(flattened.length)
  })

  it('keeps every tool id globally unique', () => {
    const ids = toolEntries.map((tool) => tool.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('requires core string fields and a valid mode on every tool', () => {
    for (const tool of toolEntries) {
      expect(isNonEmptyString(tool.id)).toBe(true)
      expect(isNonEmptyString(tool.title)).toBe(true)
      expect(isNonEmptyString(tool.desc)).toBe(true)
      expect(isNonEmptyString(tool.icon)).toBe(true)
      expect(isNonEmptyString(tool.promptSeed)).toBe(true)
      expect(generationModes).toContain(tool.mode)
    }
  })
})

describe('catalog optional field validity', () => {
  it('keeps recommendedSize dimensions within integer bounds when present', () => {
    for (const tool of toolEntries) {
      if (!tool.recommendedSize) continue
      const { width, height } = tool.recommendedSize
      for (const dimension of [width, height]) {
        expect(Number.isInteger(dimension)).toBe(true)
        expect(dimension).toBeGreaterThanOrEqual(16)
        expect(dimension).toBeLessThanOrEqual(4096)
      }
    }
  })

  it('validates extraControls structure and defaults when present', () => {
    for (const tool of toolEntries) {
      if (!tool.extraControls) continue
      expect(Array.isArray(tool.extraControls)).toBe(true)

      const keys = tool.extraControls.map((control) => control.key)
      expect(new Set(keys).size).toBe(keys.length)

      for (const control of tool.extraControls as ToolControl[]) {
        expect(isNonEmptyString(control.key)).toBe(true)
        expect(isNonEmptyString(control.label)).toBe(true)
        expect(controlTypes.has(control.type)).toBe(true)

        if (control.type === 'range') {
          const min = control.min ?? 0
          const max = control.max ?? 100
          expect(typeof control.default).toBe('number')
          expect(control.default as number).toBeGreaterThanOrEqual(min)
          expect(control.default as number).toBeLessThanOrEqual(max)
        } else {
          expect(Array.isArray(control.options)).toBe(true)
          expect(control.options && control.options.length).toBeGreaterThan(0)
          for (const option of control.options ?? []) {
            expect(isNonEmptyString(option.value)).toBe(true)
            expect(isNonEmptyString(option.label)).toBe(true)
          }
          const optionValues = (control.options ?? []).map((option) => option.value)
          expect(optionValues).toContain(control.default)
        }
      }
    }
  })

  it('keeps tips as a non-empty array of non-empty strings when present', () => {
    for (const tool of toolEntries) {
      if (!tool.tips) continue
      expect(Array.isArray(tool.tips)).toBe(true)
      expect(tool.tips.length).toBeGreaterThan(0)
      for (const tip of tool.tips) {
        expect(isNonEmptyString(tip)).toBe(true)
      }
    }
  })
})

describe('catalog lookup helpers', () => {
  it('finds the remove-background tool as an img2img entry', () => {
    const tool = findToolEntry('remove-background')
    expect(tool).toBeDefined()
    expect(tool?.id).toBe('remove-background')
    expect(tool?.mode).toBe('img2img')
  })

  it('returns undefined for unknown or missing ids', () => {
    expect(findToolEntry('不存在')).toBeUndefined()
    expect(findToolEntry(undefined)).toBeUndefined()
    expect(findToolEntry(null)).toBeUndefined()
    expect(findToolEntry('')).toBeUndefined()
  })

  it('resolves a default tool for the icon mode', () => {
    const tool = defaultToolForMode('icon')
    expect(tool).toBeDefined()
    expect(tool?.mode).toBe('icon')
  })

  it('returns a tool matching the requested mode for every generation mode', () => {
    for (const mode of generationModes) {
      const tool = defaultToolForMode(mode)
      expect(tool).toBeDefined()
      expect(tool?.mode).toBe(mode)
    }
  })
})

describe('catalog builtin prompt library', () => {
  it('includes supplemental prompt categories and excludes blocked categories', () => {
    const categories = new Set(defaultPrompts.flatMap((item) => [item.category, item.subCategory].filter(Boolean)))

    expect(categories).toContain('工作')
    expect(categories).toContain('海报')
    expect(categories).toContain('设计')
    expect(categories).not.toContain('AGENT skill')
    expect(categories).not.toContain('Website Auth & Generation')
  })
})

describe('catalog template tool wiring', () => {
  it('marks remove-background as reference required with a prompt fragment control', () => {
    const tool = findToolEntry('remove-background') as ToolEntry
    expect(tool.referenceRequired).toBe(true)
    expect(tool.extraControls?.some((control) => isNonEmptyString(control.promptFragment))).toBe(true)
  })

  it('keeps all tool entries wired with their own business metadata', () => {
    for (const tool of toolEntries) {
      expect(isNonEmptyString(tool.subtitle)).toBe(true)
      expect(isNonEmptyString(tool.flowCopy)).toBe(true)
      expect(isNonEmptyString(tool.promptHint)).toBe(true)
      expect(Array.isArray(tool.tips)).toBe(true)
      expect(tool.tips?.length).toBeGreaterThan(0)
      const hasExtra = (tool.extraControls?.length ?? 0) > 0
      // 标记 usesModeLevelControls 的工具可省略 extraControls，由模式级控件兜底
      expect(hasExtra || tool.usesModeLevelControls === true).toBe(true)
    }
  })

  it('keeps the eightbit pixel tool in the reference image workflow instead of GIF animation mode', () => {
    const tool = findToolEntry('eight-bit-pixel') as ToolEntry
    expect(tool.mode).toBe('img2img')
    expect(tool.referenceRequired).toBe(true)
  })
})
