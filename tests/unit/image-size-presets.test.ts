import { describe, expect, it } from 'vitest'
import {
  CUSTOM_IMAGE_SIZE_VALUE,
  SELF_MEDIA_IMAGE_SIZE_OPTIONS,
  createImageSizeSelection,
  normalizeCustomImageSize,
} from '../../src/features/workspace/imageSizePresets'

describe('image size presets', () => {
  it('includes common Chinese self-media cover sizes from docs/data materials', () => {
    expect(SELF_MEDIA_IMAGE_SIZE_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '900x383', label: '微信公众号大封面 900x383' }),
        expect.objectContaining({ value: '200x200', label: '微信公众号小封面 200x200' }),
        expect.objectContaining({ value: '1080x1260', label: '微信视频号竖版 1080x1260' }),
        expect.objectContaining({ value: '1080x608', label: '微信视频号/抖音横版 1080x608' }),
        expect.objectContaining({ value: '1242x1660', label: '小红书/抖音竖版封面 1242x1660' }),
        expect.objectContaining({ value: '1080x1080', label: '小红书方版 1080x1080' }),
        expect.objectContaining({ value: '2560x1440', label: '小红书横版 2560x1440' }),
        expect.objectContaining({ value: '1125x633', label: '抖音个人背景图 1125x633' }),
        expect.objectContaining({ value: '980x300', label: '微博主页封面 980x300' }),
        expect.objectContaining({ value: '980x560', label: '微博头条封面 980x560' }),
        expect.objectContaining({ value: '540x260', label: '微博焦点图片 540x260' }),
        expect.objectContaining({ value: '800x2000', label: '微博长图 800x2000' }),
        expect.objectContaining({ value: '1146x717', label: 'B站视频封面 1146x717' }),
      ]),
    )
  })

  it('normalizes custom image sizes before task creation', () => {
    expect(normalizeCustomImageSize(1200.6, 630.2)).toBe('1201x630')
    expect(normalizeCustomImageSize(0, Number.NaN)).toBe('64x1024')
    expect(normalizeCustomImageSize(99999, 99999)).toBe('4096x4096')
  })

  it('routes unknown draft sizes into custom mode', () => {
    expect(createImageSizeSelection('980x300')).toEqual({
      preset: '980x300',
      customWidth: 1024,
      customHeight: 1024,
    })
    expect(createImageSizeSelection('1234x567')).toEqual({
      preset: CUSTOM_IMAGE_SIZE_VALUE,
      customWidth: 1234,
      customHeight: 567,
    })
  })
})
