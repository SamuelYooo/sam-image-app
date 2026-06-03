import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspacePagePath = resolve('src/pages/WorkspacePage.vue')

describe('WorkspacePage generation feedback', () => {
  it('does not show previous history assets after a generation failure', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const currentAssets = computed(() => currentTask.value?.assets ?? [])")
    expect(source).toContain('const actionTask = computed(() => currentTask.value)')
    expect(source).toContain("generationError.value = error instanceof Error ? error.message : '生成失败'")
    expect(source).toContain('v-else-if="generationError"')
    expect(source).not.toContain('store.recentTasks[0]')
  })

  it('keeps a floating generate action available in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('class="floating-generate-btn btn-primary"')
    expect(source).toContain(':disabled="generateDisabled"')
    expect(source).toContain("{{ generating ? '生成中...' : '开始生成' }}")
    expect(source).not.toContain('class="generate-btn btn-primary"')
  })

  it('guards generation against repeated submissions', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const generateDebounceMs = 900')
    expect(source).toContain('const generateDisabled = computed(() => generating.value || generateCooldown.value)')
    expect(source).toContain('if (generateDisabled.value) return')
    expect(source).toContain('generateCooldown.value = true')
  })

  it('keeps prompt generation on the raw prompt instead of auto-translating', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('async function preparePromptForGeneration')
    expect(source).toContain('return buildGenerationPrompt(prompt.value.trim())')
    expect(source).toContain('const generationPrompt = await preparePromptForGeneration()')
    expect(source).toContain('prompt: generationPrompt')
  })

  it('exposes prompt translation and bilingual library actions in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const promptHasChinese = computed')
    expect(source).toContain('async function translateCurrentPrompt')
    expect(source).toContain("{{ translatingPrompt ? '翻译中...' : '译英' }}")
    expect(source).toContain("applyPrompt(item, 'en')")
    expect(source).toContain("applyPrompt(item, 'zh')")
    expect(source).toContain('promptLanguageHint')
  })

  it('paginates the workspace prompt library instead of hard slicing results', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const promptPage = ref(1)')
    expect(source).toContain('const promptPageSize = 12')
    expect(source).toContain('const filteredPrompts = computed')
    expect(source).toContain('const visiblePrompts = computed(() => {')
    expect(source).toContain('filteredPrompts.value.slice(start, start + promptPageSize)')
    expect(source).toContain('promptTotalPages')
    expect(source).toContain('上一页')
    expect(source).toContain('下一页')
    expect(source).not.toContain('.slice(0, 24)')
  })

  it('shows animated GIF and 3D preview treatments in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('function buildGenerationPrompt')
    // 模式提示词片段已迁到 domain/tools.ts，这里只断言组件引用相应的 computed
    expect(source).toContain('toolEffects')
    expect(source).toContain('mode-preview-gif')
    expect(source).toContain('mode-preview-3d')
    expect(source).toContain('mode-preview-idle')
    expect(source).toContain('sample-media-gif')
    expect(source).toContain('sample-media-3d')
    expect(source).toContain('isGifAsset(asset)')
    expect(source).toContain('isThreeDAsset(asset)')
  })
})

describe('WorkspacePage tool-aware rendering', () => {
  it('imports the tool catalog helpers from the data layer', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("from '@/data/catalog'")
    expect(source).toContain('defaultToolForMode, findToolEntry')
    expect(source).toContain("toolGroups } from '@/data/catalog'")
  })

  it('tracks the active tool and its derived state', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const activeToolId = ref('')")
    expect(source).toContain('const extraOptions = reactive')
    expect(source).toContain('const activeTool = computed')
    expect(source).toContain('function selectTool')
    expect(source).toContain('function applyToolControlDefaults')
    // 旧：内联 toolPromptFragments / modePromptFragments
    // 新：集中到 resolveToolEffects
    expect(source).toContain('resolveToolEffects')
  })

  it('delegates prompt fragment composition to resolveToolEffects', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // 重构后 buildGenerationPrompt 收窄为 base + toolEffects.promptFragments
    expect(source).toContain('function buildGenerationPrompt')
    expect(source).toContain('toolEffects.value.promptFragments')
    // 旧的内联模式片段函数已删除
    expect(source).not.toContain('function modePromptFragments')
    expect(source).not.toContain('function toolPromptFragments')
  })

  it('blocks reference-required tools without an uploaded image', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // C7：modeOptions 不再注入冗余的 toolId/toolTitle
    expect(source).not.toContain('options.toolId = activeTool.value.id')
    expect(source).not.toContain('options.toolTitle = activeTool.value.title')
    expect(source).toContain('activeTool.value?.referenceRequired && !referenceImage.value')
    expect(source).toContain("generationError.value = '当前工具需要先上传参考图'")
  })

  it('renders the tool picker grid and tool-aware control blocks', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('tool-picker')
    expect(source).toContain('tool-pick-card')
    expect(source).toContain('tool-pick-icon')
    expect(source).toContain('tool-controls-block')
    expect(source).toContain('tool-banner')
    expect(source).toContain('工具参数')
    expect(source).toContain('使用提示')
  })

  it('prefers the active tool flow copy over the mode fallback', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('if (activeTool.value?.flowCopy) return activeTool.value.flowCopy')
  })

  it('wires real lucide icons in the tool picker and runs post-processing in generate', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // 真实图标：resolveToolIcon 注册的 lucide 组件
    expect(source).toContain("import { resolveToolIcon } from '@/domain/icons'")
    expect(source).toContain('resolveToolIcon(tool.icon)')
    // 后处理管道接入 generate()
    expect(source).toContain('applyPostProcessPipeline')
    expect(source).toContain('effects.postProcessSteps')
    // 工具的诚实提示
    expect(source).toContain('effects.notes')
  })

  it('drops the legacy mode descriptions import', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).not.toContain('modeDescriptions')
  })
})
