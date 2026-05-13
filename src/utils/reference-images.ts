export interface ReferenceImageItem {
  id: string;
  name: string;
  source: string;
  kind: 'url' | 'file' | 'paste';
  mime: string;
}

export function isImageMime(type: string): boolean {
  return type.toLowerCase().startsWith('image/');
}

export function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^data:image\//i.test(trimmed) ||
    /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i.test(trimmed)
  );
}

export function collectReferenceSources(items: ReferenceImageItem[], urlDraft: string): string[] {
  const urls = urlDraft
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...items.map((item) => item.source), ...urls];
}

export function validateReferenceLimit(count: number, limit: number): string | null {
  if (count <= limit) return null;
  return `参考图数量 ${count} 张，超过当前模型上限 ${limit} 张`;
}

