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
