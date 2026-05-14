import { describe, expect, it } from 'vitest';
import {
  buildDownloadName,
  buildIconFileName,
  clampOverlayBox,
  clampCropBox,
  extensionForFormat,
  ICON_SIZES,
  mimeForFormat,
  normalizeIconSizes,
  normalizeImageOverlay,
  normalizeSvgOverlay,
  normalizeTextOverlay,
  qualityForFormat,
  sanitizeSvgMarkup,
  splitOverlayLines,
  distributeOverlayCenters,
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

  it('normalizes icon sizes and builds safe icon names', () => {
    expect(ICON_SIZES).toEqual([32, 64, 128, 256, 512]);
    expect(normalizeIconSizes([512, 16, 64, 64, 32])).toEqual([32, 64, 512]);
    expect(buildIconFileName(' My App:天气/Icon ', 128)).toBe('My-App-天气-Icon-128x128.ico');
    expect(buildIconFileName(' ', 32)).toBe('SamImage-icon-32x32.ico');
  });

  it('normalizes draggable text overlays', () => {
    expect(
      normalizeTextOverlay({
        id: 'title',
        kind: 'text',
        text: '  sample title  ',
        fontFamily: 'sans',
        fontSize: 260,
        color: 'red',
        background: true,
        x: 2,
        y: -1,
        width: 0.4,
        height: 0.2,
        rotation: 300,
        opacity: 1,
        blendMode: 'normal',
        locked: false,
      }),
    ).toMatchObject({
      text: 'sample title',
      fontSize: 160,
      color: '#111827',
      x: 1,
      y: 0,
      rotation: 180,
    });

    expect(splitOverlayLines('title\n\nsubtitle  ')).toEqual(['title', 'subtitle']);
  });

  it('clamps overlay boxes and sanitizes svg layers', () => {
    expect(
      clampOverlayBox({
        id: 'overlay',
        kind: 'svg' as const,
        x: -0.4,
        y: 1.4,
        width: 0.01,
        height: 2,
        rotation: -260,
        opacity: 1,
        blendMode: 'normal',
        locked: false,
      }),
    ).toMatchObject({
      x: 0,
      y: 1,
      width: 0.05,
      height: 1,
      rotation: -180,
    });

    expect(
      normalizeSvgOverlay({
        id: 'icon',
        kind: 'svg',
        x: 0.2,
        y: 0.3,
        width: 0.15,
        height: 0.15,
        rotation: 0,
        name: '  badge ',
        svgMarkup: '<svg onclick="alert(1)"><script>evil()</script><path /></svg>',
        tint: 'bad',
        opacity: 1,
        blendMode: 'normal',
        locked: false,
      }),
    ).toMatchObject({
      name: 'badge',
      tint: '#111827',
    });

    expect(sanitizeSvgMarkup('<svg onload="x"><script>bad()</script><path /></svg>')).toBe(
      '<svg><path /></svg>',
    );
  });

  it('normalizes image overlays and distributes selected layers', () => {
    expect(
      normalizeImageOverlay({
        id: 'image',
        kind: 'image',
        x: 0.3,
        y: 0.4,
        width: 0.2,
        height: 0.2,
        rotation: 0,
        name: '  sticker ',
        imageUrl: ' data:image/png;base64,abc ',
        opacity: 2,
        shape: 'sticker',
        blendMode: 'normal',
        locked: false,
      }),
    ).toMatchObject({
      name: 'sticker',
      imageUrl: 'data:image/png;base64,abc',
      opacity: 1,
    });

    expect(distributeOverlayCenters([0.2, 0.5, 0.9], 0.2, 0.8)).toEqual([0.2, 0.5, 0.8]);
  });
});
