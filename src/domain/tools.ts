import type { GenerationInput, GenerationMode } from '@/types/domain'
import type { ToolControl, ToolEntry } from '@/data/catalog'
import type { PostProcessStep } from './postprocess'

/**
 * 控件的实际作用分类。`prompt` 是默认（维持现状），其他分类会引导到对应管道。
 */
export type ControlEffect =
  | { kind: 'prompt' }
  | { kind: 'dimension'; resolve: (value: string | number) => { width: number; height: number } | null }
  | { kind: 'postprocess'; step: PostProcessStep }
  | { kind: 'note'; message: string }

/** 模式全局配置（每种模式共用） */
export interface ModeState {
  creativity: number
  detailLevel: number
  imageStrength: number
  resizeMode: string
  iconBackground: string
  depthStrength: number
  durationSeconds: number
}

export interface ResolvedToolEffects {
  /** 拼进 prompt 的英文片段（替代 WorkspacePage 的 toolPromptFragments + modePromptFragments） */
  promptFragments: string[]
  /** 若指定了 dimension 类型控件，覆盖输出尺寸 */
  dimensionOverride?: { width: number; height: number }
  /** 顺序执行的 Canvas 后处理步骤 */
  postProcessSteps: PostProcessStep[]
  /** 工具要求附带的诚实提示（效果取决于模型，不做假确定性） */
  notes: string[]
}

/**
 * 集中处理：把 tool 的 extraControls + modeState 解析成具体要执行的事。
 * 取代分散在 WorkspacePage 的 toolPromptFragments/modePromptFragments/buildGenerationPrompt 逻辑。
 */
export function resolveToolEffects(
  tool: ToolEntry | undefined,
  extraOptions: Record<string, string | number>,
  mode: GenerationMode,
  modeState: ModeState,
): ResolvedToolEffects {
  if (!tool) return modeOnlyEffects(mode, modeState)
  const fragments: string[] = []
  const steps: PostProcessStep[] = []
  const notes: string[] = []
  let dimensionOverride: { width: number; height: number } | undefined

  // 模式全局 prompt 片段（去重 + 工具接管）
  if (mode === 'txt2img') {
    fragments.push(
      `creative tendency ${modeState.creativity}/100, more expressive when higher`,
      `detail level ${modeState.detailLevel}/100, denser textures and edges when higher`,
    )
  } else if (mode === 'img2img') {
    fragments.push(
      `reference image strength ${modeState.imageStrength}/100, closer to the source when lower`,
      `resize mode ${modeState.resizeMode}`,
    )
  } else if (mode === 'icon') {
    fragments.push(`icon background ${modeState.iconBackground}`)
  }

  for (const control of tool.extraControls ?? []) {
    const value = extraOptions[control.key]
    if (value === undefined) continue
    const effect = resolveControlEffect(control, value)
    switch (effect.kind) {
      case 'prompt':
        if (control.promptFragment) {
          fragments.push(control.promptFragment.replace('{value}', String(value)))
        }
        break
      case 'dimension':
        if (effect.resolve) {
          const dim = effect.resolve(value)
          if (dim) dimensionOverride = dim
        }
        break
      case 'postprocess':
        steps.push(effect.step)
        break
      case 'note':
        notes.push(effect.message)
        break
    }
  }

  return {
    promptFragments: fragments,
    dimensionOverride,
    postProcessSteps: steps,
    notes,
  }
}

function modeOnlyEffects(mode: GenerationMode, modeState: ModeState): ResolvedToolEffects {
  if (mode === 'gif') {
    return {
      promptFragments: [
        `seamless looping animated GIF, ${modeState.durationSeconds} seconds, clear motion arc, stable subject, consistent frame-to-frame details`,
      ],
      postProcessSteps: [],
      notes: [],
    }
  }
  if (mode === '3d') {
    return {
      promptFragments: [
        `3D render with visible depth, spatial lighting, modeled material surfaces, depth strength ${modeState.depthStrength}/100, cinematic perspective`,
      ],
      postProcessSteps: [],
      notes: [],
    }
  }
  return { promptFragments: [], postProcessSteps: [], notes: [] }
}

/**
 * 根据控件 key 推断其分类。新控件的 effect 入口。
 * Phase 3 会把 catalog 里的现有控件逐个标注，这里提供一个"key → effect"映射，
 * 让 catalog 可以保持最小改动（不写 effect 时走 prompt 行为）。
 */
