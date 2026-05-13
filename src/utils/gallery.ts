export type ExportFormat = 'png' | 'jpg';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

