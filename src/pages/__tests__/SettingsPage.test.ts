import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsPagePath = resolve('src/pages/SettingsPage.vue')

describe('SettingsPage model editor layout', () => {
  it('renders the model editor inline inside model cards instead of as a global bottom editor', () => {
    const source = readFileSync(settingsPagePath, 'utf8')

    expect(source).toContain('data-testid="image-model-card"')
    expect(source).toContain('data-testid="text-model-card"')
    expect(source).toContain('v-if="editingModelId === model.id"')
    expect(source).toContain('v-if="isCreatingModel(\'image\')"')
    expect(source).toContain('v-if="isCreatingModel(\'text\')"')
    expect(source).toContain('data-testid="model-editor"')
    expect(source).not.toContain('<h3>模型编辑</h3>')
    expect(source).not.toContain('data-testid="global-model-editor"')
  })

  it('treats configured endpoints as base URLs without requiring a manual v1 path', () => {
    const source = readFileSync(settingsPagePath, 'utf8')

    expect(source).toContain("endpoint: 'https://api.openai.com'")
    expect(source).toContain("path: 'v1/chat/completions'")
    expect(source).toContain("path: 'v1/images/generations'")
    expect(source).toContain('OpenAI 通用标准')
    expect(source).toContain('Anthropic 协议')
    expect(source).toContain('阿里云通义万相')
    expect(source).toContain('芒果 AIGC 分镜生图')
    expect(source).toContain('openapi/v1/storyboard/generateByPromptV2')
    expect(source).toContain('https://aigc.mgtv.com')
    expect(source).toContain('Secret Key')
    expect(source).toContain('mgtv-storyboard')
    expect(source).toContain('api/v1/services/aigc/multimodal-generation/generation')
    expect(source).toContain('上游 BASE_URL')
    expect(source).toContain('https://your-relay.example.com')
    expect(source).not.toContain("endpoint: 'https://api.openai.com/v1")
  })

  it('does not show builtin fallback models in the remote model picker', () => {
    const source = readFileSync(settingsPagePath, 'utf8')

    expect(source).not.toContain('builtinModelCatalog')
    expect(source).not.toContain('内置兜底')
    expect(source).not.toContain('当前显示内置常用模型')
    expect(source).toContain('接口未返回模型')
  })

  it('shows a per-model loading state while testing connection', () => {
    const source = readFileSync(settingsPagePath, 'utf8')

    expect(source).toContain('const testingModelIds = ref<Set<string>>(new Set())')
    expect(source).toContain('async function testModelConnection(id: string)')
    expect(source).toContain(':disabled="isModelTesting(model.id)"')
    expect(source).toContain(':aria-busy="isModelTesting(model.id)"')
    expect(source).toContain('LoaderCircle v-if="isModelTesting(model.id)"')
    expect(source).toContain("{{ isModelTesting(model.id) ? '检测中' : '检测连接' }}")
    expect(source).not.toContain('@click="store.testModel(model.id)"')
  })

  it('can trigger connection tests for all configured image and text models', () => {
    const source = readFileSync(settingsPagePath, 'utf8')

    expect(source).toContain('const configuredModels = computed(() => [...store.imageModels, ...store.textModels, ...store.ttsModels].filter(isConfiguredModel))')
    expect(source).toContain('async function testAllConfiguredModels(): Promise<void>')
    expect(source).toContain('for (const model of models)')
    expect(source).toContain('await store.testModel(model.id)')
    expect(source).toContain('一次检测全部已配置模型，包含图像模型和文本模型。')
    expect(source).toContain('@click="testAllConfiguredModels"')
    expect(source).toContain("testingAllModels ? '检测全部中'")
  })
})
