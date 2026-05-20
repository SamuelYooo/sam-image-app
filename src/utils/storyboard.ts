export interface StoryboardConfig {
  enabled: boolean;
  count: number;
}

export const STORYBOARD_COUNT_MIN = 1;
export const STORYBOARD_COUNT_MAX = 12;
export const STORYBOARD_DEFAULT_COUNT = 9;

export const defaultStoryboardConfig: StoryboardConfig = {
  enabled: false,
  count: STORYBOARD_DEFAULT_COUNT,
};

export function clampStoryboardCount(value: number): number {
  if (!Number.isFinite(value)) return STORYBOARD_DEFAULT_COUNT;
  const rounded = Math.round(value);
  return Math.max(STORYBOARD_COUNT_MIN, Math.min(STORYBOARD_COUNT_MAX, rounded));
}

export function derivePromptForShot(basePrompt: string, index: number, total: number): string {
  const safeIndex = Math.max(1, Math.min(total, Math.round(index)));
  const safeTotal = Math.max(1, Math.round(total));
  const trimmed = basePrompt.trim();
  const directives = [
    `镜头 ${safeIndex} / ${safeTotal}`,
    '只生成这一个镜头的独立画面，不要拼接故事板或多格漫画',
    '保持电影质感、构图与色调与主图一致',
    '禁止任何手绘、漫画或拼贴风格',
  ];
  if (!trimmed) return directives.join('，');
  return `${trimmed}\n\n[分镜要求] ${directives.join('；')}`;
}

export function buildStoryboardFileName(
  shot: 'master' | 'shot',
  index: number,
  total: number,
  extension: 'png' | 'jpg',
): string {
  if (shot === 'master') {
    return `storyboard-master.${extension}`;
  }
  const width = String(total).length;
  const padded = String(Math.max(1, Math.round(index))).padStart(Math.max(2, width), '0');
  return `storyboard-shot-${padded}.${extension}`;
}

export function buildStoryboardZipName(prompt: string): string {
  const trimmed = prompt.trim().slice(0, 24);
  const safe = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  if (safe) return `storyboard-${safe}-${stamp}.zip`;
  return `storyboard-${stamp}.zip`;
}

// ── Shot Title Generation ───────────────────────────────────────────────────

const FRAMING_LABELS: Record<string, string> = {
  ECU: '极特写',
  CU: '特写',
  MCU: '近景',
  MS: '中景',
  WS: '全景',
  EWS: '大全景',
};

const ANGLE_LABELS: Record<string, string> = {
  low: '仰拍',
  eye: '平视',
  high: '俯拍',
  dutch: '荷兰角',
  OTS: '过肩',
};

const MOVEMENT_LABELS: Record<string, string> = {
  static: '静态',
  push: '推',
  pull: '拉',
  pan: '摇',
  track: '跟踪',
  crane: '升降',
  handheld: '手持',
};

export interface ShotMeta {
  index: number;
  framing: string;
  angle: string;
  focalLength: string;
  movement: string;
  subject: string;
  environment: string;
  lighting: string;
  mood: string;
  style: string;
  isMaster?: boolean;
}

export function buildShotTitle(shot: ShotMeta, projectName?: string): string {
  const safeProjectName = projectName && projectName !== 'undefined' ? projectName : '';
  const prefix = safeProjectName ? `${safeProjectName} · ` : '';
  if (shot.isMaster) {
    return `${prefix}主镜头`;
  }
  const parts: string[] = [];
  if (shot.framing && FRAMING_LABELS[shot.framing]) {
    parts.push(FRAMING_LABELS[shot.framing]);
  }
  if (shot.angle && ANGLE_LABELS[shot.angle]) {
    parts.push(ANGLE_LABELS[shot.angle]);
  }
  if (shot.movement && MOVEMENT_LABELS[shot.movement] && shot.movement !== 'static') {
    parts.push(MOVEMENT_LABELS[shot.movement]);
  }
  if (shot.focalLength) {
    parts.push(shot.focalLength);
  }

  const subject = shot.subject?.trim();
  if (subject) {
    const shortSubject = subject.length > 12 ? subject.slice(0, 12) + '…' : subject;
    parts.push(shortSubject);
  }

  if (parts.length === 0) {
    return `${prefix}镜头 ${shot.index}`;
  }

  return `${prefix}镜头 ${shot.index} · ${parts.join(' · ')}`;
}

export function buildShotSubtitle(shot: ShotMeta): string {
  const parts: string[] = [];
  if (shot.environment?.trim()) {
    parts.push(shot.environment.trim().slice(0, 20));
  }
  if (shot.lighting?.trim()) {
    parts.push(shot.lighting.trim().slice(0, 16));
  }
  if (shot.mood?.trim()) {
    parts.push(shot.mood.trim().slice(0, 10));
  }
  return parts.join(' · ') || '暂无描述';
}

// ── Aggregate Storyboard Poster ─────────────────────────────────────────────

export async function renderStoryboardPoster(
  projectName: string,
  shots: Array<{ imageUrl: string; title: string; subtitle: string }>,
  options: { bgColor?: string; textColor?: string; accentColor?: string; padding?: number; gap?: number; maxWidth?: number } = {},
): Promise<Blob> {
  const {
    bgColor = '#0f172a',
    textColor = '#f8fafc',
    accentColor = '#176bff',
    padding = 40,
    gap = 24,
    maxWidth = 1200,
  } = options;

  const headerHeight = 80;
  const footerHeight = 40;
  const cardTitleHeight = 28;
  const cardSubtitleHeight = 20;
  const cardMetaHeight = cardTitleHeight + cardSubtitleHeight + 8;

  const colCount = Math.min(3, shots.length);
  const rowCount = Math.ceil(shots.length / colCount);

  const availableWidth = maxWidth - padding * 2;
  const cardWidth = Math.floor((availableWidth - gap * (colCount - 1)) / colCount);
  const cardImageHeight = Math.floor(cardWidth * 0.625);
  const cardHeight = cardImageHeight + cardMetaHeight;

  const canvasWidth = maxWidth;
  const canvasHeight = padding + headerHeight + rowCount * (cardHeight + gap) - gap + footerHeight + padding;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Header line
  ctx.fillStyle = accentColor;
  ctx.fillRect(padding, padding + 48, 60, 3);

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(projectName || '电影分镜', padding, padding + 8);

  // Shot count
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${shots.length} 个镜头`, padding, padding + 56);

  // Load and draw images
  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const x = padding + col * (cardWidth + gap);
    const y = padding + headerHeight + row * (cardHeight + gap);

    // Card background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, cardWidth, cardHeight);

    // Image
    try {
      const img = await loadImage(shot.imageUrl);
      const scale = Math.min(cardWidth / img.width, cardImageHeight / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = x + (cardWidth - drawW) / 2;
      const drawY = y + (cardImageHeight - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } catch {
      // Placeholder
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, cardWidth, cardImageHeight);
      ctx.fillStyle = '#475569';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无图片', x + cardWidth / 2, y + cardImageHeight / 2);
      ctx.textAlign = 'left';
    }

    // Title
    ctx.fillStyle = textColor;
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(shot.title, x, y + cardImageHeight + 6);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(shot.subtitle, x, y + cardImageHeight + 6 + 16);
  }

  // Footer
  ctx.fillStyle = '#475569';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`SamImage · 电影分镜工坊 · ${new Date().toLocaleDateString('zh-CN')}`, canvasWidth / 2, canvasHeight - padding - 12);
  ctx.textAlign = 'left';

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}
