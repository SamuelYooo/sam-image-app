import { describe, expect, it } from 'vitest';
import {
  collectReferenceSources,
  isImageMime,
  isLikelyImageUrl,
  validateReferenceLimit,
} from '../utils/reference-images';

describe('reference image utilities', () => {
  it('identifies image mime types', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
  });

  it('recognizes common image urls and data urls', () => {
    expect(isLikelyImageUrl('https://example.com/a.png')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/a.jpg?x=1')).toBe(true);
    expect(isLikelyImageUrl('data:image/png;base64,aaa')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/file.txt')).toBe(false);
  });

  it('collects uploaded sources and url draft lines', () => {
    expect(
      collectReferenceSources(
        [{ id: '1', name: 'a.png', source: 'data:image/png;base64,a', kind: 'file', mime: 'image/png' }],
        'https://example.com/a.png\n\nhttps://example.com/b.png',
      ),
    ).toEqual(['data:image/png;base64,a', 'https://example.com/a.png', 'https://example.com/b.png']);
  });

  it('validates reference image limits', () => {
    expect(validateReferenceLimit(2, 4)).toBeNull();
    expect(validateReferenceLimit(5, 4)).toBe('参考图数量 5 张，超过当前模型上限 4 张');
  });
});
