import type { PromptItem } from '@/types/domain'
import { hashString, stableId } from './ids'

type RawPrompt = Record<string, unknown>

const KNOWN_SOURCES = ['glidea', 'EvoLinkAI', 'freestylefly'] as const

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function readArray(data: unknown): RawPrompt[] {
  if (Array.isArray(data)) return data.filter((item): item is RawPrompt => item !== null && typeof item === 'object')
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['prompts', 'items', 'data']) {
      const value = record[key]
      if (Array.isArray(value)) return value.filter((item): item is RawPrompt => item !== null && typeof item === 'object')
    }
  }
  return []
}

function detectSource(filename: string): PromptItem['source'] {
  const lower = filename.toLowerCase()
  if (lower.includes('glidea') || lower.includes('banana')) return 'glidea'
  if (lower.includes('evolinkai') || lower.includes('awesome-gpt-image')) return 'EvoLinkAI'
  if (lower.includes('freestylefly')) return 'freestylefly'
  return 'custom'
}

function normalizeKnownSource(value: PromptItem['source']): PromptItem['source'] {
  return KNOWN_SOURCES.includes(value as (typeof KNOWN_SOURCES)[number]) ? value : 'custom'
}

function createPromptItem(
  source: PromptItem['source'],
  sourceId: string,
  title: string,
  prompt: string,
  category = '',
): PromptItem {
  const now = new Date().toISOString()
  return {
    id: stableId('prompt', `${source}-${sourceId}-${prompt}`),
    title,
    prompt,
    source: normalizeKnownSource(source),
    sourceId,
    category,
    subCategory: '',
    author: '',
    tags: category ? [category] : [],
    preview: '',
    refImages: [],
    createdAt: now,
  }
}

export function normalizePromptImport(content: string, filename: string): PromptItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('导入文件不是有效的 JSON')
  }

  const source = detectSource(filename)
  const now = new Date().toISOString()

  return readArray(parsed)
    .map((item, index): PromptItem | null => {
      const title =
        asString(item.title) ||
        asString(item.name) ||
        asString(item.text).slice(0, 40) ||
        asString(item.prompt).slice(0, 40)
      const prompt = asString(item.prompt) || asString(item.content) || asString(item.text) || asString(item.url)
      if (!title || !prompt) return null

      const tags = asStringArray(item.tags)
      const images = asStringArray(item.images).concat(asStringArray(item.reference_image_urls))
      const rawCategory = asString(item.category) || asString(item.sub_category) || tags[0] || ''
      const sourceId = asString(item.sourceId) || asString(item.id) || stableId(source, `${title}-${prompt}-${index}`)

      return {
        id: stableId('prompt', `${source}-${sourceId}-${prompt}`),
        title,
        prompt,
        source: normalizeKnownSource(source),
        sourceId,
        category: rawCategory,
        subCategory: asString(item.sub_category),
        author: asString(item.author) || asString(item.author_name) || asString(item.user),
        tags,
        preview: asString(item.preview) || images[0] || '',
        refImages: images,
        createdAt: now,
      }
    })
    .filter((item): item is PromptItem => item !== null)
}

export function normalizePromptSync(content: string, source: PromptItem['source'], sourceUrl: string): PromptItem[] {
  try {
    return normalizePromptImport(content, `${source}-prompts.json`)
  } catch {
    return normalizePromptMarkdown(content, source, sourceUrl)
  }
}

function normalizePromptMarkdown(content: string, source: PromptItem['source'], sourceUrl: string): PromptItem[] {
  const items: PromptItem[] = []
  const lines = content.split(/\r?\n/)
  let category = ''
  let title = ''
  let codeLines: string[] = []
  let codeCategory = ''
  let codeTitle = ''
  let inCodeBlock = false

  function pushPrompt(prompt: string, itemTitle: string, itemCategory: string): void {
    if (prompt.length < 8) return
    const index = items.length
    const fallbackTitle = prompt.split(/\r?\n/).find(Boolean)?.slice(0, 48) || `${source} Prompt ${index + 1}`
    items.push(createPromptItem(
      source,
      stableId(source, `${sourceUrl}-${prompt}-${index}`),
      itemTitle || fallbackTitle,
      prompt,
      itemCategory,
    ))
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLines = []
        codeCategory = category
        codeTitle = title
      } else {
        inCodeBlock = false
        pushPrompt(codeLines.join('\n').trim(), codeTitle, codeCategory)
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const categoryMatch = line.match(/^##\s+(.+?)\s*$/)
    const titleMatch = line.match(/^###\s+(.+?)\s*$/)
    if (categoryMatch) {
      category = categoryMatch[1].trim()
      title = ''
    } else if (titleMatch) {
      title = titleMatch[1].trim()
    }
  }

  if (items.length) return items

  const promptLines = Array.from(content.matchAll(/(?:^|\n)\s*(?:Prompt|提示词)[:：]\s*(.+)/gi))
    .map((match) => match[1]?.trim())
    .filter((prompt): prompt is string => Boolean(prompt && prompt.length >= 8))

  return promptLines.map((prompt, index) => createPromptItem(
    source,
    stableId(source, `${sourceUrl}-${prompt}-${index}`),
    title || prompt.slice(0, 48),
    prompt,
    category,
  ))
}

export function mergePromptItems(existing: PromptItem[], incoming: PromptItem[]): PromptItem[] {
  const sourceKeys = new Set(existing.map((item) => `${item.source}:${item.sourceId}`))
  const customHashes = new Set(existing.filter((item) => item.source === 'custom').map((item) => hashString(item.prompt)))

  const additions = incoming.filter((item) => {
    const sourceKey = `${item.source}:${item.sourceId}`
    if (sourceKeys.has(sourceKey)) return false

    if (item.source === 'custom') {
      const contentHash = hashString(item.prompt)
      if (customHashes.has(contentHash)) return false
      customHashes.add(contentHash)
    }

    sourceKeys.add(sourceKey)
    return true
  })

  return [...existing, ...additions]
}
