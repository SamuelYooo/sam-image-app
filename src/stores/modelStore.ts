import { invoke } from '@tauri-apps/api/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { hasTauriRuntime } from '../utils/tauriRuntime'

export type ModelCapability = 'text' | 'image'

export interface ModelProfileDraft {
  id: string
  capability: ModelCapability
  name: string
  provider: string
  baseUrl: string
  apiKey: string
  hasApiKey: boolean
  model: string
  chatEndpoint: string
  imageEndpoint: string
  modelsEndpoint: string
  enabled: boolean
  isDefault: boolean
}

export type ModelProfileMap = Record<ModelCapability, ModelProfileDraft>
export type ModelOptionsMap = Record<ModelCapability, string[]>
export type SelectedModelProfileMap = Record<ModelCapability, string>
export type ModelEndpointMessageMap = Record<ModelCapability, string>
export type ModelEndpointLoadingMap = Record<ModelCapability, boolean>
export type ModelHealthResultMap = Record<ModelCapability, Record<string, ModelHealthCheckResult>>

export const MODEL_PROVIDER_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'openai', label: 'OpenAI 官方' },
  { value: 'claude', label: 'Claude 接口' },
  { value: 'gemini', label: 'Gemini 接口' },
  { value: 'azure', label: 'Azure OpenAI' },
] as const

type ModelProvider = (typeof MODEL_PROVIDER_OPTIONS)[number]['value']

export interface ModelOptionsResponse {
  models: string[]
  message: string
}

export interface ModelEndpointCheckResponse {
  ok: boolean
  message: string
  statusCode?: number
}

export interface ModelHealthCheckResult {
  model: string
  ok: boolean
  latencyMs?: number
  statusCode?: number
  message: string
}

export interface ModelHealthCheckResponse {
  results: ModelHealthCheckResult[]
  message: string
}

const capabilities: ModelCapability[] = ['text', 'image']
const defaultModelProvider: ModelProvider = 'openai-compatible'
const MODEL_HEALTH_CHECK_TIMEOUT_MS = 15_000
const supportedModelProviders = new Set<string>(MODEL_PROVIDER_OPTIONS.map(item => item.value))
const legacyModelProviderAliases: Record<string, ModelProvider> = {
  custom: 'openai-compatible',
  zhipu: 'openai-compatible',
  bigmodel: 'openai-compatible',
  glm: 'openai-compatible',
  stability: 'openai-compatible',
  comfyui: 'openai-compatible',
  'openai compatible': 'openai-compatible',
  openai_compatible: 'openai-compatible',
}

export function normalizeModelProvider(provider: string): ModelProvider {
  const value = provider.trim().toLowerCase()
  if (!value) {
    return defaultModelProvider
  }
  if (value in legacyModelProviderAliases) {
    return legacyModelProviderAliases[value]
  }
  return supportedModelProviders.has(value) ? (value as ModelProvider) : defaultModelProvider
}

export function createModelProfileDraft(capability: ModelCapability): ModelProfileDraft {
  return {
    id: '',
    capability,
    name: capability === 'text' ? '我的文本模型' : '我的图像模型',
    provider: defaultModelProvider,
    baseUrl: '',
    apiKey: '',
    hasApiKey: false,
    model: '',
    chatEndpoint: capability === 'text' ? '/v1/chat/completions' : '',
    imageEndpoint: capability === 'image' ? '/v1/images/generations' : '',
    modelsEndpoint: '/v1/models',
    enabled: true,
    isDefault: false,
  }
}

export function cloneModelProfile(profile: ModelProfileDraft): ModelProfileDraft {
  return { ...profile }
}

export function normalizeModelProfile(profile: ModelProfileDraft): ModelProfileDraft {
  return {
    ...profile,
    id: profile.id.trim(),
    name: profile.name.trim() || (profile.capability === 'text' ? '文本模型' : '图像模型'),
    provider: normalizeModelProvider(profile.provider),
    baseUrl: profile.baseUrl.trim(),
    apiKey: profile.apiKey.trim(),
    hasApiKey: profile.hasApiKey,
    model: profile.model.trim(),
    chatEndpoint: profile.chatEndpoint.trim(),
    imageEndpoint: profile.imageEndpoint.trim(),
    modelsEndpoint: profile.modelsEndpoint.trim() || '/v1/models',
    isDefault: profile.isDefault,
  }
}