const CONTROL_EFFECT_BY_KEY: Record<string, (value: string | number) => ControlEffect> = {
  // —— 设计类 ——
  cornerRadius: (v) => ({ kind: 'postprocess', step: { kind: 'roundedCorners', params: { radiusPct: Number(v) } } }),
  iconStyle: () => ({ kind: 'prompt' }),
  cropShape: (v) => (v === 'circle' ? { kind: 'postprocess', step: { kind: 'circleCrop', params: {} } } : { kind: 'prompt' }),
  avatarStyle: () => ({ kind: 'prompt' }),
  idSpec: (v) => ({
    kind: 'dimension',
    resolve: () => ID_PHOTO_SIZES[String(v)] ?? null,
  }),
  backgroundColor: (v) => ({ kind: 'postprocess', step: { kind: 'backgroundFill', params: { color: String(v) } } }),
  attire: () => ({ kind: 'prompt' }),
  titlePosition: () => ({ kind: 'prompt' }),
  infoDensity: () => ({ kind: 'prompt' }),

  // —— 生成类 ——
  pixelBlockSize: (v) => ({ kind: 'postprocess', step: { kind: 'pixelate', params: { pixelSize: Number(v) } } }),
  palette: (v) => ({
    kind: 'postprocess',
    step: { kind: 'paletteReduce', params: { colors: PALETTE_COLORS[String(v)] ?? 16 } },
  }),
  frameRate: () => ({ kind: 'prompt' }),
  loopMode: () => ({ kind: 'prompt' }),
  tileDensity: () => ({ kind: 'prompt' }),
  symmetry: () => ({ kind: 'prompt' }),
  redrawStrength: () => ({ kind: 'prompt' }),
  keepStructure: () => ({ kind: 'prompt' }),
  material: () => ({ kind: 'prompt' }),
  lighting: () => ({ kind: 'prompt' }),

  // —— 修复类 ——
  edgeFeather: () => ({ kind: 'prompt' }),
  matteOutput: (v) => ({
    kind: 'note',
    message: v === 'mask'
      ? '「黑白蒙版」需要支持蒙版协议的图像模型；当前仅做提示词引导，效果取决于模型。'
      : '「输出形式」由生成结果决定（PNG 保留 alpha、JPG 白底）；无法在纯前端做真正的蒙版输出。',
  }),
  repairStrength: () => ({
    kind: 'note',
    message: '文字水印移除需要图像模型具备 inpainting 能力；当前仅做提示词引导，效果取决于模型。',
  }),
  protectRegion: () => ({ kind: 'prompt' }),
  removalStrength: () => ({
    kind: 'note',
    message: '阴影移除效果取决于模型的材质/光影重建能力，建议在真实阴影场景下多生成几次。',
  }),
  keepAmbient: () => ({ kind: 'prompt' }),
  sharpen: () => ({
    kind: 'note',
    message: '「锐化」建议在导出时用本地图片处理工具做（非 AI 锐化）。当前仅做提示词引导。',
  }),
  denoise: () => ({
    kind: 'note',
    message: '「降噪」建议在导出时用本地图片处理工具做（非 AI 降噪）。当前仅做提示词引导。',
  }),
  upscale: (v) => {
    if (v === '1x') return { kind: 'note', message: '1x 表示保持原尺寸，不会做任何放大处理。' }
    const factor = typeof v === 'string' ? Number(v.replace(/x$/i, '')) : Number(v)
    return { kind: 'postprocess', step: { kind: 'resample', params: { scale: factor } } }
  },
  restoreStrength: () => ({ kind: 'prompt' }),
  colorize: () => ({ kind: 'prompt' }),
  descratch: () => ({
    kind: 'note',
    message: '「去划痕」是模型重建能力，不是确定性算子；效果取决于模型对老照片纹理的还原度。',
  }),

  // —— 人像类 ——
  cartoonLevel: () => ({ kind: 'prompt' }),
  cartoonStyle: () => ({ kind: 'prompt' }),
  artStyle: () => ({ kind: 'prompt' }),
  styleStrength: () => ({ kind: 'prompt' }),
  newBackground: () => ({ kind: 'prompt' }),
  edgeBlend: () => ({ kind: 'prompt' }),
}

function resolveControlEffect(control: ToolControl, value: string | number): ControlEffect {
  const resolver = CONTROL_EFFECT_BY_KEY[control.key]
  if (resolver) return resolver(value)
  return { kind: 'prompt' }
}

/* ────────────────────── 内置映射表 ────────────────────── */

const ID_PHOTO_SIZES: Record<string, { width: number; height: number }> = {
  'one-inch': { width: 295, height: 413 },
  'two-inch': { width: 413, height: 579 },
  'small-one-inch': { width: 260, height: 378 },
  passport: { width: 354, height: 472 },
}

const PALETTE_COLORS: Record<string, number> = {
  eight: 8,
  sixteen: 16,
  gameboy: 4, // 复古 GB = 4 色
}

/* ────────────────────── 与 store 的衔接 ────────────────────── */

export function buildGenerationInput(
  base: GenerationInput,
  effects: ResolvedToolEffects,
): { prompt: string; dimensionOverride?: { width: number; height: number } } {
  const basePrompt = base.prompt.trim()
  const finalPrompt = [basePrompt, ...effects.promptFragments].filter(Boolean).join(', ')
  return {
    prompt: finalPrompt,
    dimensionOverride: effects.dimensionOverride,
  }
}
