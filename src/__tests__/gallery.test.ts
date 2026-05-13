import { describe, expect, it } from 'vitest';
import {
  buildDownloadName,
  clampCropBox,
  extensionForFormat,
  mimeForFormat,
  qualityForFormat,
} from '../utils/gallery';

describe('gallery utilities', () => {
  it('clamps crop boxes to image bounds', () => {
    expect(clampCropBox({ x: -10, y: 90, width: 150, height: 30 }, 100, 100)).toEqual({
      x: 0,
      y: 70,
      width: 100,
      height: 30,
    });
  });

  it('maps export formats to mime and extension', () => {
    expect(mimeForFormat('png')).toBe('image/png');
    expect(mimeForFormat('jpg')).toBe('image/jpeg');
    expect(extensionForFormat('png')).toBe('png');
    expect(extensionForFormat('jpg')).toBe('jpg');
  });

  it('uses bounded quality for jpg and no quality for png', () => {
    expect(qualityForFormat('png', 20)).toBeUndefined();
    expect(qualityForFormat('jpg', 5)).toBe(0.1);
    expect(qualityForFormat('jpg', 85)).toBe(0.85);
    expect(qualityForFormat('jpg', 140)).toBe(1);
  });

  it('builds stable download names', () => {
    expect(buildDownloadName('txt2img', 'jpg', '2026-05-13T02:20:30.000Z')).toBe(
      'SamImage-txt2img-2026-05-13T02-20-30.jpg',
    );
  });
});
