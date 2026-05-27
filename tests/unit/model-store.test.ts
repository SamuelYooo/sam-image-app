import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MODEL_PROVIDER_OPTIONS,
  createModelProfileDraft,
  formatModelError,
  getZhipuRecommendedModels,
  hasConfiguredModel,
  mergeModelIds,
  normalizeModelProfile,
  normalizeModelEndpointUrl,
  parseModelIds,
  useModelStore,
  type ModelProfileDraft,
} from '../../src/stores/modelStore'

describe('model store helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts without a configured image model', () => {
    const imageProfile = createModelProfileDraft('image')

    expect(imageProfile.provider).toBe('openai-compatible')
    expect(imageProfile.model).toBe('')
    expect(imageProfile.imageEndpoint).toBe('/v1/images/generations')
    expect(imageProfile.apiKey).toBe('')
    expect(imageProfile.hasApiKey).toBe(false)
    expect(hasConfiguredModel(imageProfile)).toBe(false)
  })

  it('normalizes user supplied model profiles before persistence', () => {
    const profile = normalizeModelProfile({
      ...createModelProfileDraft('text'),
      name: '  ',
      provider: '  openai  ',
      baseUrl: '  https://api.example.com  ',
      apiKey: '  sk-test  ',
      model: '  gpt-test  ',
      chatEndpoint: '  /chat  ',
      imageEndpoint: '  ',
      modelsEndpoint: '  ',
    })

    expect(profile.name).toBe('文本模型')
    expect(profile.provider).toBe('openai')
    expect(profile.baseUrl).toBe('https://api.example.com')
    expect(profile.apiKey).toBe('sk-test')
    expect(profile.model).toBe('gpt-test')
    expect(profile.chatEndpoint).toBe('/chat')
    expect(profile.modelsEndpoint).toBe('/v1/models')
    expect(hasConfiguredModel(profile)).toBe(true)
  })

  it('maps legacy custom and zhipu provider values to OpenAI-compatible', () => {
    const customProfile = normalizeModelProfile({
      ...createModelProfileDraft('text'),
      provider: ' custom ',
    })
    const zhipuProfile = normalizeModelProfile({
      ...createModelProfileDraft('text'),
      provider: ' zhipu ',
    })
    const emptyProfile = normalizeModelProfile({
      ...createModelProfileDraft('text'),
      provider: '  ',
    })

    expect(customProfile.provider).toBe('openai-compatible')
    expect(zhipuProfile.provider).toBe('openai-compatible')
    expect(emptyProfile.provider).toBe('openai-compatible')
  })

  it('exposes only the supported API type options', () => {
    expect(MODEL_PROVIDER_OPTIONS).toEqual([
      { value: 'openai-compatible', label: 'OpenAI 兼容' },
      { value: 'openai', label: 'OpenAI 官方' },
      { value: 'claude', label: 'Claude 接口' },
      { value: 'gemini', label: 'Gemini 接口' },
      { value: 'azure', label: 'Azure OpenAI' },
    ])
  })

  it('keeps multiple profiles and maps the default effective model', () => {
    const store = useModelStore()
    const profiles: ModelProfileDraft[] = [
      {
        ...createModelProfileDraft('image'),
        id: 'image-a',
        name: 'Image A',
        baseUrl: 'https://a.example.com',
        model: 'image-a',
        isDefault: false,
      },
      {
        ...createModelProfileDraft('image'),
        id: 'image-b',
        name: 'Image B',
        baseUrl: 'https://b.example.com',
        model: 'image-b',
        isDefault: true,
      },
    ]

    store.applyProfiles(profiles)

    expect(store.modelProfileList).toHaveLength(2)
    expect(store.modelProfiles.image.id).toBe('image-b')
    expect(store.imageModelStatus).toBe('image-b')

    store.editModelProfile('image', 'image-a')
    expect(store.modelDrafts.image.id).toBe('image-a')
  })

  it('normalizes endpoint urls for automatic connectivity checks', () => {
    expect(normalizeModelEndpointUrl(' https://api.example.com/// ')).toBe('https://api.example.com')
    expect(normalizeModelEndpointUrl('')).toBe('')
  })

  it('formats structured Tauri errors without leaking object placeholders', () => {
    expect(formatModelError({ code: 'INVALID_DATA', message: '模型列表请求失败，HTTP 401' })).toBe(
      '模型列表请求失败，HTTP 401',
    )
    expect(formatModelError({ error: '网络请求失败' })).toBe('网络请求失败')
    expect(formatModelError({ detail: { reason: 'bad gateway' } })).toBe('{"detail":{"reason":"bad gateway"}}')
  })

  it('parses nested model lists instead of stopping at response metadata fields', () => {
    const models = parseModelIds(
      {
        id: 'provider-request-id',
        model: 'metadata-model',
        data: [{ id: 'qwen-plus' }, { id: 'deepseek-chat' }, { id: 'glm-4.5' }],
      },
      'text',
    )

    expect(models).toEqual(['deepseek-chat', 'glm-4.5', 'qwen-plus'])
  })

  it('parses provider catalogs grouped by unknown keys', () => {
    const models = parseModelIds(
      {
        data: {
          glmSeries: [{ id: 'GLM-4.5-Flash' }, { name: 'GLM-4.6V-Flash' }],
          metadata: {
            model: 'provider-metadata-model',
          },
        },
      },
      'text',
    )

    expect(models).toEqual(['GLM-4.5-Flash', 'GLM-4.6V-Flash'])
  })

  it('parses provider catalog maps and alias model fields', () => {
    const models = parseModelIds(
      {
        data: {
          'glm-4.5-flash': {
            object: 'model',
            owned_by: 'zhipu',
          },
          'glm-4.6v-flash': {
            displayName: 'GLM-4.6V-Flash',
          },
          vision: [{ root: 'glm-4.5v' }, { modelCode: 'glm-4.5-airx' }],
          metadata: {
            model: 'provider-metadata-model',
          },
        },
      },
      'text',
    )

    expect(models).toEqual(['glm-4.5-airx', 'glm-4.5-flash', 'glm-4.5v', 'glm-4.6v-flash'])
  })

  it('supplements zhipu model lists with GLM fallback models', () => {
    const models = mergeModelIds(['glm-4-plus', 'glm-4.6v-flash'], getZhipuRecommendedModels('text'))

    expect(models).toContain('glm-4.5-flash')
    expect(models).toContain('glm-4.6v-flash')
    expect(models).toContain('glm-4.5v')
  })
})
