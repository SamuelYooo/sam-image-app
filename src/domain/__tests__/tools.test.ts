import { describe, expect, it } from 'vitest'
import type { ToolEntry, ToolControl } from '@/data/catalog'
import { resolveToolEffects } from '../tools'

const baseTool: ToolEntry = {
  id: 'unit-test',
  title: '单元测试工具',
  desc: '测试',
  mode: 'txt2img',
  icon: 'Plus',
  promptSeed: 'seed',
  extraControls: [
    {
      key: 'material',
      label: '材质',
      type: 'select',
      default: 'metal',
      options: [
        { value: 'metal', label: '金属' },
        { value: 'glass', label: '玻璃' },
      ],
      promptFragment: 'rendered with {value} material',
    } as ToolControl,
    {
      key: 'pixelBlockSize',
      label: '像素块',
      type: 'range',
      default: 8,
      min: 2,
      max: 32,
      promptFragment: 'pixel block about {value}px',
    } as ToolControl,
  ] as ToolControl[],
}

const modeState = {
  creativity: 50,
  detailLevel: 50,
  imageStrength: 50,
  resizeMode: 'just-resize',
  iconBackground: 'transparent',
  depthStrength: 78,
  durationSeconds: 4,
}

describe('resolveToolEffects', () => {
  it('returns empty effects when tool is undefined', () => {
    const effects = resolveToolEffects(undefined, {}, 'txt2img', modeState)
    expect(effects.postProcessSteps).toHaveLength(0)
    expect(effects.notes).toHaveLength(0)
  })

  it('emits mode-level prompt fragments for txt2img', () => {
    const effects = resolveToolEffects(baseTool, {}, 'txt2img', modeState)
    expect(effects.promptFragments.join(' ')).toContain('creative tendency 50/100')
    expect(effects.promptFragments.join(' ')).toContain('detail level 50/100')
  })

  it('substitutes {value} in promptFragment when the value is set', () => {
    const effects = resolveToolEffects(baseTool, { material: 'glass' }, 'txt2img', modeState)
    expect(effects.promptFragments.join(' ')).toContain('rendered with glass material')
  })

  it('skips fragment when value is undefined', () => {
    const effects = resolveToolEffects(baseTool, {}, 'txt2img', modeState)
    expect(effects.promptFragments.join(' ')).not.toContain('rendered with')
  })

  it('adds a postprocess step for known keys (pixelate)', () => {
    const effects = resolveToolEffects(baseTool, { pixelBlockSize: 16 }, 'txt2img', modeState)
    expect(effects.postProcessSteps).toHaveLength(1)
    expect(effects.postProcessSteps[0]?.kind).toBe('pixelate')
    expect(effects.postProcessSteps[0]?.params.pixelSize).toBe(16)
  })

  it('emits a note for honest non-deterministic effects (upscale 1x)', () => {
    const tool: ToolEntry = {
      ...baseTool,
      id: 'image-enhance',
      extraControls: [
        {
          key: 'upscale',
          label: '放大倍数',
          type: 'select',
          default: '2x',
          options: [
            { value: '1x', label: '1x' },
            { value: '2x', label: '2x' },
          ],
        } as ToolControl,
      ] as ToolControl[],
    }
    const effects = resolveToolEffects(tool, { upscale: '1x' }, 'txt2img', modeState)
    expect(effects.notes.length).toBeGreaterThan(0)
    expect(effects.postProcessSteps).toHaveLength(0)
  })

  it('routes 2x upscale to a real postprocess step', () => {
    const tool: ToolEntry = {
      ...baseTool,
      id: 'image-enhance',
      extraControls: [
        {
          key: 'upscale',
          label: '放大倍数',
          type: 'select',
          default: '2x',
          options: [
            { value: '1x', label: '1x' },
            { value: '2x', label: '2x' },
          ],
        } as ToolControl,
      ] as ToolControl[],
    }
    const effects = resolveToolEffects(tool, { upscale: '2x' }, 'txt2img', modeState)
    expect(effects.postProcessSteps[0]?.kind).toBe('resample')
    expect(effects.postProcessSteps[0]?.params.scale).toBe(2)
  })

  it('resolves idSpec to a real dimension', () => {
    const tool: ToolEntry = {
      ...baseTool,
      id: 'id-photo',
      extraControls: [
        {
          key: 'idSpec',
          label: '规格',
          type: 'select',
          default: 'one-inch',
          options: [
            { value: 'one-inch', label: '一寸' },
            { value: 'passport', label: '护照' },
          ],
        } as ToolControl,
      ] as ToolControl[],
    }
    const effects = resolveToolEffects(tool, { idSpec: 'one-inch' }, 'txt2img', modeState)
    expect(effects.dimensionOverride).toEqual({ width: 295, height: 413 })
  })

  it('routes cropShape circle to a circleCrop postprocess', () => {
    const tool: ToolEntry = {
      ...baseTool,
      id: 'social-avatar',
      extraControls: [
        {
          key: 'cropShape',
          label: '裁切',
          type: 'select',
          default: 'circle',
          options: [
            { value: 'circle', label: '圆形' },
            { value: 'square', label: '方形' },
          ],
        } as ToolControl,
      ] as ToolControl[],
    }
    const effects = resolveToolEffects(tool, { cropShape: 'circle' }, 'txt2img', modeState)
    expect(effects.postProcessSteps[0]?.kind).toBe('circleCrop')
  })

  it('falls back to prompt for unknown keys', () => {
    const tool: ToolEntry = {
      ...baseTool,
      id: 'exotic',
      extraControls: [
        {
          key: 'mystery',
          label: '?',
          type: 'range',
          default: 5,
          min: 0,
          max: 10,
          promptFragment: 'mystery={value}',
        } as ToolControl,
      ] as ToolControl[],
    }
    const effects = resolveToolEffects(tool, { mystery: 7 }, 'txt2img', modeState)
    expect(effects.promptFragments.join(' ')).toContain('mystery=7')
    expect(effects.postProcessSteps).toHaveLength(0)
  })
})