export function normalizeModelEndpointUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function firstApiKey(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .find(Boolean)
}

function applyAuthorizationHeader(headers: Record<string, string>, apiKey: string) {
  const firstKey = firstApiKey(apiKey)
  if (firstKey) {
    headers.Authorization = `Bearer ${firstKey}`
  }
}

function joinEndpointUrl(baseUrl: string, endpoint: string) {
  const normalizedBaseUrl = normalizeModelEndpointUrl(baseUrl)
  const normalizedEndpoint = endpoint.trim().replace(/^\/+/, '')
  if (!normalizedBaseUrl || !normalizedEndpoint) {
    throw new Error('请先填写服务地址和接口路径')
  }
  return `${normalizedBaseUrl}/${normalizedEndpoint}`
}

function modelCheckUrl(profile: ModelProfileDraft) {
  return joinEndpointUrl(
    profile.baseUrl,
    profile.capability === 'text'
      ? profile.chatEndpoint || profile.modelsEndpoint
      : profile.imageEndpoint || profile.modelsEndpoint
  )
}

export function hasConfiguredModel(profile: ModelProfileDraft) {
  const hasEndpoint =
    profile.capability === 'text' ? profile.chatEndpoint.trim().length > 0 : profile.imageEndpoint.trim().length > 0
  return profile.enabled && profile.baseUrl.trim().length > 0 && profile.model.trim().length > 0 && hasEndpoint
}

function createModelProfileMap(): ModelProfileMap {
  return {
    text: createModelProfileDraft('text'),
    image: createModelProfileDraft('image'),
  }
}

function createModelOptionsMap(): ModelOptionsMap {
  return {
    text: [],
    image: [],
  }
}

function createModelEndpointMessageMap(): ModelEndpointMessageMap {
  return {
    text: '',
    image: '',
  }
}

function createModelEndpointLoadingMap(): ModelEndpointLoadingMap {
  return {
    text: false,
    image: false,
  }
}

function createModelHealthResultMap(): ModelHealthResultMap {
  return {
    text: {},
    image: {},
  }
}

function createSelectedModelProfileMap(): SelectedModelProfileMap {
  return {
    text: '',
    image: '',
  }
}

