export type PromptSource = 'builtin' | 'glidea' | 'evolink' | 'custom_json' | 'user'
export type PromptLanguage = 'zh' | 'en' | 'mixed'
export type PromptUseCase = 'txt2img' | 'img2img' | 'icon' | 'storyboard' | 'reference' | 'workflow'

export interface PromptAsset {
  id: string
  title: string
  content: string
  source: PromptSource
  sourceId?: string
  sourceUrl?: string
  license?: string
  author?: string
  categories: string[]
  tags: string[]
  useCases: PromptUseCase[]
  previewImages: string[]
  referenceImages: string[]
  language: PromptLanguage
  favorite: boolean
  usageCount: number
  importedAt: string
  updatedAt: string
}

export interface PromptImportOptions {
  source: PromptSource
  now?: string
}

type RawPromptRecord = Record<string, unknown>

const useCases = new Set<PromptUseCase>(['txt2img', 'img2img', 'icon', 'storyboard', 'reference', 'workflow'])

function isRecord(value: unknown): value is RawPromptRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRecordArray(input: unknown): RawPromptRecord[] {
  if (Array.isArray(input)) {
    return input.filter(isRecord)
  }

  if (!isRecord(input)) {
    return []
  }

  for (const key of ['prompts', 'records', 'data', 'items', 'list']) {
    const value = input[key]
    if (Array.isArray(value)) {
      return value.filter(isRecord)
    }
  }

  return [input]
}

function pickString(record: RawPromptRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number') {
      return String(value)
    }
  }
  return ''
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function pickStringArray(record: RawPromptRecord, keys: string[]) {
  for (const key of keys) {
    const values = toStringArray(record[key])
    if (values.length) {
      return values
    }
  }
  return []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}

function stableHash(value: string) {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function detectLanguage(text: string): PromptLanguage {
  const hasZh = /[\u4e00-\u9fa5]/.test(text)
  const hasEn = /[a-z]/i.test(text)
  if (hasZh && hasEn) {
    return 'mixed'
  }
  return hasZh ? 'zh' : 'en'
}

function normalizeUseCases(values: string[]): PromptUseCase[] {
  const normalized = values
    .map((value) => value.toLowerCase().replace(/\s+/g, '_'))
    .map((value) => (value === 'text_to_image' ? 'txt2img' : value))
    .map((value) => (value === 'image_to_image' ? 'img2img' : value))
    .filter((value): value is PromptUseCase => useCases.has(value as PromptUseCase))

  return normalized.length ? uniqueStrings(normalized) as PromptUseCase[] : ['txt2img']
}

function normalizePromptRecord(record: RawPromptRecord, options: Required<PromptImportOptions>): PromptAsset | null {
  const title = pickString(record, ['title', 'name', 'label'])
  const content =
    pickString(record, ['content', 'prompt', 'text', 'description']) ||
    (options.source === 'evolink' ? title : '')
  if (!content) {
    return null
  }

  const normalizedTitle = title || content.slice(0, 32)
  const sourceId = pickString(record, ['id', 'sourceId', 'source_id', 'slug', 'url', 'tweet_url'])
  const sourceUrl = pickString(record, ['sourceUrl', 'source_url', 'url', 'tweet_url', 'link'])
  const categories = uniqueStrings([
    ...pickStringArray(record, ['categories', 'category']),
    ...pickStringArray(record, ['sub_category', 'subCategory']),
    ...pickStringArray(record, ['mode', 'use_case', 'useCase']),
  ])
  const tags = uniqueStrings([...pickStringArray(record, ['tags', 'keywords']), ...categories])
  const previewImages = pickStringArray(record, ['previewImages', 'preview_images', 'preview', 'images'])
  const referenceImages = pickStringArray(record, ['referenceImages', 'reference_images', 'reference_image_urls'])
  const sourceKey = `${options.source}:${sourceId || stableHash(content)}`

  return {
    id: `prompt-${stableHash(sourceKey)}`,
    title: normalizedTitle,
    content,
    source: options.source,
    sourceId: sourceId || undefined,
    sourceUrl: sourceUrl || undefined,
    license: pickString(record, ['license']) || undefined,
    author: pickString(record, ['author', 'creator', 'author_handle']) || undefined,
    categories,
    tags,
    useCases: normalizeUseCases([...pickStringArray(record, ['useCases', 'use_cases']), ...categories]),
    previewImages,
    referenceImages,
    language: detectLanguage(`${normalizedTitle}\n${content}`),
    favorite: Boolean(record.favorite),
    usageCount: Number(record.usageCount || record.usage_count || 0),
    importedAt: options.now,
    updatedAt: options.now,
  }
}

export function parsePromptAssets(input: unknown, options: PromptImportOptions): PromptAsset[] {
  const normalizedOptions: Required<PromptImportOptions> = {
    ...options,
    now: options.now ?? new Date().toISOString(),
  }
  const seen = new Set<string>()
  const assets: PromptAsset[] = []

  for (const record of toRecordArray(input)) {
    const asset = normalizePromptRecord(record, normalizedOptions)
    if (!asset) {
      continue
    }
    const dedupeKey = asset.sourceId ? `${asset.source}:${asset.sourceId}` : stableHash(asset.content)
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    assets.push(asset)
  }

  return assets
}
