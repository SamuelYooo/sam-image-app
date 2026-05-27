export interface ImageSizeOption {
  value: string
  label: string
}

export interface ImageSizeSelection {
  preset: string
  customWidth: number
  customHeight: number
}

export const CUSTOM_IMAGE_SIZE_VALUE = 'custom'

export const STANDARD_IMAGE_SIZE_OPTIONS: ImageSizeOption[] = [
  { value: '1024x1024', label: '方图 1024x1024' },
  { value: '1024x1536', label: '竖图 1024x1536' },
  { value: '1536x1024', label: '横图 1536x1024' },
]

export const SELF_MEDIA_IMAGE_SIZE_OPTIONS: ImageSizeOption[] = [
  { value: '900x383', label: '微信公众号大封面 900x383' },
  { value: '200x200', label: '微信公众号小封面 200x200' },
  { value: '1080x1260', label: '微信视频号竖版 1080x1260' },
  { value: '1080x608', label: '微信视频号/抖音横版 1080x608' },
  { value: '1242x1660', label: '小红书/抖音竖版封面 1242x1660' },
  { value: '1080x1080', label: '小红书方版 1080x1080' },
  { value: '2560x1440', label: '小红书横版 2560x1440' },
  { value: '1125x633', label: '抖音个人背景图 1125x633' },
  { value: '980x300', label: '微博主页封面 980x300' },
  { value: '980x560', label: '微博头条封面 980x560' },
  { value: '540x260', label: '微博焦点图片 540x260' },
  { value: '800x2000', label: '微博长图 800x2000' },
  { value: '1146x717', label: 'B站视频封面 1146x717' },
]

export const IMAGE_SIZE_OPTIONS = [...STANDARD_IMAGE_SIZE_OPTIONS, ...SELF_MEDIA_IMAGE_SIZE_OPTIONS]

export function parseImageSize(value: string | undefined) {
  const match = value?.trim().toLowerCase().match(/^(\d+)\s*[x×]\s*(\d+)$/)
  if (!match) {
    return null
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  }
}

export function normalizeImageDimension(value: unknown) {
  const dimension = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(dimension)) {
    return 1024
  }
  return Math.max(64, Math.min(4096, Math.round(dimension)))
}

export function normalizeCustomImageSize(width: unknown, height: unknown) {
  return `${normalizeImageDimension(width)}x${normalizeImageDimension(height)}`
}

export function isKnownImageSize(value: string) {
  return IMAGE_SIZE_OPTIONS.some((option) => option.value === value)
}

export function createImageSizeSelection(value: string | undefined): ImageSizeSelection {
  const normalized = value?.trim().toLowerCase() || STANDARD_IMAGE_SIZE_OPTIONS[0].value
  if (normalized === CUSTOM_IMAGE_SIZE_VALUE) {
    return {
      preset: CUSTOM_IMAGE_SIZE_VALUE,
      customWidth: 1024,
      customHeight: 1024,
    }
  }
  if (isKnownImageSize(normalized)) {
    return {
      preset: normalized,
      customWidth: 1024,
      customHeight: 1024,
    }
  }

  const parsed = parseImageSize(normalized)
  if (parsed) {
    return {
      preset: CUSTOM_IMAGE_SIZE_VALUE,
      customWidth: normalizeImageDimension(parsed.width),
      customHeight: normalizeImageDimension(parsed.height),
    }
  }

  return {
    preset: STANDARD_IMAGE_SIZE_OPTIONS[0].value,
    customWidth: 1024,
    customHeight: 1024,
  }
}