function normalizeProfiles(profiles: ModelProfileDraft[]) {
  return profiles
    .filter(profile => capabilities.includes(profile.capability))
    .map(normalizeModelProfile)
    .sort((left, right) => {
      if (left.capability !== right.capability) {
        return capabilities.indexOf(left.capability) - capabilities.indexOf(right.capability)
      }
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
}

function defaultProfileForCapability(profiles: ModelProfileDraft[], capability: ModelCapability) {
  return (
    profiles.find(profile => profile.capability === capability && profile.enabled && profile.isDefault) ??
    profiles.find(profile => profile.capability === capability && profile.enabled) ??
    profiles.find(profile => profile.capability === capability)
  )
}

function mapDefaultProfiles(profiles: ModelProfileDraft[]): ModelProfileMap {
  const next = createModelProfileMap()
  for (const capability of capabilities) {
    const profile = defaultProfileForCapability(profiles, capability)
    if (profile) {
      next[capability] = cloneModelProfile(profile)
    }
  }
  return next
}

function profileListForCapability(profiles: ModelProfileDraft[], capability: ModelCapability) {
  return profiles.filter(profile => profile.capability === capability)
}

function modelCandidateKeys(capability: ModelCapability) {
  return capability === 'text'
    ? [
        'id',
        'root',
        'code',
        'slug',
        'name',
        'model',
        'modelName',
        'model_name',
        'modelCode',
        'model_code',
        'modelId',
        'model_id',
        'displayName',
        'display_name',
        'value',
      ]
    : [
        'id',
        'root',
        'code',
        'slug',
        'name',
        'model',
        'modelName',
        'model_name',
        'modelCode',
        'model_code',
        'modelId',
        'model_id',
        'displayName',
        'display_name',
        'value',
      ]
}

const modelCollectionKeys = [
  'data',
  'models',
  'items',
  'result',
  'results',
  'list',
  'model_list',
  'modelList',
  'modelIds',
  'model_ids',
  'available_models',
  'availableModels',
  'available',
  'catalog',
  'model_catalog',
  'modelCatalog',
  'model_map',
  'modelMap',
  'supported_models',
  'supportedModels',
]

const nonModelContainerKeys = new Set([
  'meta',
  'metadata',
  'page',
  'pages',
  'pagination',
  'links',
  'usage',
  'stats',
  'statistics',
])

function looksLikeModelId(value: string) {
  const normalizedValue = value.trim()
  return (
    normalizedValue.length > 0 &&
    normalizedValue.length <= 128 &&
    /^[A-Za-z0-9_.:/-]+$/.test(normalizedValue) &&
    /[0-9.:\-\/]/.test(normalizedValue)
  )
}

function isDisplayLabelKey(key: string) {
  return key === 'displayName' || key === 'display_name'
}

function collectModelIds(
  payload: unknown,
  capability: ModelCapability,
  models: string[],
  allowBareString = true,
  allowModelKeys = false
) {
  if (typeof payload === 'string') {
    const value = payload.trim()
    if (allowBareString && value) {
      models.push(value)
    }
    return
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectModelIds(item, capability, models, true, allowModelKeys)
    }
    return
  }

  if (!payload || typeof payload !== 'object') {
    return
  }

  const record = payload as Record<string, unknown>
  const modelCountBeforeNestedCollections = models.length
  for (const key of modelCollectionKeys) {
    if (key in record) {
      collectModelIds(record[key], capability, models, true, true)
    }
  }
  if (models.length > modelCountBeforeNestedCollections) {
    return
  }

  let collectedModelKey = false
  if (allowModelKeys) {
    for (const key of Object.keys(record)) {
      if (!modelCollectionKeys.includes(key) && !nonModelContainerKeys.has(key) && looksLikeModelId(key)) {
        models.push(key)
        collectedModelKey = true
      }
    }
  }

  for (const key of modelCandidateKeys(capability)) {
    if (collectedModelKey && isDisplayLabelKey(key)) {
      continue
    }
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      models.push(value.trim())
      return
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (modelCollectionKeys.includes(key) || nonModelContainerKeys.has(key)) {
      continue
    }
    if (allowModelKeys && looksLikeModelId(key)) {
      continue
    }
    if (value && typeof value === 'object') {
      collectModelIds(value, capability, models, false, allowModelKeys)
    }
  }
}

export function parseModelIds(payload: unknown, capability: ModelCapability) {
  const models: string[] = []
  collectModelIds(payload, capability, models)
  return Array.from(new Set(models.map(item => item.trim()).filter(Boolean))).sort()
}

export function mergeModelIds(primary: string[], fallback: string[]) {
  return Array.from(new Set([...primary, ...fallback].map(item => item.trim()).filter(Boolean))).sort()
}

function isZhipuProfile(profile: ModelProfileDraft) {
  const provider = profile.provider.toLowerCase()
  const baseUrl = profile.baseUrl.toLowerCase()
  return (
    provider.includes('zhipu') ||
    provider.includes('bigmodel') ||
    provider.includes('glm') ||
    baseUrl.includes('bigmodel.cn') ||
    baseUrl.includes('zhipuai.cn')
  )
}

export function getZhipuRecommendedModels(capability: ModelCapability) {
  const textModels = [
    'glm-4.7-flash',
    'glm-4.6',
    'glm-4.6v-flash',
    'glm-4.5',
    'glm-4.5-air',
    'glm-4.5-airx',
    'glm-4.5-flash',
    'glm-4.5v',
    'glm-4.5v-flash',
    'glm-4-flash',
    'glm-4-plus',
    'glm-4-air',
    'glm-4-long',
    'glm-4v-plus',
    'glm-4v-flash',
  ]
  if (capability === 'text') {
    return textModels
  }
  return ['cogview-3-flash', 'cogview-4']
}

async function fetchModelOptionsFromHttp(profile: ModelProfileDraft): Promise<ModelOptionsResponse> {
  const baseUrl = normalizeModelEndpointUrl(profile.baseUrl)
  const endpoint = profile.modelsEndpoint.trim().replace(/^\/+/, '')
  if (!baseUrl || !endpoint) {
    throw new Error('请先填写服务地址和模型列表路径')
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  applyAuthorizationHeader(headers, profile.apiKey)
  const isZhipu = isZhipuProfile(profile)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/${endpoint}`, { headers })
  } catch (error) {
    if (isZhipu) {
      const models = getZhipuRecommendedModels(profile.capability)
      return {
        models,
        message: `使用智谱推荐模型列表（模型列表接口暂不可用），共 ${models.length} 个模型`,
      }
    }
    throw error
  }
  if (!response.ok) {
    if (isZhipu) {
      const models = getZhipuRecommendedModels(profile.capability)
      return {
        models,
        message: `使用智谱推荐模型列表（模型列表接口暂不可用），共 ${models.length} 个模型`,
      }
    }
    throw new Error(`模型列表请求失败，HTTP ${response.status}`)
  }
  const parsedModels = parseModelIds(await response.json(), profile.capability)
  const models = isZhipu ? mergeModelIds(parsedModels, getZhipuRecommendedModels(profile.capability)) : parsedModels
  if (!models.length) {
    throw new Error(
      `${profile.capability === 'text' ? '文本模型' : '图像模型'}列表响应中没有识别到模型名称，请检查模型列表路径或手动填写模型名称`
    )
  }
  return {
    models,
    message: isZhipu ? `已获取 ${models.length} 个模型（含智谱推荐模型）` : `已获取 ${models.length} 个模型`,
  }
}

async function checkModelEndpointFromHttp(profile: ModelProfileDraft): Promise<ModelEndpointCheckResponse> {
  const url = modelCheckUrl(profile)

  const headers: Record<string, string> = {}
  applyAuthorizationHeader(headers, profile.apiKey)

  let response: Response
  try {
    response = await fetch(url, { method: 'HEAD', headers })
  } catch {
    response = await fetch(url, { method: 'GET', headers })
  }

  return {
    ok: true,
    statusCode: response.status,
    message: `接口连通，HTTP ${response.status}`,
  }
}

function buildModelHealthRequest(profile: ModelProfileDraft, model: string) {
  const endpoint = profile.chatEndpoint || profile.modelsEndpoint
  const payload = {
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
  }
  return {
    url: joinEndpointUrl(profile.baseUrl, endpoint),
    payload,
  }
}

function createModelHealthResponse(results: ModelHealthCheckResult[]): ModelHealthCheckResponse {
  const okCount = results.filter(result => result.ok).length
  const failedCount = results.length - okCount
  return {
    results,
    message: `健康检查完成：${okCount} 个通过，${failedCount} 个异常`,
  }
}

function modelIdMatches(models: string[], target: string) {
  const normalizedTarget = target.trim().toLowerCase()
  return models.some(model => model.trim().toLowerCase() === normalizedTarget)
}

function createUniformModelHealthResults(
  models: string[],
  ok: boolean,
  message: string,
  latencyMs?: number,
  statusCode?: number
): ModelHealthCheckResult[] {
  return models.map(model => ({
    model,
    ok,
    latencyMs,
    statusCode,
    message,
  }))
}

async function checkImageModelHealthFromHttp(
  profile: ModelProfileDraft,
  models: string[],
  headers: Record<string, string>
): Promise<ModelHealthCheckResult[]> {
  const startedAt = performance.now()
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(MODEL_HEALTH_CHECK_TIMEOUT_MS)
        : undefined
    const response = await fetch(joinEndpointUrl(profile.baseUrl, profile.modelsEndpoint), { headers, signal })
    const latencyMs = Math.round(performance.now() - startedAt)
    if (!response.ok) {
      return createUniformModelHealthResults(models, false, `HTTP ${response.status}`, latencyMs, response.status)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      return createUniformModelHealthResults(
        models,
        false,
        `模型列表响应无法解析: ${formatModelError(error)}`,
        latencyMs,
        response.status
      )
    }

    const fetchedModels = isZhipuProfile(profile)
      ? mergeModelIds(parseModelIds(payload, profile.capability), getZhipuRecommendedModels(profile.capability))
      : parseModelIds(payload, profile.capability)
    if (!fetchedModels.length) {
      return createUniformModelHealthResults(
        models,
        false,
        '模型列表响应中没有识别到模型名称',
        latencyMs,
        response.status
      )
    }

    return models.map(model => {
      const ok = modelIdMatches(fetchedModels, model)
      return {
        model,
        ok,
        latencyMs,
        statusCode: response.status,
        message: ok ? '检查通过' : '模型列表中未找到该模型',
      }
    })
  } catch (error) {
    return createUniformModelHealthResults(
      models,
      false,
      formatModelError(error),
      Math.round(performance.now() - startedAt)
    )
  }
}

async function checkModelHealthFromHttp(
  profile: ModelProfileDraft,
  models: string[]
): Promise<ModelHealthCheckResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  applyAuthorizationHeader(headers, profile.apiKey)

  if (profile.capability === 'image') {
    return createModelHealthResponse(await checkImageModelHealthFromHttp(profile, models, headers))
  }

  const results: ModelHealthCheckResult[] = []
  for (const model of models) {
    const startedAt = performance.now()
    try {
      const request = buildModelHealthRequest(profile, model)
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(MODEL_HEALTH_CHECK_TIMEOUT_MS)
          : undefined
      const response = await fetch(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.payload),
        signal,
      })
      const latencyMs = Math.round(performance.now() - startedAt)
      results.push({
        model,
        ok: response.ok,
        latencyMs,
        statusCode: response.status,
        message: response.ok ? '检查通过' : `HTTP ${response.status}`,
      })
    } catch (error) {
      results.push({
        model,
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        message: formatModelError(error),
      })
    }
  }

  return createModelHealthResponse(results)
}

export function formatModelError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error || '模型配置操作失败'
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ['message', 'error', 'reason', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
    try {
      return JSON.stringify(error)
    } catch {
      return '模型配置操作失败'
    }
  }
  return '模型配置操作失败'
}

export const useModelStore = defineStore('model', {
  state: () => ({
    isLoadingProfiles: false,
    lastError: '',
    isModelConfigOpen: false,
    activeModelCapability: 'image' as ModelCapability,
    modelProfiles: createModelProfileMap(),
    modelProfileList: [] as ModelProfileDraft[],
    selectedModelProfileIds: createSelectedModelProfileMap(),
    modelDrafts: createModelProfileMap(),
    modelOptions: createModelOptionsMap(),
    modelHealthResults: createModelHealthResultMap(),
    endpointCheckMessages: createModelEndpointMessageMap(),
    isCheckingModelEndpoint: createModelEndpointLoadingMap(),
    isCheckingModelHealth: createModelEndpointLoadingMap(),
    isFetchingModelOptions: false,
    lastModelFetchMessage: '',
    lastModelHealthMessage: '',
  }),

  getters: {
    hasTextModel: state => hasConfiguredModel(state.modelProfiles.text),
    hasImageModel: state => hasConfiguredModel(state.modelProfiles.image),
    textModelStatus(): string {
      return this.hasTextModel ? this.modelProfiles.text.model : '未配置文本模型'
    },
    imageModelStatus(): string {
      return this.hasImageModel ? this.modelProfiles.image.model : '未配置图像模型'
    },
    activeModelTitle: state => (state.activeModelCapability === 'text' ? '文本模型配置' : '图像模型配置'),
    activeModelHint: state =>
      state.activeModelCapability === 'text'
        ? '用于提示词优化、草案生成、分镜拆解。未配置时这些能力会禁用。'
        : '用于生图、图生图、ICON、分镜批量出图。未配置时不能生成图片。',
    activeCapabilityProfiles: state => profileListForCapability(state.modelProfileList, state.activeModelCapability),
  },

  actions: {
    applyProfiles(profiles: ModelProfileDraft[]) {
      const normalizedProfiles = normalizeProfiles(profiles)
      this.modelProfileList = normalizedProfiles
      this.modelProfiles = mapDefaultProfiles(normalizedProfiles)
      for (const capability of capabilities) {
        const currentSelected = normalizedProfiles.find(
          profile => profile.id === this.selectedModelProfileIds[capability]
        )
        const nextSelected = currentSelected ?? defaultProfileForCapability(normalizedProfiles, capability)
        this.selectedModelProfileIds[capability] = nextSelected?.id ?? ''
        this.modelDrafts[capability] = nextSelected
          ? cloneModelProfile(nextSelected)
          : createModelProfileDraft(capability)
      }
    },

    async loadModelProfiles() {
      this.lastError = ''
      if (!hasTauriRuntime()) {
        return
      }

      this.isLoadingProfiles = true
      try {
        const profiles = await invoke<ModelProfileDraft[]>('list_model_profiles')
        this.applyProfiles(profiles)
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isLoadingProfiles = false
      }
    },

    openModelConfig(capability: ModelCapability) {
      this.editModelProfile(capability)
      this.isModelConfigOpen = true
    },

    editModelProfile(capability: ModelCapability, id?: string) {
      this.activeModelCapability = capability
      const selectedId = id ?? this.selectedModelProfileIds[capability]
      const target =
        this.modelProfileList.find(profile => profile.capability === capability && profile.id === selectedId) ??
        defaultProfileForCapability(this.modelProfileList, capability)
      this.selectedModelProfileIds[capability] = target?.id ?? ''
      this.modelDrafts[capability] = target ? cloneModelProfile(target) : createModelProfileDraft(capability)
      this.lastError = ''
      this.lastModelFetchMessage = ''
      this.lastModelHealthMessage = ''
      this.endpointCheckMessages[capability] = ''
    },

    createNewModelProfile(capability = this.activeModelCapability) {
      this.activeModelCapability = capability
      this.selectedModelProfileIds[capability] = ''
      this.modelDrafts[capability] = createModelProfileDraft(capability)
      this.lastError = ''
      this.lastModelFetchMessage = ''
      this.lastModelHealthMessage = ''
      this.endpointCheckMessages[capability] = ''
    },

    closeModelConfig() {
      this.isModelConfigOpen = false
    },

    async fetchModelOptions() {
      const capability = this.activeModelCapability
      const profile = normalizeModelProfile(this.modelDrafts[capability])
      this.lastError = ''
      this.lastModelFetchMessage = ''
      this.lastModelHealthMessage = ''

      this.isFetchingModelOptions = true
      try {
        const result = hasTauriRuntime()
          ? await invoke<ModelOptionsResponse>('fetch_model_options', { profile })
          : await fetchModelOptionsFromHttp(profile)
        this.modelOptions[capability] = result.models
        this.modelHealthResults[capability] = {}
        this.lastModelFetchMessage = result.message
        if (!profile.model && result.models[0]) {
          this.modelDrafts[capability].model = result.models[0]
        }
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isFetchingModelOptions = false
      }
    },

    async checkModelHealth(models = this.modelOptions[this.activeModelCapability]) {
      const capability = this.activeModelCapability
      const profile = normalizeModelProfile(this.modelDrafts[capability])
      const targetModels = mergeModelIds(models, profile.model ? [profile.model] : [])
      this.lastError = ''
      this.lastModelHealthMessage = ''
      if (!targetModels.length) {
        this.lastError = '请先获取模型列表或填写模型名称'
        return
      }

      this.isCheckingModelHealth[capability] = true
      try {
        const result = hasTauriRuntime()
          ? await invoke<ModelHealthCheckResponse>('check_model_health', { profile, models: targetModels })
          : await checkModelHealthFromHttp(profile, targetModels)
        this.modelHealthResults[capability] = {
          ...this.modelHealthResults[capability],
          ...Object.fromEntries(result.results.map(item => [item.model, item])),
        }
        this.lastModelHealthMessage = result.message
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isCheckingModelHealth[capability] = false
      }
    },

    async checkModelEndpointConnectivity() {
      const capability = this.activeModelCapability
      const profile = normalizeModelProfile(this.modelDrafts[capability])
      const baseUrl = normalizeModelEndpointUrl(profile.baseUrl)
      this.endpointCheckMessages[capability] = ''
      if (!baseUrl) {
        return
      }

      this.isCheckingModelEndpoint[capability] = true
      try {
        const result = hasTauriRuntime()
          ? await invoke<ModelEndpointCheckResponse>('check_model_endpoint', { profile })
          : await checkModelEndpointFromHttp(profile)
        this.endpointCheckMessages[capability] = result.message
      } catch (error) {
        this.endpointCheckMessages[capability] = formatModelError(error)
      } finally {
        this.isCheckingModelEndpoint[capability] = false
      }
    },

    async saveModelProfile(options: { closeModal?: boolean } = {}) {
      const capability = this.activeModelCapability
      const profile = normalizeModelProfile(this.modelDrafts[capability])
      const closeModal = options.closeModal ?? true
      this.lastError = ''
      if (!hasTauriRuntime()) {
        const localProfile = {
          ...profile,
          id: profile.id || `browser-${capability}-${Date.now()}`,
          isDefault:
            profile.isDefault || !this.modelProfileList.some(item => item.capability === capability && item.isDefault),
        }
        const nextProfiles = [...this.modelProfileList.filter(item => item.id !== localProfile.id), localProfile].map(
          item =>
            item.capability === capability && localProfile.isDefault
              ? { ...item, isDefault: item.id === localProfile.id }
              : item
        )
        this.applyProfiles(nextProfiles)
        this.editModelProfile(capability, localProfile.id)
        this.isModelConfigOpen = closeModal ? false : this.isModelConfigOpen
        return localProfile.id
      }

      this.isLoadingProfiles = true
      try {
        const profiles = await invoke<ModelProfileDraft[]>('save_model_profile', { profile })
        this.applyProfiles(profiles)
        const saved =
          profiles.find(item => item.id === profile.id) ??
          profiles.find(
            item => item.capability === capability && item.model === profile.model && item.name === profile.name
          )
        if (saved) {
          this.editModelProfile(capability, saved.id)
        }
        this.isModelConfigOpen = closeModal ? false : this.isModelConfigOpen
        return saved?.id
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isLoadingProfiles = false
      }
    },

    async saveAndSetDefaultModelProfile() {
      const savedId = await this.saveModelProfile({ closeModal: false })
      if (!savedId) {
        return
      }
      await this.setDefaultModelProfile(savedId)
      this.isModelConfigOpen = false
    },

    async setDefaultModelProfile(id = this.modelDrafts[this.activeModelCapability].id) {
      const capability = this.activeModelCapability
      if (!id) {
        this.lastError = '请先保存模型配置，再设为当前生效'
        return
      }
      this.lastError = ''
      if (!hasTauriRuntime()) {
        this.applyProfiles(
          this.modelProfileList.map(profile =>
            profile.capability === capability ? { ...profile, isDefault: profile.id === id, enabled: true } : profile
          )
        )
        this.editModelProfile(capability, id)
        return
      }

      this.isLoadingProfiles = true
      try {
        const profiles = await invoke<ModelProfileDraft[]>('set_default_model_profile', { id })
        this.applyProfiles(profiles)
        this.editModelProfile(capability, id)
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isLoadingProfiles = false
      }
    },

    async deleteModelProfile(id = this.modelDrafts[this.activeModelCapability].id) {
      const capability = this.activeModelCapability
      this.lastError = ''
      if (!id) {
        this.createNewModelProfile(capability)
        return
      }
      if (!hasTauriRuntime()) {
        this.applyProfiles(this.modelProfileList.filter(profile => profile.id !== id))
        this.editModelProfile(capability)
        return
      }

      this.isLoadingProfiles = true
      try {
        const profiles = await invoke<ModelProfileDraft[]>('delete_model_profile', { id })
        this.applyProfiles(profiles)
        this.editModelProfile(capability)
      } catch (error) {
        this.lastError = formatModelError(error)
      } finally {
        this.isLoadingProfiles = false
      }
    },

    async clearModelProfile() {
      await this.deleteModelProfile()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useModelStore, import.meta.hot))
}
