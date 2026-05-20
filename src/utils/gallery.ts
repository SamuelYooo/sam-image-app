export type ExportFormat = 'png' | 'jpg';
export const ICON_SIZES = [32, 64, 128, 256, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayKind = 'text' | 'svg' | 'image';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

export type FontFamily = 'sans' | 'serif' | 'mono' | 'display';

export interface BaseOverlay {
  id: string;
  kind: OverlayKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
}

export interface TextOverlay extends BaseOverlay {
  kind: 'text';
  text: string;
  fontFamily: FontFamily;
  fontSize: number;
  color: string;
  background: boolean;
}

export interface SvgOverlay extends BaseOverlay {
  kind: 'svg';
  name: string;
  svgMarkup: string;
  tint: string;
}

export interface ImageOverlay extends BaseOverlay {
  kind: 'image';
  name: string;
  imageUrl: string;
  shape: 'sticker' | 'badge' | 'watermark';
}

export type GalleryOverlay = TextOverlay | SvgOverlay | ImageOverlay;

export function clampCropBox(crop: CropBox, imageWidth: number, imageHeight: number): CropBox {
  const width = Math.max(1, Math.min(Math.round(crop.width), imageWidth));
  const height = Math.max(1, Math.min(Math.round(crop.height), imageHeight));
  const x = Math.max(0, Math.min(Math.round(crop.x), imageWidth - width));
  const y = Math.max(0, Math.min(Math.round(crop.y), imageHeight - height));
  return { x, y, width, height };
}

export function mimeForFormat(format: ExportFormat): 'image/png' | 'image/jpeg' {
  return format === 'jpg' ? 'image/jpeg' : 'image/png';
}

export function extensionForFormat(format: ExportFormat): 'png' | 'jpg' {
  return format === 'jpg' ? 'jpg' : 'png';
}

export function qualityForFormat(format: ExportFormat, quality: number): number | undefined {
  if (format === 'png') return undefined;
  return Math.max(0.1, Math.min(1, quality / 100));
}

export function buildDownloadName(mode: string, format: ExportFormat, createdAt?: string): string {
  const stamp = createdAt
    ? createdAt.replace(/[:.]/g, '-').slice(0, 19)
    : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `SamImage-${mode}-${stamp}.${extensionForFormat(format)}`;
}

export function isIconSize(value: number): value is IconSize {
  return ICON_SIZES.includes(value as IconSize);
}

export function normalizeIconSizes(values: number[]): IconSize[] {
  const sizes = values.filter(isIconSize);
  return Array.from(new Set(sizes)).sort((a, b) => a - b);
}

export function buildIconFileName(baseName: string, size: IconSize): string {
  const cleaned = baseName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned || 'SamImage-icon'}-${size}x${size}.ico`;
}

export function clampOverlayBox<T extends BaseOverlay>(overlay: T): T {
  return {
    ...overlay,
    x: Math.max(0, Math.min(1, overlay.x)),
    y: Math.max(0, Math.min(1, overlay.y)),
    width: Math.max(0.05, Math.min(1, overlay.width)),
    height: Math.max(0.05, Math.min(1, overlay.height)),
    rotation: Math.max(-180, Math.min(180, Math.round(overlay.rotation))),
    opacity: Math.max(0.1, Math.min(1, overlay.opacity ?? 1)),
    blendMode: overlay.blendMode ?? 'normal',
    locked: overlay.locked ?? false,
  };
}

export function normalizeTextOverlay(overlay: TextOverlay): TextOverlay {
  return {
    ...clampOverlayBox(overlay),
    text: overlay.text.trim(),
    fontFamily: overlay.fontFamily,
    fontSize: Math.max(12, Math.min(160, Math.round(overlay.fontSize))),
    color: /^#[0-9a-f]{6}$/i.test(overlay.color) ? overlay.color : '#111827',
  };
}

export function normalizeSvgOverlay(overlay: SvgOverlay): SvgOverlay {
  return {
    ...clampOverlayBox(overlay),
    name: overlay.name.trim() || 'SVG',
    svgMarkup: overlay.svgMarkup.trim(),
    tint: /^#[0-9a-f]{6}$/i.test(overlay.tint) ? overlay.tint : '#111827',
  };
}

export function normalizeImageOverlay(overlay: ImageOverlay): ImageOverlay {
  return {
    ...clampOverlayBox(overlay),
    name: overlay.name.trim() || 'Image',
    imageUrl: overlay.imageUrl.trim(),
    shape: overlay.shape,
  };
}

export function splitOverlayLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sanitizeSvgMarkup(svgMarkup: string): string {
  return svgMarkup
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

export function distributeOverlayCenters(values: number[], start: number, end: number): number[] {
  if (values.length <= 1) return values;
  const step = (end - start) / (values.length - 1);
  return values.map((_, index) => start + step * index);
}

// ── Gallery Filter System ───────────────────────────────────────────────────

export interface GalleryFilterAdjustments {
  brightness: number;   // 默认 100，范围 50-150
  contrast: number;     // 默认 100，范围 50-150
  saturation: number;   // 默认 100，范围 0-200
  temperature: number;  // 默认 0，范围 -100 到 100
  hue: number;          // 默认 0，范围 -180 到 180
  vignette: number;     // 默认 0，范围 0-100
}

export const defaultGalleryFilters: GalleryFilterAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  hue: 0,
  vignette: 0,
};

export interface GalleryFilterPreset {
  name: string;
  filters: GalleryFilterAdjustments;
}

export const galleryFilterPresets: GalleryFilterPreset[] = [
  { name: '原图',      filters: { brightness: 100, contrast: 100, saturation: 100, temperature: 0,  hue: 0,   vignette: 0  } },
  { name: '暖调',      filters: { brightness: 100, contrast: 105, saturation: 115, temperature: 15,  hue: 0,   vignette: 0  } },
  { name: '冷调',      filters: { brightness: 100, contrast: 105, saturation: 100, temperature: -15, hue: 0,   vignette: 0  } },
  { name: '复古',      filters: { brightness: 95,  contrast: 110, saturation: 85,  temperature: 5,   hue: -10, vignette: 20 } },
  { name: '黑白',      filters: { brightness: 100, contrast: 120, saturation: 0,   temperature: 0,   hue: 0,   vignette: 15 } },
  { name: '鲜明',      filters: { brightness: 105, contrast: 115, saturation: 120, temperature: 0,   hue: 0,   vignette: 0  } },
];

export function normalizeGalleryFilters(filters: Partial<GalleryFilterAdjustments>): GalleryFilterAdjustments {
  return {
    brightness: Math.max(50, Math.min(150, filters.brightness ?? 100)),
    contrast:   Math.max(50, Math.min(150, filters.contrast ?? 100)),
    saturation: Math.max(0,   Math.min(200, filters.saturation ?? 100)),
    temperature: Math.max(-100, Math.min(100, filters.temperature ?? 0)),
    hue:        Math.max(-180, Math.min(180, filters.hue ?? 0)),
    vignette:   Math.max(0,   Math.min(100, filters.vignette ?? 0)),
  };
}

export function cssFilterForGalleryFilters(filters: GalleryFilterAdjustments): string {
  const parts: string[] = [];
  if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast !== 100)   parts.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation !== 100) parts.push(`saturate(${filters.saturation}%)`);
  if (filters.temperature !== 0)   parts.push(`sepia(${Math.abs(filters.temperature) / 100})`);
  if (filters.hue !== 0)           parts.push(`hue-rotate(${filters.hue}deg)`);
  if (filters.vignette > 0) {
    const pct = filters.vignette / 100;
    parts.push(`drop-shadow(0 0 ${Math.round(pct * 20)}px rgba(0,0,0,${pct.toFixed(2)}))`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function canvasFilterForGalleryFilters(filters: GalleryFilterAdjustments): string {
  const parts: string[] = [];
  if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness / 100})`);
  if (filters.contrast !== 100)   parts.push(`contrast(${filters.contrast / 100})`);
  if (filters.saturation !== 100) parts.push(`saturate(${filters.saturation / 100})`);
  if (filters.hue !== 0)           parts.push(`hue-rotate(${filters.hue}deg)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function hasActiveGalleryFilters(filters: GalleryFilterAdjustments): boolean {
  return (
    filters.brightness !== 100 ||
    filters.contrast !== 100 ||
    filters.saturation !== 100 ||
    filters.temperature !== 0 ||
    filters.hue !== 0 ||
    filters.vignette > 0
  );
}
