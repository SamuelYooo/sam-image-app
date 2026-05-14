<script setup lang="ts">
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Github,
  Import,
  ImagePlus,
  Images,
  Link2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Type,
  Trash2,
  Wand2,
} from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import packageJson from '../package.json';
import { api } from './api/client';
import type {
  AdapterInfo,
  Artifact,
  GenerationRequest,
  IconfontSearchItem,
  ModelListResult,
  ModelProfile,
  ModelValidationResult,
  PromptTemplate,
  WorkMode,
} from './types';
import {
  buildDownloadName,
  buildIconFileName,
  clampOverlayBox,
  clampCropBox,
  distributeOverlayCenters,
  ICON_SIZES,
  type CropBox,
  type ExportFormat,
  type FontFamily,
  type GalleryOverlay,
  type IconSize,
  type ImageOverlay,
  normalizeIconSizes,
  normalizeTextOverlay,
  normalizeImageOverlay,
  normalizeSvgOverlay,
  mimeForFormat,
  qualityForFormat,
  sanitizeSvgMarkup,
  splitOverlayLines,
  type SvgOverlay,
  type TextOverlay,
} from './utils/gallery';
import { applyMainModel } from './utils/model-selection';
import { defaultProfile, mergeModelList, profileSummary, validateProfileDraft } from './utils/profile';
import {
  collectReferenceSources,
  isImageMime,
  isLikelyImageUrl,
  type ReferenceImageItem,
  validateReferenceLimit,
} from './utils/reference-images';

type PageKey = 'generate' | 'icons' | 'models' | 'gallery';

const appVersion = packageJson.version;
const page = ref<PageKey>('generate');
const adapters = ref<AdapterInfo[]>([]);
const profiles = ref<ModelProfile[]>([]);
const artifacts = ref<Artifact[]>([]);
const promptTemplates = ref<PromptTemplate[]>([]);
const activeProfileId = ref('');
const draft = reactive<ModelProfile>(defaultProfile());
const prompt = ref('清晨的玻璃温室里，一台银色机器人正在修剪发光植物，电影感构图，高细节');
const negativePrompt = ref('低清晰度，畸形，文字水印');
const size = ref('1024x1024');
const mode = ref<WorkMode>('txt2img');
const seed = ref<number | undefined>(undefined);
const iconPrompt = ref('一个现代天气 App 图标，圆角方形图标，蓝色渐变背景，白色云朵和金色阳光，简洁、清晰、适合小尺寸');
const iconNegativePrompt = ref('文字，水印，复杂背景，过多细节，模糊，低清晰度');
const iconName = ref('weather-app');
const iconStyle = ref('modern');
const iconPrimaryColor = ref('#176bff');
const iconBackground = ref<'transparent' | 'solid' | 'keep'>('keep');
const selectedIconSizes = ref<number[]>([32, 64, 128, 256, 512]);
const iconSourceArtifactId = ref('');
const iconNotice = ref('');
const isIconGenerating = ref(false);
const isIconExporting = ref(false);
const referenceImageUrlDraft = ref('');
const referenceImageItems = ref<ReferenceImageItem[]>([]);
const referenceNotice = ref('');
const networkCheck = ref(false);
const apiKeyVisible = ref(false);
const modelSearch = ref('');
const manualModelName = ref('');
const galleryProfileFilter = ref('all');
const galleryModeFilter = ref<'all' | WorkMode>('all');
const selectedArtifactId = ref('');
const isGalleryListCollapsed = ref(true);
const isLightboxOpen = ref(false);
const exportFormat = ref<ExportFormat>('png');
const exportQuality = ref(86);
const cropEnabled = ref(false);
const cropBox = reactive<CropBox>({ x: 0, y: 0, width: 768, height: 768 });
const galleryPreviewAspectRatio = ref('4 / 3');
const textOverlayEnabled = ref(false);
const textOverlaySafeTemplateMode = ref(true);
const galleryOverlays = ref<GalleryOverlay[]>([
  {
    id: 'title',
    kind: 'text',
    text: '主标题',
    fontFamily: 'sans',
    fontSize: 44,
    color: '#111827',
    background: true,
    x: 0.5,
    y: 0.14,
    width: 0.6,
    height: 0.16,
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
  },
  {
    id: 'subtitle',
    kind: 'text',
    text: '副标题或导语',
    fontFamily: 'sans',
    fontSize: 24,
    color: '#111827',
    background: true,
    x: 0.5,
    y: 0.86,
    width: 0.62,
    height: 0.12,
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
  },
]);
const selectedOverlayId = ref('title');
const selectedOverlayIds = ref<string[]>(['title']);
const iconfontUrlDraft = ref('');
const iconfontKeyword = ref('');
const iconfontResults = ref<IconfontSearchItem[]>([]);
const iconfontSvgDraft = ref('');
const dragOverlayState = ref<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
const isSaving = ref(false);
const isValidating = ref(false);
const isFetchingModels = ref(false);
const isGenerating = ref(false);
const isLoading = ref(true);
const isDownloading = ref(false);
const apiOnline = ref(false);
const validationResult = ref<ModelValidationResult | null>(null);
const modelListResult = ref<ModelListResult | null>(null);
const notice = ref('');
const galleryNotice = ref('');
const isHelpOpen = ref(false);
const isTemplatePickerOpen = ref(false);
const isTemplateManagerOpen = ref(false);
const isIconfontSearchOpen = ref(false);
const isModelSwitcherOpen = ref(false);
const isModelConfigOpen = ref(false);
const isSearchingIconfont = ref(false);
const renamingProfileId = ref<string | null>(null);
const renamingProfileName = ref('');
const referenceUploadIcon = Paperclip;
const templateDraft = reactive<PromptTemplate>({
  id: '',
  title: '',
  prompt: '',
  category: '通用',
  isBuiltin: false,
});
const templateNotice = ref('');

const modeOptions: Array<{ id: WorkMode; label: string; desc: string }> = [
  { id: 'txt2img', label: '文生图', desc: '从提示词创建新图' },
  { id: 'img2img', label: '图生图', desc: '使用参考图编辑' },
  { id: 'reverse', label: '反推', desc: '图片理解与提示词' },
  { id: 'blend', label: '融合', desc: '多图参考混合' },
];
const fontFamilyOptions: Array<{ id: FontFamily; label: string; css: string }> = [
  { id: 'sans', label: '无衬线', css: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { id: 'serif', label: '衬线', css: '"Noto Serif SC", "Songti SC", serif' },
  { id: 'mono', label: '等宽', css: '"Cascadia Mono", "Consolas", monospace' },
  { id: 'display', label: '展示', css: '"STXihei", "Microsoft YaHei", sans-serif' },
];

const draftErrors = computed(() => validateProfileDraft(draft));
const activeProfile = computed(() => profiles.value.find((item) => item.id === activeProfileId.value));
const selectedProfile = computed(() => activeProfile.value ?? draft);
const activeSummary = computed(() => profileSummary(selectedProfile.value));
const currentAdapter = computed(() => adapters.value.find((item) => item.id === draft.adapter));
const isImageModelAdapter = computed(() => {
  const adapter = currentAdapter.value;
  return adapter ? (adapter.supportsTextToImage || adapter.supportsImageToImage) : false;
});
const endpointPreview = computed(() => {
  const base = draft.baseUrl.trim().replace(/\/$/, '');
  const endpoint = draft.chatEndpoint.startsWith('/') ? draft.chatEndpoint : `/${draft.chatEndpoint}`;
  return base ? `${base}${endpoint}` : '';
});
const filteredModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase();
  const models = mergeModelList(draft.availableModels, draft.model ? [draft.model] : []);
  if (!query) return models;
  return models.filter((item) => item.toLowerCase().includes(query));
});
const groupedModels = computed(() => {
  const groups = new Map<string, string[]>();
  for (const model of filteredModels.value) {
    const groupName = inferModelGroup(model);
    groups.set(groupName, [...(groups.get(groupName) ?? []), model]);
  }
  return Array.from(groups.entries()).map(([name, models]) => ({ name, models }));
});
const galleryArtifacts = computed(() => {
  return artifacts.value.filter((artifact) => {
    if (artifact.source === 'icon') return false;
    const profileMatches = galleryProfileFilter.value === 'all' || artifact.profileId === galleryProfileFilter.value;
    const modeMatches = galleryModeFilter.value === 'all' || artifact.mode === galleryModeFilter.value;
    return profileMatches && modeMatches;
  });
});
const selectedArtifact = computed(() => {
  const visible = galleryArtifacts.value;
  return visible.find((item) => item.id === selectedArtifactId.value) ?? visible[0] ?? null;
});
const iconSourceArtifact = computed(() => {
  return artifacts.value.find((item) => item.id === iconSourceArtifactId.value) ?? null;
});
const normalizedSelectedIconSizes = computed(() => normalizeIconSizes(selectedIconSizes.value));
const iconStyleLabel = computed(() => {
  const labels: Record<string, string> = {
    modern: '现代 App',
    flat: '扁平矢量',
    threeD: '3D 质感',
    line: '线性极简',
    glass: '毛玻璃',
  };
  return labels[iconStyle.value] ?? '现代 App';
});
const selectedProfileName = computed(() => {
  if (!selectedArtifact.value) return '未选择作品';
  return profiles.value.find((item) => item.id === selectedArtifact.value?.profileId)?.name ?? '未知配置';
});
const selectedOverlay = computed(() => galleryOverlays.value.find((overlay) => overlay.id === selectedOverlayId.value) ?? null);
const selectedOverlays = computed(() => galleryOverlays.value.filter((overlay) => selectedOverlayIds.value.includes(overlay.id)));
const referenceSourceCount = computed(
  () => collectReferenceSources(referenceImageItems.value, referenceImageUrlDraft.value).length,
);
const selectedOverlayKindLabel = computed(() => {
  if (!selectedOverlay.value) return '';
  if (selectedOverlay.value.kind === 'text') return '文字';
  if (selectedOverlay.value.kind === 'svg') return 'SVG';
  return '图片';
});

watch(selectedArtifactId, () => {
  galleryPreviewAspectRatio.value = '4 / 3';
});

function modeLabel(value: WorkMode): string {
  return modeOptions.find((item) => item.id === value)?.label ?? value;
}

function openGallery(artifactId?: string) {
  if (artifactId) selectedArtifactId.value = artifactId;
  else if (!selectedArtifactId.value && artifacts.value[0]) selectedArtifactId.value = artifacts.value[0].id;
  isGalleryListCollapsed.value = true;
  page.value = 'gallery';
}

function openLightbox() {
  if (selectedArtifact.value) isLightboxOpen.value = true;
}

function inferModelGroup(model: string): string {
  if (model.includes('/')) return model.split('/')[0] || '自定义';
  if (model.startsWith('gpt')) return 'OpenAI';
  if (model.startsWith('gemini')) return 'Gemini';
  if (model.startsWith('stable') || model.startsWith('sd')) return 'Stability';
  if (model.startsWith('comfyui')) return 'ComfyUI';
  return '自定义模型';
}

function assignDraft(profile: ModelProfile) {
  Object.assign(draft, JSON.parse(JSON.stringify(profile)) as ModelProfile);
  if (!draft.availableModels) draft.availableModels = [];
}

function resetTemplateDraft() {
  Object.assign(templateDraft, {
    id: '',
    title: '',
    prompt: '',
    category: '通用',
    isBuiltin: false,
    createdAt: undefined,
    updatedAt: undefined,
  } satisfies PromptTemplate);
  templateNotice.value = '';
}

function openTemplateManager(template?: PromptTemplate) {
  if (template) editTemplate(template);
  else resetTemplateDraft();
  isTemplatePickerOpen.value = false;
  isTemplateManagerOpen.value = true;
}

function openIconfontSearch() {
  isIconfontSearchOpen.value = true;
  if (!iconfontKeyword.value.trim()) {
    iconfontKeyword.value =
      selectedOverlay.value?.kind === 'svg' ? selectedOverlay.value.name : 'search';
  }
}

function editTemplate(template: PromptTemplate) {
  Object.assign(templateDraft, JSON.parse(JSON.stringify(template)) as PromptTemplate);
  templateNotice.value = '';
}

function applyPromptTemplate(template: PromptTemplate) {
  if (!template.prompt.trim()) {
    templateNotice.value = '提示词内容为空，无法应用';
    return;
  }
  const textSafeHint = '请只生成版式、图片、留白和文字占位区域，不要直接生成可读中文，不要伪文字或乱码文字；真实中文会在后期用本地文字图层添加。';
  prompt.value = textOverlaySafeTemplateMode.value ? `${template.prompt}\n\n${textSafeHint}` : template.prompt;
  notice.value = `已应用提示词模板：${template.title}`;
  isTemplatePickerOpen.value = false;
}

function addTextOverlay() {
  textOverlayEnabled.value = true;
  const id = crypto.randomUUID();
  galleryOverlays.value = [
    ...galleryOverlays.value,
    {
      id,
      kind: 'text',
      text: '新文字',
      fontFamily: 'sans',
      fontSize: 28,
      color: '#111827',
      background: true,
      x: 0.5,
      y: 0.5,
      width: 0.34,
      height: 0.12,
      rotation: 0,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
    },
  ];
  setSelectedOverlay(id);
}

function addSvgOverlay(svgMarkup: string, name = 'SVG') {
  textOverlayEnabled.value = true;
  const id = crypto.randomUUID();
  galleryOverlays.value = [
    ...galleryOverlays.value,
    {
      id,
      kind: 'svg',
      name,
      svgMarkup: sanitizeSvgMarkup(svgMarkup),
      tint: '#111827',
      x: 0.5,
      y: 0.5,
      width: 0.18,
      height: 0.18,
      rotation: 0,
      opacity: 1,
      blendMode: 'normal',
      locked: false,
    },
  ];
  setSelectedOverlay(id);
}

function addImageOverlay(imageUrl: string, name: string, shape: ImageOverlay['shape']) {
  textOverlayEnabled.value = true;
  const id = crypto.randomUUID();
  galleryOverlays.value = [
    ...galleryOverlays.value,
    {
      id,
      kind: 'image',
      name,
      imageUrl,
      shape,
      x: 0.5,
      y: 0.5,
      width: shape === 'watermark' ? 0.34 : 0.18,
      height: shape === 'watermark' ? 0.16 : 0.18,
      rotation: 0,
      opacity: shape === 'watermark' ? 0.55 : 1,
      blendMode: 'normal',
      locked: false,
    },
  ];
  setSelectedOverlay(id);
}

function duplicateOverlay(overlayId: string) {
  const overlay = galleryOverlays.value.find((o) => o.id === overlayId);
  if (!overlay) return;

  const id = crypto.randomUUID();
  const duplicated = {
    ...overlay,
    id,
    x: Math.min(1, overlay.x + 0.05),
    y: Math.min(1, overlay.y + 0.05),
  };

  galleryOverlays.value = [...galleryOverlays.value, duplicated];
  setSelectedOverlay(id);
}

function removeOverlay(id: string) {
  galleryOverlays.value = galleryOverlays.value.filter((overlay) => overlay.id !== id);
  selectedOverlayIds.value = selectedOverlayIds.value.filter((item) => item !== id);
  if (selectedOverlayId.value === id) selectedOverlayId.value = galleryOverlays.value[0]?.id ?? '';
}

function setSelectedOverlay(id: string, additive = false) {
  selectedOverlayId.value = id;
  selectedOverlayIds.value = additive ? Array.from(new Set([...selectedOverlayIds.value, id])) : [id];
}

function updateOverlay(id: string, patch: Partial<GalleryOverlay>) {
  const index = galleryOverlays.value.findIndex((overlay) => overlay.id === id);
  if (index < 0) return;
  const current = galleryOverlays.value[index];
  const next = clampOverlayBox({ ...current, ...patch } as GalleryOverlay);
  galleryOverlays.value.splice(index, 1, next);
}

function moveOverlayLayer(id: string, direction: 'forward' | 'backward') {
  const index = galleryOverlays.value.findIndex((overlay) => overlay.id === id);
  if (index < 0) return;
  const target = direction === 'forward' ? Math.min(galleryOverlays.value.length - 1, index + 1) : Math.max(0, index - 1);
  if (target === index) return;
  const [overlay] = galleryOverlays.value.splice(index, 1);
  galleryOverlays.value.splice(target, 0, overlay);
}

function alignSelectedOverlays(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical') {
  const overlays = selectedOverlays.value;
  if (overlays.length === 0) return;
  if (mode === 'horizontal') {
    const sorted = [...overlays].sort((a, b) => a.x - b.x);
    const values = distributeOverlayCenters(
      sorted.map((overlay) => overlay.x),
      Math.min(...sorted.map((overlay) => overlay.x)),
      Math.max(...sorted.map((overlay) => overlay.x)),
    );
    sorted.forEach((overlay, index) =>
      updateOverlay(overlay.id, { x: values[index] } as Partial<GalleryOverlay>),
    );
    return;
  }
  if (mode === 'vertical') {
    const sorted = [...overlays].sort((a, b) => a.y - b.y);
    const values = distributeOverlayCenters(
      sorted.map((overlay) => overlay.y),
      Math.min(...sorted.map((overlay) => overlay.y)),
      Math.max(...sorted.map((overlay) => overlay.y)),
    );
    sorted.forEach((overlay, index) =>
      updateOverlay(overlay.id, { y: values[index] } as Partial<GalleryOverlay>),
    );
    return;
  }

  const left = Math.min(...overlays.map((overlay) => overlay.x - overlay.width / 2));
  const right = Math.max(...overlays.map((overlay) => overlay.x + overlay.width / 2));
  const top = Math.min(...overlays.map((overlay) => overlay.y - overlay.height / 2));
  const bottom = Math.max(...overlays.map((overlay) => overlay.y + overlay.height / 2));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  overlays.forEach((overlay) => {
    if (mode === 'left') updateOverlay(overlay.id, { x: left + overlay.width / 2 } as Partial<GalleryOverlay>);
    if (mode === 'center') updateOverlay(overlay.id, { x: centerX } as Partial<GalleryOverlay>);
    if (mode === 'right') updateOverlay(overlay.id, { x: right - overlay.width / 2 } as Partial<GalleryOverlay>);
    if (mode === 'top') updateOverlay(overlay.id, { y: top + overlay.height / 2 } as Partial<GalleryOverlay>);
    if (mode === 'middle') updateOverlay(overlay.id, { y: centerY } as Partial<GalleryOverlay>);
    if (mode === 'bottom') updateOverlay(overlay.id, { y: bottom - overlay.height / 2 } as Partial<GalleryOverlay>);
  });
}

function overlayStyle(overlay: GalleryOverlay) {
  const common = {
    left: `${overlay.x * 100}%`,
    top: `${overlay.y * 100}%`,
    width: `${overlay.width * 100}%`,
    height: `${overlay.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg)`,
    opacity: overlay.opacity ?? 1,
    mixBlendMode: overlay.blendMode ?? 'normal',
  };
  if (overlay.kind === 'text') {
    const font = fontFamilyOptions.find((item) => item.id === overlay.fontFamily)?.css ?? fontFamilyOptions[0].css;
    return {
      ...common,
      color: overlay.color,
      fontSize: `${overlay.fontSize}px`,
      fontFamily: font,
      background: overlay.background ? 'rgba(255,255,255,0.82)' : 'transparent',
    };
  }
  return common;
}

function startOverlayDrag(event: PointerEvent, overlay: GalleryOverlay) {
  if (overlay.locked) return;
  const target = event.currentTarget as HTMLElement | null;
  target?.setPointerCapture?.(event.pointerId);
  setSelectedOverlay(overlay.id, event.shiftKey);
  dragOverlayState.value = {
    id: overlay.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: overlay.x,
    originY: overlay.y,
  };
}

function dragOverlay(event: PointerEvent) {
  if (!dragOverlayState.value) return;
  const host = document.getElementById('gallery-overlay-stage');
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const dx = (event.clientX - dragOverlayState.value.startX) / rect.width;
  const dy = (event.clientY - dragOverlayState.value.startY) / rect.height;
  updateOverlay(dragOverlayState.value.id, {
    x: dragOverlayState.value.originX + dx,
    y: dragOverlayState.value.originY + dy,
  } as Partial<GalleryOverlay>);
}

function endOverlayDrag() {
  dragOverlayState.value = null;
}

function syncGalleryPreviewAspectRatio(event: Event) {
  const image = event.target as HTMLImageElement | null;
  const width = image?.naturalWidth ?? 0;
  const height = image?.naturalHeight ?? 0;
  if (width > 0 && height > 0) {
    galleryPreviewAspectRatio.value = `${width} / ${height}`;
    const dimensionsEl = document.getElementById('gallery-image-dimensions');
    if (dimensionsEl) {
      dimensionsEl.textContent = `${width} × ${height}`;
    }
  }
}

async function handleSvgUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const svgMarkup = await file.text();
    addSvgOverlay(svgMarkup, file.name.replace(/\.svg$/i, ''));
    galleryNotice.value = 'SVG 图层已添加';
  } catch (error) {
    galleryNotice.value = error instanceof Error ? error.message : '读取 SVG 失败';
  } finally {
    input.value = '';
  }
}

async function handleImageOverlayUpload(event: Event, shape: ImageOverlay['shape']) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const imageUrl = await fileToDataUrl(file);
    addImageOverlay(imageUrl, file.name.replace(/\.[^.]+$/, ''), shape);
    galleryNotice.value = '图片图层已添加';
  } catch (error) {
    galleryNotice.value = error instanceof Error ? error.message : '读取图片图层失败';
  } finally {
    input.value = '';
  }
}

async function importIconfontSvg() {
  const url = iconfontUrlDraft.value.trim();
  if (!url) {
    galleryNotice.value = '请先输入 SVG 链接';
    return;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`请求失败: ${response.status}`);
    addSvgOverlay(await response.text(), 'SVG 图标');
    iconfontUrlDraft.value = '';
    galleryNotice.value = 'SVG 图标已添加';
  } catch (error) {
    galleryNotice.value = error instanceof Error ? error.message : '导入 SVG 图标失败';
  }
}

async function searchIconfontIcons() {
  const query = iconfontKeyword.value.trim();
  if (!query) {
    galleryNotice.value = '请输入中文或英文关键词';
    return;
  }
  isSearchingIconfont.value = true;
  try {
    iconfontResults.value = await api.searchIconfont(query);
    if (iconfontResults.value.length === 0) {
      galleryNotice.value = '未找到可用图标，请直接粘贴 SVG 链接或 SVG 源码导入';
    }
  } catch (error) {
    galleryNotice.value = error instanceof Error ? error.message : '搜索图标失败';
  } finally {
    isSearchingIconfont.value = false;
  }
}

function useIconfontResult(item: IconfontSearchItem) {
  iconfontUrlDraft.value = item.svgUrl ?? item.originUrl;
  if (item.previewSvg) {
    addSvgOverlay(item.previewSvg, item.name);
    isIconfontSearchOpen.value = false;
    galleryNotice.value = `已导入图标：${item.name}`;
    return;
  }
  galleryNotice.value = `已填入 ${item.name}，可继续粘贴 SVG 链接或 SVG 源码后导入`;
}

function importSvgMarkupDraft() {
  const markup = iconfontSvgDraft.value.trim();
  if (!markup) {
    galleryNotice.value = '请先粘贴 SVG 源码';
    return;
  }
  addSvgOverlay(markup, iconfontKeyword.value.trim() || 'SVG 图标');
  iconfontSvgDraft.value = '';
  isIconfontSearchOpen.value = false;
  galleryNotice.value = 'SVG 源码已导入到本地图层';
}

async function saveTemplate() {
  if (!templateDraft.title.trim()) {
    templateNotice.value = '模板名称不能为空';
    return;
  }
  if (!templateDraft.prompt.trim()) {
    templateNotice.value = '提示词内容不能为空';
    return;
  }
  templateNotice.value = '';
  try {
    const saved = await api.savePromptTemplate({
      ...templateDraft,
      title: templateDraft.title.trim(),
      prompt: templateDraft.prompt.trim(),
      category: templateDraft.category.trim() || '通用',
    });
    const index = promptTemplates.value.findIndex((item) => item.id === saved.id);
    if (index >= 0) promptTemplates.value.splice(index, 1, saved);
    else promptTemplates.value.unshift(saved);
    editTemplate(saved);
    templateNotice.value = '模板已保存';
  } catch (error) {
    templateNotice.value = error instanceof Error ? error.message : '保存模板失败';
  }
}

async function deleteTemplate(template: PromptTemplate) {
  try {
    await api.deletePromptTemplate(template.id);
    promptTemplates.value = promptTemplates.value.filter((item) => item.id !== template.id);
    if (templateDraft.id === template.id) resetTemplateDraft();
    templateNotice.value = '模板已删除';
  } catch (error) {
    templateNotice.value = error instanceof Error ? error.message : '删除模板失败';
  }
}

async function loadAll() {
  isLoading.value = true;
  notice.value = '';
  try {
    const [health, adapterList, profileList, artifactList, templateList] = await Promise.all([
      api.health(),
      api.adapters(),
      api.profiles(),
      api.artifacts(),
      api.promptTemplates(),
    ]);
    apiOnline.value = health.ok;
    adapters.value = adapterList;
    profiles.value = profileList;
    artifacts.value = artifactList;
    promptTemplates.value = templateList;
    if (profileList.length > 0) {
      activeProfileId.value = profileList[0].id;
      assignDraft(profileList[0]);
    }
  } catch (error) {
    apiOnline.value = false;
    notice.value = error instanceof Error ? error.message : '本地 API 未连接';
  } finally {
    isLoading.value = false;
  }
}

function newProfile() {
  const next = defaultProfile();
  next.name = `模型配置 ${profiles.value.length + 1}`;
  activeProfileId.value = '';
  validationResult.value = null;
  modelListResult.value = null;
  assignDraft(next);
  isModelSwitcherOpen.value = false;
  isModelConfigOpen.value = false;
  page.value = 'models';
}

function selectProfile(id: string) {
  const profile = profiles.value.find((item) => item.id === id);
  if (!profile) return;
  activeProfileId.value = id;
  validationResult.value = null;
  modelListResult.value = null;
  assignDraft(profile);
}

function selectProfileFromHeader(id: string) {
  if (renamingProfileId.value) return; // Don't select if renaming
  selectProfile(id);
  isModelSwitcherOpen.value = false;
}

function startRenameProfile(profile: ModelProfile, event?: Event) {
  event?.stopPropagation();
  renamingProfileId.value = profile.id;
  renamingProfileName.value = profile.name;
  nextTick(() => {
    const input = document.querySelector('.model-switcher-item input[type="text"]') as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function finishRenameProfile() {
  if (!renamingProfileId.value) return;
  const newName = renamingProfileName.value.trim();
  if (!newName) {
    renamingProfileId.value = null;
    return;
  }

  const profile = profiles.value.find((p) => p.id === renamingProfileId.value);
  if (!profile || profile.name === newName) {
    renamingProfileId.value = null;
    return;
  }

  try {
    const updated = { ...profile, name: newName };
    const saved = await api.saveProfile(updated);
    const index = profiles.value.findIndex((item) => item.id === saved.id);
    if (index >= 0) profiles.value.splice(index, 1, saved);
    if (activeProfileId.value === saved.id) assignDraft(saved);
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '重命名失败';
  } finally {
    renamingProfileId.value = null;
  }
}

function cancelRenameProfile() {
  renamingProfileId.value = null;
}

function openModelConfigDialog() {
  isModelSwitcherOpen.value = false;
  isModelConfigOpen.value = true;
}

function openModelConfigPage() {
  isModelSwitcherOpen.value = false;
  isModelConfigOpen.value = false;
  page.value = 'models';
}

async function saveProfile() {
  if (draftErrors.value.length > 0) return;
  if (!isImageModelAdapter.value) {
    notice.value = '当前适配器不支持图像生成，无法保存';
    return;
  }
  isSaving.value = true;
  notice.value = '';
  try {
    draft.availableModels = mergeModelList(draft.availableModels, draft.model ? [draft.model] : []);
    const saved = await api.saveProfile({ ...draft });
    const index = profiles.value.findIndex((item) => item.id === saved.id);
    if (index >= 0) profiles.value.splice(index, 1, saved);
    else profiles.value.unshift(saved);
    activeProfileId.value = saved.id;
    assignDraft(saved);
    notice.value = '模型配置已保存';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '保存配置失败';
  } finally {
    isSaving.value = false;
  }
}

async function removeProfile() {
  if (!activeProfileId.value) return;
  const removing = activeProfileId.value;
  try {
    await api.deleteProfile(removing);
    profiles.value = profiles.value.filter((item) => item.id !== removing);
    if (profiles.value[0]) selectProfile(profiles.value[0].id);
    else newProfile();
    notice.value = '模型配置已删除';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '删除配置失败';
  }
}

async function validateModel() {
  validationResult.value = null;
  if (draftErrors.value.length > 0) return;
  isValidating.value = true;
  notice.value = '';
  try {
    validationResult.value = await api.validateModel({
      profile: { ...draft },
      networkCheck: networkCheck.value,
    });
  } catch (error) {
    validationResult.value = {
      ok: false,
      adapter: draft.adapter,
      message: error instanceof Error ? error.message : '模型验证失败',
      latencyMs: 0,
    };
  } finally {
    isValidating.value = false;
  }
}

async function fetchModelList() {
  modelListResult.value = null;
  if (draftErrors.value.length > 0) return;
  isFetchingModels.value = true;
  notice.value = '';
  try {
    const result = await api.fetchModels({ profile: { ...draft } });
    draft.availableModels = mergeModelList(draft.availableModels, result.models);
    if (!draft.model && draft.availableModels[0]) draft.model = draft.availableModels[0];
    modelListResult.value = result;
  } catch (error) {
    modelListResult.value = {
      models: [],
      source: 'preset',
      message: error instanceof Error ? error.message : '获取模型列表失败',
    };
  } finally {
    isFetchingModels.value = false;
  }
}

function addManualModel() {
  const model = manualModelName.value.trim();
  if (!model) return;
  draft.availableModels = mergeModelList(draft.availableModels, [model]);
  draft.model = model;
  manualModelName.value = '';
}

function setMainModel(model: string) {
  const updated = applyMainModel({ ...draft }, model);
  assignDraft(updated);
  const index = profiles.value.findIndex((item) => item.id === draft.id);
  if (index >= 0) profiles.value.splice(index, 1, { ...profiles.value[index], model: draft.model, availableModels: [...draft.availableModels] });
    notice.value = `主模型已切换为 ${draft.model}`;
}

function removeModel(model: string) {
  draft.availableModels = draft.availableModels.filter((item) => item !== model);
  if (draft.model === model) {
    draft.model = draft.availableModels[0] ?? '';
  }
}

async function generateImage() {
  if (!activeProfileId.value) {
    notice.value = '请先在模型配置页保存并激活一个模型';
    page.value = 'models';
    return;
  }
  if (!prompt.value.trim()) {
    notice.value = '提示词不能为空';
    return;
  }
  const referenceSources = collectReferenceSources(referenceImageItems.value, referenceImageUrlDraft.value);
  const limitError = validateReferenceLimit(referenceSources.length, selectedProfile.value.referenceImageLimit);
  if (limitError) {
    notice.value = limitError;
    return;
  }
  if ((mode.value === 'img2img' || mode.value === 'blend') && referenceSources.length === 0) {
    notice.value = `${modeLabel(mode.value)} 至少需要 1 张参考图`;
    return;
  }
  isGenerating.value = true;
  notice.value = '';
  try {
    const payload: GenerationRequest = {
      profileId: activeProfileId.value,
      mode: mode.value,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
      size: size.value,
      seed: seed.value,
      referenceImages: referenceSources,
      source: 'generate',
    };
    const artifact = await api.generate(payload);
    artifacts.value.unshift(artifact);
    selectedArtifactId.value = artifact.id;
    notice.value = '生成任务已完成并入库';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '生成失败';
  } finally {
    isGenerating.value = false;
  }
}

async function handleReferenceFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  await addReferenceFiles(Array.from(input.files ?? []), 'file');
  input.value = '';
}

async function handleReferencePaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  const files = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (files.length > 0) {
    event.preventDefault();
    await addReferenceFiles(files, 'paste');
    return;
  }

  const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
  if (text) {
    if (isLikelyImageUrl(text)) {
      referenceImageUrlDraft.value = [referenceImageUrlDraft.value, text].filter(Boolean).join('\n');
      referenceNotice.value = '已识别剪贴板图片链接';
    } else {
      referenceNotice.value = '剪贴板内容不是图片文件或常见图片链接';
    }
  }
}

function buildIconPrompt(): string {
  const backgroundHint =
    iconBackground.value === 'transparent'
      ? '透明背景，主体边缘干净'
      : iconBackground.value === 'solid'
        ? `纯色或简洁渐变背景，主色为 ${iconPrimaryColor.value}`
        : `背景和主体协调，主色为 ${iconPrimaryColor.value}`;
  return [
    iconPrompt.value.trim(),
    `${iconStyleLabel.value} 风格，高识别度，居中构图，正方形图标，适合 32x32 到 512x512 多尺寸使用。`,
    backgroundHint,
    '避免文字、数字、水印和复杂细碎元素，小尺寸下仍然清晰。',
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateIconImage() {
  if (!activeProfileId.value) {
    iconNotice.value = '请先在模型配置页保存并激活一个模型';
    page.value = 'models';
    return;
  }
  if (!iconPrompt.value.trim()) {
    iconNotice.value = '请先填写图标描述';
    return;
  }
  isIconGenerating.value = true;
  iconNotice.value = '';
  try {
    const artifact = await api.generate({
      profileId: activeProfileId.value,
      mode: 'txt2img',
      prompt: buildIconPrompt(),
      negativePrompt: iconNegativePrompt.value,
      size: '1024x1024',
      seed: seed.value,
      referenceImages: [],
      source: 'icon',
    });
    artifacts.value.unshift(artifact);
    iconSourceArtifactId.value = artifact.id;
    iconNotice.value = 'ICON 母图已生成，可预览并导出多尺寸 ICO';
  } catch (error) {
    iconNotice.value = error instanceof Error ? error.message : '生成 ICON 失败';
  } finally {
    isIconGenerating.value = false;
  }
}

function toggleIconSize(size: IconSize) {
  selectedIconSizes.value = selectedIconSizes.value.includes(size)
    ? selectedIconSizes.value.filter((item) => item !== size)
    : [...selectedIconSizes.value, size];
}

async function exportIconSizes() {
  const artifact = iconSourceArtifact.value;
  const sizes = normalizedSelectedIconSizes.value;
  if (!artifact) {
    iconNotice.value = '请先生成一张 ICON 母图';
    return;
  }
  if (sizes.length === 0) {
    iconNotice.value = '请至少选择一个导出尺寸';
    return;
  }
  isIconExporting.value = true;
  iconNotice.value = '';
  try {
    const files = await Promise.all(
      sizes.map(async (size) => {
        const blob = await renderSquareIconBlob(artifact.imageUrl, size);
        return [
          buildIconFileName(iconName.value, size),
          Array.from(new Uint8Array(await blob.arrayBuffer())),
        ] as [string, number[]];
      }),
    );
    const result = await invoke<{ dir: string | null; paths: string[] }>('save_images_to_directory', {
      files,
    });
    iconNotice.value = result.dir
      ? `已导出 ${result.paths.length} 个 ICON 文件到 ${result.dir}`
      : '已取消导出';
  } catch (error) {
    iconNotice.value = error instanceof Error ? error.message : '导出 ICON 失败';
  } finally {
    isIconExporting.value = false;
  }
}

async function renderSquareIconBlob(imageUrl: string, targetSize: IconSize): Promise<Blob> {
  const image = await loadImage(imageUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.round((sourceWidth - cropSize) / 2);
  const sourceY = Math.round((sourceHeight - cropSize) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图标导出画布');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (iconBackground.value === 'solid') {
    ctx.fillStyle = iconPrimaryColor.value;
    ctx.fillRect(0, 0, targetSize, targetSize);
  }
  ctx.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, targetSize, targetSize);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图标导出失败');
  return blob;
}

void referenceUploadIcon;
void handleReferenceFileInput;
void handleReferencePaste;
void selectedOverlayKindLabel;
void alignSelectedOverlays;
void handleSvgUpload;
void openModelConfigDialog;

async function addReferenceFiles(files: File[], kind: 'file' | 'paste') {
  if (files.length === 0) return;
  const imageFiles = files.filter((file) => isImageMime(file.type));
  const rejected = files.filter((file) => !isImageMime(file.type));

  if (rejected.length > 0) {
      referenceNotice.value = `已忽略 ${rejected.length} 个非图片文件：${rejected.map((file) => file.name || file.type || '未知文件').join('、')}`;
  }
  if (imageFiles.length === 0) return;

  const converted = await Promise.all(
    imageFiles.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name || (kind === 'paste' ? '剪贴板图片' : '本地图片'),
      source: await fileToDataUrl(file),
      kind,
      mime: file.type || 'image/*',
    })),
  );
  referenceImageItems.value = [...referenceImageItems.value, ...converted];
  const limitError = validateReferenceLimit(
    collectReferenceSources(referenceImageItems.value, referenceImageUrlDraft.value).length,
    selectedProfile.value.referenceImageLimit,
  );
  referenceNotice.value = limitError ?? `已添加 ${converted.length} 张参考图`;
}

function removeReferenceImage(id: string) {
  referenceImageItems.value = referenceImageItems.value.filter((item) => item.id !== id);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.readAsDataURL(file);
  });
}

async function downloadSelectedArtifact() {
  const artifact = selectedArtifact.value;
  if (!artifact) {
    galleryNotice.value = '请先选择一张作品';
    return;
  }
  if (isDownloading.value) return;
  isDownloading.value = true;
  galleryNotice.value = '';
  try {
    const blob = await renderArtifactBlob(artifact.imageUrl);
    const fileName = buildDownloadName(artifact.mode, exportFormat.value, artifact.createdAt);
    const result = await invoke<{ path: string | null }>('save_image_with_dialog', {
      fileName,
      extension: exportFormat.value,
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    galleryNotice.value = result.path ? `图片已保存至 ${result.path}` : '已取消下载';
  } catch (error) {
    galleryNotice.value = error instanceof Error ? error.message : '导出图片失败';
  } finally {
    isDownloading.value = false;
  }
}

async function deleteArtifact(artifactId: string, location: 'collection' | 'gallery') {
  try {
    await api.deleteArtifact(artifactId);
    artifacts.value = artifacts.value.filter((artifact) => artifact.id !== artifactId);
    if (selectedArtifactId.value === artifactId) {
      selectedArtifactId.value = galleryArtifacts.value[0]?.id ?? artifacts.value[0]?.id ?? '';
    }
    const message = '作品已删除';
    if (location === 'gallery') galleryNotice.value = message;
    else notice.value = message;
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除作品失败';
    if (location === 'gallery') galleryNotice.value = message;
    else notice.value = message;
  }
}

async function renderArtifactBlob(imageUrl: string): Promise<Blob> {
  const image = await loadImage(imageUrl);
  const crop = cropEnabled.value
    ? clampCropBox(cropBox, image.naturalWidth || image.width, image.naturalHeight || image.height)
    : { x: 0, y: 0, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图片处理画布');
  if (exportFormat.value === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  if (textOverlayEnabled.value) {
    await drawGalleryOverlays(ctx, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeForFormat(exportFormat.value), qualityForFormat(exportFormat.value, exportQuality.value));
  });
  if (!blob) throw new Error('图片压缩失败');
  return blob;
}

async function drawGalleryOverlays(ctx: CanvasRenderingContext2D, width: number, height: number) {
  for (const overlay of galleryOverlays.value) {
    if (overlay.kind === 'text') {
      drawTextOverlayBox(ctx, normalizeTextOverlay(overlay), width, height);
      continue;
    }
    if (overlay.kind === 'svg') {
      await drawSvgOverlayBox(ctx, normalizeSvgOverlay(overlay), width, height);
      continue;
    }
    await drawImageOverlayBox(ctx, normalizeImageOverlay(overlay), width, height);
  }
}

function drawTextOverlayBox(ctx: CanvasRenderingContext2D, overlay: TextOverlay, width: number, height: number) {
  const lines = splitOverlayLines(overlay.text);
  if (lines.length === 0) return;

  const boxWidth = overlay.width * width;
  const boxHeight = overlay.height * height;
  const centerX = overlay.x * width;
  const centerY = overlay.y * height;
  const font = fontFamilyOptions.find((item) => item.id === overlay.fontFamily)?.css ?? fontFamilyOptions[0].css;
  const lineHeight = Math.round(overlay.fontSize * 1.25);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((overlay.rotation * Math.PI) / 180);

  if (overlay.background) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
  }

  ctx.fillStyle = overlay.color;
  ctx.font = `700 ${overlay.fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startY = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, startY + index * lineHeight, boxWidth * 0.9);
  });
  ctx.restore();
}

async function drawSvgOverlayBox(ctx: CanvasRenderingContext2D, overlay: SvgOverlay, width: number, height: number) {
  if (!overlay.svgMarkup) return;
  const markup = sanitizeSvgMarkup(overlay.svgMarkup).replace(/currentColor/g, overlay.tint);
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const image = await loadImage(uri);
  const drawWidth = overlay.width * width;
  const drawHeight = overlay.height * height;
  const centerX = overlay.x * width;
  const centerY = overlay.y * height;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((overlay.rotation * Math.PI) / 180);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

async function drawImageOverlayBox(ctx: CanvasRenderingContext2D, overlay: ImageOverlay, width: number, height: number) {
  if (!overlay.imageUrl) return;
  const image = await loadImage(overlay.imageUrl);
  const drawWidth = overlay.width * width;
  const drawHeight = overlay.height * height;
  const centerX = overlay.x * width;
  const centerY = overlay.y * height;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((overlay.rotation * Math.PI) / 180);
  ctx.globalAlpha = overlay.opacity;
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  if (overlay.shape === 'badge') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, drawWidth * 0.02);
    ctx.strokeRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  }
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，远程图片可能不允许跨域导出'));
    image.src = src;
  });
}

onMounted(loadAll);
</script>

<template>
  <main class="h-screen w-screen overflow-hidden text-[var(--ink)]">
    <header class="fixed left-0 right-0 top-0 z-30 flex h-16 items-center border-b border-black/5 bg-white/75 px-6 backdrop-blur-2xl">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#176bff] text-white shadow-lg shadow-blue-500/25">
          <Sparkles :size="18" />
        </div>
        <div>
          <div class="text-[15px] font-semibold leading-5">SamImage</div>
          <div class="text-xs text-[var(--muted)]">AI 图片流程工作台</div>
        </div>
      </div>

      <nav class="ml-8 flex items-center gap-2 rounded-full border border-black/5 bg-white/60 p-1 text-xs">
        <button
          class="rounded-full px-4 py-2 transition"
          :class="page === 'generate' ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
          @click="page = 'generate'"
        >
          SamTo图
        </button>
        <button
          class="rounded-full px-4 py-2 transition"
          :class="page === 'icons' ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
          @click="page = 'icons'"
        >
          SamToICON
        </button>
        <button
          class="rounded-full px-4 py-2 transition"
          :class="page === 'gallery' ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
          @click="openGallery()"
        >
          我的作品集
        </button>
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <div class="relative">
          <button class="model-switcher-trigger" @click="isModelSwitcherOpen = !isModelSwitcherOpen">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#176bff]/10 text-[#176bff]">
              <Star :size="15" />
            </div>
            <div class="hidden min-w-0 text-left md:block">
              <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                主模型
                <span v-if="activeProfile" class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <div class="max-w-[300px] truncate text-sm font-bold text-slate-900" :title="activeSummary">
                {{ activeProfile ? activeSummary : '选择模型配置' }}
              </div>
            </div>
            <ChevronDown :size="15" class="shrink-0 transition" :class="isModelSwitcherOpen ? 'rotate-180' : ''" />
          </button>

          <section v-if="isModelSwitcherOpen" class="model-switcher-popover">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-sm font-bold text-slate-900">模型配置</h2>
                <p class="mt-0.5 truncate text-[11px] text-[var(--muted)]">{{ profiles.length }} 个配置 · 当前 {{ activeProfile?.name || '未选择' }}</p>
              </div>
              <div class="flex items-center gap-1">
                <button class="icon-btn h-8 w-8" title="新建配置" @click="newProfile">
                  <Plus :size="14" />
                </button>
                <button class="icon-btn h-8 w-8" title="管理配置" @click="openModelConfigPage">
                  <SlidersHorizontal :size="14" />
                </button>
              </div>
            </div>

            <div v-if="profiles.length > 0" class="model-switcher-list">
              <button
                v-for="profile in profiles"
                :key="profile.id"
                class="model-switcher-item"
                :class="profile.id === activeProfileId ? 'is-active' : ''"
                @click="renamingProfileId ? null : selectProfileFromHeader(profile.id)"
                @dblclick.prevent="startRenameProfile(profile, $event)"
              >
                <div class="min-w-0 flex-1">
                  <div v-if="renamingProfileId === profile.id" class="flex items-center gap-1" @click.stop>
                    <input
                      v-model="renamingProfileName"
                      type="text"
                      class="min-w-0 flex-1 rounded border border-[#176bff] bg-white px-2 py-1 text-xs font-bold outline-none"
                      @keydown.enter="finishRenameProfile"
                      @keydown.esc="cancelRenameProfile"
                      @blur="finishRenameProfile"
                    />
                  </div>
                  <div v-else class="truncate text-sm font-bold text-slate-900">{{ profile.name }}</div>
                  <div class="mt-1 line-clamp-2 break-all text-[11px] leading-4 text-[var(--muted)]">{{ profileSummary(profile) }}</div>
                </div>
                <Star v-if="profile.id === activeProfileId" :size="14" class="shrink-0 text-[#176bff]" />
              </button>
            </div>

            <div v-else class="rounded-xl border border-dashed border-black/10 bg-slate-50 px-4 py-6 text-center text-xs text-[var(--muted)]">
              还没有模型配置。点击下方按钮新建。
            </div>

            <div v-if="profiles.length > 0" class="mt-3">
              <button class="primary-btn h-9 w-full text-xs" @click="openModelConfigPage">
                <SlidersHorizontal :size="13" />
                管理所有配置
              </button>
            </div>
            <div v-else class="mt-3">
              <button class="primary-btn h-9 w-full text-xs" @click="newProfile">
                <Plus :size="13" />
                新建模型配置
              </button>
            </div>
          </section>
        </div>
        <div
          class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
          :class="apiOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'"
        >
          <span class="h-2 w-2 rounded-full" :class="apiOnline ? 'bg-emerald-500' : 'bg-red-500'"></span>
          {{ apiOnline ? '本地 API 在线' : '本地 API 离线' }}
        </div>
        <button class="toolbar-btn" @click="loadAll">
          <RefreshCw :size="14" />
          刷新
        </button>
        <button class="toolbar-btn" @click="isHelpOpen = true">
          <ShieldCheck :size="14" />
          帮助
        </button>
      </div>
    </header>

    <section v-if="page === 'generate'" class="grid h-full grid-cols-[1fr_360px] gap-4 px-5 pb-5 pt-20">
      <section class="relative overflow-hidden rounded-[22px] border border-white/80 bg-[#f7f9fb]/70 shadow-[0_18px_70px_rgba(42,54,68,0.14)]">
        <div class="absolute inset-0 canvas-grid"></div>
        <svg class="absolute inset-0 h-full w-full">
          <path d="M 200 188 C 370 188, 330 310, 494 310" class="connection-path" />
          <path d="M 680 310 C 780 310, 738 188, 872 188" class="connection-path ready" />
        </svg>

        <div class="absolute left-6 top-5 z-10 rounded-2xl bg-white/75 px-4 py-3 backdrop-blur-xl">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <Wand2 :size="17" />
            生图画布
          </div>
          <p class="mt-1 text-xs text-[var(--muted)]">主界面只保留创作流程；模型、密钥和服务地址统一在模型配置页管理。</p>
        </div>

        <div class="absolute right-6 top-5 z-20">
          <div class="relative">
            <button class="prompt-template-trigger" @click="isTemplatePickerOpen = !isTemplatePickerOpen">
              <Sparkles :size="15" />
              提示词
              <ChevronDown :size="14" :class="isTemplatePickerOpen ? 'rotate-180' : ''" class="transition" />
            </button>

            <section v-if="isTemplatePickerOpen" class="prompt-template-popover">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-sm font-bold text-slate-900">预设提示词</h2>
                  <p class="mt-0.5 text-[11px] text-[var(--muted)]">{{ promptTemplates.length }} 个模板</p>
                </div>
                <button class="icon-btn h-8 w-8" title="模板配置" @click="openTemplateManager()">
                  <SlidersHorizontal :size="14" />
                </button>
              </div>
              <label class="mb-3 flex items-start gap-2 rounded-xl border border-black/5 bg-white/70 p-2.5 text-xs leading-5 text-[var(--muted)]">
                <input v-model="textOverlaySafeTemplateMode" type="checkbox" class="mt-0.5 h-3.5 w-3.5 accent-[#176bff]" />
                应用模板时追加“中文文字后期添加”的提示，减少模型直接生成中文时出现乱码。
              </label>

              <div v-if="promptTemplates.length === 0" class="rounded-xl border border-dashed border-black/10 bg-white/70 px-3 py-3 text-center text-xs text-[var(--muted)]">
                暂无提示词模板
              </div>
              <div v-else class="thin-scrollbar grid max-h-[340px] gap-2 overflow-auto pr-1">
                <button
                  v-for="template in promptTemplates"
                  :key="template.id"
                  class="template-list-btn"
                  :title="template.prompt"
                  @click="applyPromptTemplate(template)"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="truncate font-bold">{{ template.title }}</span>
                    <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-[var(--muted)]">
                      {{ template.isBuiltin ? '内置' : template.category }}
                    </span>
                  </span>
                  <span class="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted)]">{{ template.prompt }}</span>
                </button>
              </div>
            </section>
          </div>
        </div>

        <div class="absolute left-10 top-[138px] z-10 w-[300px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between">
            <div class="creative-tools-grid">
              <span class="h-3 w-3 rounded-full bg-[#176bff]"></span>
               <span class="text-sm font-semibold">主模型</span>
             </div>
             <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">已激活</span>
          </div>
          <p class="line-clamp-3 break-all text-xs leading-5 text-[var(--muted)]">{{ activeSummary }}</p>
          <button class="mt-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50" @click="page = 'models'">
             切换或配置模型
          </button>
        </div>

        <div class="absolute left-[380px] top-[250px] z-10 w-[330px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between">
            <div class="creative-tools-grid">
              <span class="h-3 w-3 rounded-full bg-[#0f9f8f]"></span>
              <span class="text-sm font-semibold">{{ modeLabel(mode) }}</span>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">任务</span>
          </div>
          <p class="line-clamp-4 text-xs leading-5 text-[var(--muted)]">{{ prompt || '等待输入提示词' }}</p>
        </div>

        <div class="absolute right-14 top-[138px] z-10 w-[300px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between">
            <div class="creative-tools-grid">
              <span class="h-3 w-3 rounded-full bg-[#c77911]"></span>
              <span class="text-sm font-semibold">作品入库</span>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">{{ artifacts.length }} 张</span>
          </div>
          <p class="text-xs leading-5 text-[var(--muted)]">生成结果会保存到本地 SQLite，右侧作品集会即时展示。</p>
        </div>

        <div class="absolute bottom-5 left-5 right-5 z-20 grid grid-cols-[1.2fr_0.8fr] gap-4">
          <section class="glass-panel rounded-2xl p-4">
            <div class="mb-3 flex items-start justify-between gap-4">
              <div class="min-w-0">
                <h1 class="text-sm font-semibold">生成参数</h1>
                <p class="mt-1 truncate text-xs text-[var(--muted)]">{{ activeProfile ? `使用 ${activeProfile.name}` : '尚未保存模型配置' }}</p>
              </div>
              <button class="primary-btn min-w-[118px] px-4" :disabled="isGenerating" @click="generateImage">
                <Loader2 v-if="isGenerating" :size="16" class="animate-spin" />
                <Play v-else :size="16" />
                开始生成
              </button>
            </div>

            <div class="mb-3 grid grid-cols-4 gap-2 rounded-2xl border border-black/5 bg-white/65 p-1.5 text-xs">
              <button
                v-for="item in modeOptions"
                :key="item.id"
                class="min-h-10 rounded-xl px-3 text-left transition"
                :class="mode === item.id ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
                @click="mode = item.id"
              >
                <span class="block text-[13px] font-semibold leading-4">{{ item.label }}</span>
                <span class="mt-0.5 block truncate text-[11px] opacity-75">{{ item.desc }}</span>
              </button>
            </div>

            <textarea
              v-model="prompt"
              class="h-24 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#176bff]"
              placeholder="描述你想生成的画面"
            ></textarea>

            <div class="mt-3 grid grid-cols-[1fr_150px_120px] gap-3">
              <input v-model="negativePrompt" class="field-input" placeholder="负向提示词" />
              <select v-model="size" class="field-input">
                <option>1024x1024</option>
                <option>1024x1536</option>
                <option>1536x1024</option>
                <option>768x768</option>
              </select>
              <input v-model.number="seed" class="field-input" type="number" placeholder="随机种子" />
            </div>
          </section>

          <section class="glass-panel rounded-2xl p-4">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold">参考图</h2>
                <p class="mt-1 text-xs text-[var(--muted)]">
                  支持上传本地图片、复制粘贴图片，或保留图片 URL。
                </p>
              </div>
              <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                {{ referenceSourceCount }}/{{ selectedProfile.referenceImageLimit }}
              </span>
            </div>

            <label
              class="flex h-[92px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 bg-white/70 text-center transition hover:border-[#176bff]/50 hover:bg-white"
              @paste="handleReferencePaste"
            >
              <Paperclip :size="20" class="mb-2 text-[#176bff]" />
              <span class="text-xs font-semibold">点击上传，或在这里粘贴图片</span>
              <span class="mt-1 text-[11px] text-[var(--muted)]">粘贴非图片文件时会给出提示</span>
              <input type="file" accept="image/*" multiple class="hidden" @change="handleReferenceFileInput" />
            </label>

            <textarea
              v-model="referenceImageUrlDraft"
              class="mt-3 h-16 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#176bff]"
              placeholder="也可以每行粘贴一个图片 URL"
              @paste="handleReferencePaste"
            ></textarea>

            <div v-if="referenceNotice" class="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-xs leading-5 text-sky-800">
              {{ referenceNotice }}
            </div>

            <div v-if="referenceImageItems.length" class="mt-3 grid grid-cols-3 gap-2">
              <div v-for="item in referenceImageItems" :key="item.id" class="group relative overflow-hidden rounded-xl border border-black/5 bg-white">
                <img :src="item.source" :alt="item.name" class="aspect-square w-full object-cover" />
                <button
                  class="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1 text-slate-600 opacity-0 shadow-sm transition group-hover:opacity-100"
                  title="移除参考图"
                  @click="removeReferenceImage(item.id)"
                >
                  <Trash2 :size="13" />
                </button>
                <div class="px-2 py-1.5">
                  <div class="truncate text-[11px] font-semibold" :title="item.name">{{ item.name }}</div>
                  <div class="text-[10px] text-[var(--muted)]">{{ item.kind === 'paste' ? '粘贴' : '上传' }}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">作品集</h2>
            <p class="mt-1 text-xs text-[var(--muted)]">{{ artifacts.length }} 张作品</p>
          </div>
          <button class="icon-btn" title="收起作品列表" @click="isGalleryListCollapsed = true">
            <PanelLeftClose :size="16" />
          </button>
        </div>

        <div v-if="notice" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          {{ notice }}
        </div>

        <div v-if="isLoading" class="rounded-xl border border-black/5 bg-white/60 p-5 text-center text-sm text-[var(--muted)]">
          正在连接本地服务...
        </div>

        <div v-else-if="artifacts.length === 0" class="rounded-2xl border border-dashed border-black/15 bg-white/50 p-8 text-center">
          <Sparkles :size="24" class="mx-auto mb-3 text-[var(--muted)]" />
          <div class="text-sm font-medium">还没有作品</div>
          <p class="mt-2 text-xs leading-5 text-[var(--muted)]">配置主模型后，点击“开始生成”就会创建第一张预览作品。</p>
        </div>

        <div v-else class="grid gap-3">
          <article
            v-for="artifact in artifacts"
            :key="artifact.id"
            class="overflow-hidden rounded-2xl border border-black/5 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <img :src="artifact.imageUrl" :alt="artifact.prompt" class="gallery-list-thumb" />
            <div class="p-3">
              <div class="mb-1 flex items-center gap-1.5">
                <span class="gallery-mode-tag" :class="`tag-${artifact.mode}`">{{ modeLabel(artifact.mode) }}</span>
                <span v-if="artifact.source === 'icon'" class="gallery-mode-tag" style="background:#f5f0ff;color:#7c3aed;">ICON</span>
                <span class="ml-auto text-[10px] text-slate-400">{{ artifact.createdAt.slice(5, 16).replace('T', ' ') }}</span>
              </div>
              <p class="line-clamp-2 text-xs leading-5 text-slate-700">{{ artifact.prompt }}</p>
              <div class="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold hover:bg-slate-200" @click="openGallery(artifact.id)">
                  查看作品
                </button>
                <button
                  class="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                  title="删除作品"
                  @click.stop="deleteArtifact(artifact.id, 'collection')"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </aside>
    </section>

    <section v-else-if="page === 'icons'" class="grid h-full grid-cols-[340px_1fr_340px] gap-5 px-6 pb-6 pt-20">
      <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
        <div class="mb-4">
          <h1 class="text-base font-semibold">SamToICON</h1>
          <p class="mt-1 text-xs leading-5 text-[var(--muted)]">先生成一张高清母图，再自动导出 32 到 512 的多尺寸 ICO。</p>
        </div>

        <div v-if="iconNotice" class="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">
          {{ iconNotice }}
        </div>

        <div class="grid gap-4">
          <label>
            <span class="field-label">图标名称</span>
            <input v-model="iconName" class="field-input" placeholder="weather-app" />
          </label>

          <label>
            <span class="field-label">图标描述</span>
            <textarea
              v-model="iconPrompt"
              class="h-32 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#176bff]"
              placeholder="描述图标主体、用途、颜色和风格"
            ></textarea>
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label>
              <span class="field-label">风格</span>
              <select v-model="iconStyle" class="field-input">
                <option value="modern">现代 App</option>
                <option value="flat">扁平矢量</option>
                <option value="threeD">3D 质感</option>
                <option value="line">线性极简</option>
                <option value="glass">毛玻璃</option>
              </select>
            </label>
            <label>
              <span class="field-label">主色</span>
              <input v-model="iconPrimaryColor" class="field-input h-[42px] p-1" type="color" />
            </label>
          </div>

          <label>
            <span class="field-label">背景</span>
            <select v-model="iconBackground" class="field-input">
              <option value="keep">跟随生成结果</option>
              <option value="transparent">提示透明背景</option>
              <option value="solid">导出时铺主色底</option>
            </select>
          </label>

          <label>
            <span class="field-label">负向提示词</span>
            <input v-model="iconNegativePrompt" class="field-input" />
          </label>

          <button class="primary-btn" :disabled="isIconGenerating" @click="generateIconImage">
            <Loader2 v-if="isIconGenerating" :size="16" class="animate-spin" />
            <Images v-else :size="16" />
            {{ isIconGenerating ? '正在生成' : '生成 ICON 母图' }}
          </button>
        </div>
      </aside>

      <section class="glass-panel flex min-h-0 flex-col rounded-[18px] p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold">图标预览</h2>
            <p class="mt-1 text-xs text-[var(--muted)]">母图用于缩放导出，下面的小尺寸预览用于检查识别度。</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[var(--muted)]">ICO</span>
        </div>

        <div class="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-black/5 bg-[#eef2f5] p-6">
          <img
            v-if="iconSourceArtifact"
            :src="iconSourceArtifact.imageUrl"
            :alt="iconSourceArtifact.prompt"
            class="aspect-square max-h-full max-w-full rounded-[22px] object-cover shadow-xl shadow-slate-900/15"
          />
          <div v-else class="text-center text-sm text-[var(--muted)]">
            <Images :size="28" class="mx-auto mb-3" />
            生成后会在这里显示 ICON 母图
          </div>
        </div>

        <div class="mt-4 grid grid-cols-5 gap-3">
          <div v-for="item in ICON_SIZES" :key="item" class="rounded-xl border border-black/5 bg-white/70 p-3 text-center">
            <div class="mx-auto flex aspect-square items-center justify-center rounded-lg bg-slate-100" :style="{ width: `${Math.min(item, 72)}px` }">
              <img
                v-if="iconSourceArtifact"
                :src="iconSourceArtifact.imageUrl"
                :alt="`${item} icon preview`"
                class="h-full w-full rounded-md object-cover"
              />
            </div>
            <div class="mt-2 text-xs font-semibold">{{ item }}x{{ item }}</div>
          </div>
        </div>
      </section>

      <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
        <div class="mb-4">
          <h2 class="text-base font-semibold">导出尺寸</h2>
          <p class="mt-1 text-xs leading-5 text-[var(--muted)]">勾选需要的尺寸，一次选择文件夹后批量导出。</p>
        </div>

        <div class="grid gap-2">
          <button
            v-for="item in ICON_SIZES"
            :key="item"
            class="flex items-center justify-between rounded-xl border px-3 py-3 text-left transition"
            :class="normalizedSelectedIconSizes.includes(item) ? 'border-[#176bff]/35 bg-[#176bff]/8' : 'border-black/5 bg-white/65 hover:bg-white'"
            @click="toggleIconSize(item)"
          >
            <span class="font-semibold">{{ item }}x{{ item }}</span>
            <span class="text-xs text-[var(--muted)]">{{ normalizedSelectedIconSizes.includes(item) ? '已选择' : '未选择' }}</span>
          </button>
        </div>

        <button class="primary-btn mt-4" :disabled="isIconExporting || !iconSourceArtifact" @click="exportIconSizes">
          <Loader2 v-if="isIconExporting" :size="16" class="animate-spin" />
          <Download v-else :size="16" />
          {{ isIconExporting ? '正在导出' : '导出选中尺寸' }}
        </button>

        <div class="mt-4 rounded-xl border border-black/5 bg-white/65 p-3 text-xs leading-5 text-[var(--muted)]">
          当前会从母图中心裁切成正方形，再缩放为多尺寸 ICO。小尺寸建议使用简洁主体、少细节、强轮廓。
        </div>
      </aside>
    </section>

    <section v-else-if="page === 'gallery'" class="h-full overflow-hidden px-6 pb-6 pt-20">
      <div class="grid h-full gap-5" :class="isGalleryListCollapsed ? 'grid-cols-[1fr_360px]' : 'grid-cols-[280px_1fr_360px]'">
        <aside v-if="!isGalleryListCollapsed" class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 class="text-base font-semibold">作品列表</h1>
              <p class="mt-1 text-xs text-[var(--muted)]">选择作品、预览画布并完成导出。</p>
            </div>
            <button class="icon-btn" title="收起作品列表" @click="isGalleryListCollapsed = true">
              <PanelLeftClose :size="16" />
            </button>
          </div>

          <div class="gallery-list-toolbar">
            <label>
              <span class="field-label">作品集</span>
              <select v-model="galleryProfileFilter" class="field-input">
                <option value="all">全部作品集</option>
                <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
              </select>
            </label>
            <label>
              <span class="field-label">生成模式</span>
              <select v-model="galleryModeFilter" class="field-input">
                <option value="all">全部模式</option>
                <option v-for="item in modeOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
              </select>
            </label>
          </div>

          <div v-if="galleryArtifacts.length === 0" class="rounded-2xl border border-dashed border-black/15 bg-white/50 p-8 text-center text-sm text-[var(--muted)]">
            当前筛选下还没有作品。
          </div>

          <div v-else class="grid gap-2">
            <button
              v-for="artifact in galleryArtifacts"
              :key="artifact.id"
              class="gallery-list-item"
              :class="selectedArtifact?.id === artifact.id ? 'is-active' : ''"
              @click="selectedArtifactId = artifact.id"
            >
              <img :src="artifact.imageUrl" :alt="artifact.prompt" class="gallery-list-thumb" />
              <div class="flex min-w-0 flex-col justify-between py-1">
                <p class="line-clamp-2 text-xs leading-5 text-slate-700">{{ artifact.prompt }}</p>
                <div class="mt-auto flex items-center gap-1.5 pt-1">
                  <span class="gallery-mode-tag" :class="`tag-${artifact.mode}`">{{ modeLabel(artifact.mode) }}</span>
                  <span class="text-[10px] text-slate-400">{{ artifact.createdAt.slice(5, 16).replace('T', ' ') }}</span>
                </div>
              </div>
            </button>
          </div>
        </aside>

        <section class="glass-panel flex min-h-0 flex-col rounded-[18px] p-4">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex items-center gap-2">
                <button v-if="isGalleryListCollapsed" class="icon-btn" title="展开作品列表" @click="isGalleryListCollapsed = false">
                  <PanelLeftOpen :size="16" />
                </button>
                <h2 class="truncate text-lg font-bold">作品预览</h2>
              </div>
              <p class="mt-1 truncate text-xs text-[var(--muted)]">{{ selectedProfileName }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button class="icon-btn" :title="textOverlayEnabled ? '关闭再编辑' : '开启再编辑'" @click="textOverlayEnabled = !textOverlayEnabled">
                <Wand2 :size="16" />
              </button>
              <button
                class="gallery-danger-btn"
                :disabled="!selectedArtifact"
                title="删除作品"
                @click="selectedArtifact && deleteArtifact(selectedArtifact.id, 'gallery')"
              >
                <Trash2 :size="16" />
              </button>
              <button class="gallery-download-btn" :disabled="!selectedArtifact || isDownloading" @click="downloadSelectedArtifact">
                <Loader2 v-if="isDownloading" :size="16" class="animate-spin" />
                <Download v-else :size="16" />
                {{ isDownloading ? '正在导出' : '下载到本地' }}
              </button>
            </div>
          </div>

          <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-[#eef2f5] shadow-inner">
            <template v-if="selectedArtifact">
              <img
                :src="selectedArtifact.imageUrl"
                :alt="selectedArtifact.prompt"
                class="max-h-full max-w-full object-contain cursor-zoom-in"
                @load="syncGalleryPreviewAspectRatio"
                @dblclick="openLightbox"
              />
              <div
                v-if="textOverlayEnabled"
                id="gallery-overlay-stage"
                class="pointer-events-none absolute inset-0 mx-auto my-auto max-h-full max-w-full"
                :style="{ aspectRatio: galleryPreviewAspectRatio }"
              >
                <button
                  v-for="overlay in galleryOverlays"
                  :key="overlay.id"
                  class="pointer-events-auto absolute overflow-hidden rounded-lg border text-left shadow-sm"
                  :class="selectedOverlayIds.includes(overlay.id) ? 'border-[#176bff] ring-2 ring-[#176bff]/20' : 'border-white/70'"
                  :style="overlayStyle(overlay)"
                  @click.stop="setSelectedOverlay(overlay.id, $event.shiftKey)"
                  @pointerdown.stop="startOverlayDrag($event, overlay)"
                  @pointermove.stop="dragOverlay($event)"
                  @pointerup.stop="endOverlayDrag"
                  @pointercancel.stop="endOverlayDrag"
                >
                  <template v-if="overlay.kind === 'text'">
                    <div class="flex h-full w-full items-center justify-center px-3 py-2 text-center font-bold leading-tight">
                      {{ overlay.text || '文字' }}
                    </div>
                  </template>
                  <template v-else>
                    <img
                      v-if="overlay.kind === 'image'"
                      :src="overlay.imageUrl"
                      :alt="overlay.name"
                      class="h-full w-full object-contain"
                      :style="{ opacity: overlay.opacity }"
                    />
                    <div v-else class="flex h-full w-full items-center justify-center bg-white/70 text-[11px] font-semibold text-[var(--muted)]">
                      SVG
                    </div>
                  </template>
                </button>
              </div>
            </template>
            <div v-else class="flex flex-col items-center gap-2 text-sm text-[var(--muted)]">
              <Images :size="32" />
              <span>请选择一张作品</span>
            </div>
          </div>

          <div v-if="selectedArtifact" class="mt-4 rounded-2xl border border-black/5 bg-white/65 p-3">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 text-[var(--muted)]">
                <span>{{ selectedProfileName }}</span>
                <span class="text-slate-300">·</span>
                <span id="gallery-image-dimensions">加载中...</span>
              </div>
              <span class="text-[var(--muted)]">{{ selectedArtifact.createdAt.slice(0, 19).replace('T', ' ') }}</span>
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-700">{{ selectedArtifact.prompt }}</p>
          </div>
        </section>

        <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
          <div v-if="!selectedArtifact" class="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            请先选择一张作品
          </div>

          <template v-else>
            <div class="mb-4 rounded-xl border border-black/5 bg-white/70 p-3">
              <div class="mb-2 flex items-center gap-2">
                <span class="gallery-mode-tag" :class="`tag-${selectedArtifact.mode}`">{{ modeLabel(selectedArtifact.mode) }}</span>
                <span class="ml-auto text-[10px] text-slate-400">{{ selectedArtifact.createdAt.slice(5, 16).replace('T', ' ') }}</span>
              </div>
              <p class="line-clamp-3 text-xs leading-5 text-slate-700">{{ selectedArtifact.prompt }}</p>
            </div>

            <div class="mb-4 grid grid-cols-2 gap-2">
              <button class="action-btn action-btn-primary" @click="downloadSelectedArtifact">
                <Download :size="14" />
                下载原图
              </button>
              <button class="action-btn action-btn-danger" @click="selectedArtifact && deleteArtifact(selectedArtifact.id, 'gallery')">
                <Trash2 :size="14" />
                删除作品
              </button>
            </div>
            <section class="mb-4 rounded-xl border border-black/5 bg-white/70 p-3">
              <h3 class="mb-3 text-sm font-semibold text-slate-900">导出设置</h3>
              <label class="mb-3 block">
                <span class="field-label">格式</span>
                <select v-model="exportFormat" class="field-input">
                  <option value="png">PNG（无损）</option>
                  <option value="jpg">JPG（压缩）</option>
                </select>
              </label>
              <label v-if="exportFormat === 'jpg'" class="block">
                <span class="field-label">质量：{{ exportQuality }}%</span>
                <input v-model.number="exportQuality" type="range" min="60" max="100" class="w-full accent-[#176bff]" />
              </label>
            </section>

            <section class="rounded-xl border border-black/5 bg-white/70 p-3">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-slate-900">图层编辑</h3>
                <label class="flex items-center gap-2">
                  <input v-model="textOverlayEnabled" type="checkbox" class="h-4 w-4 accent-[#176bff]" />
                  <span class="text-xs text-slate-600">启用</span>
                </label>
              </div>

              <div v-if="!textOverlayEnabled" class="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                开启后可添加文字、图标、水印等图层
              </div>

              <template v-else>
                <div class="mb-3 grid grid-cols-3 gap-2">
                  <button class="tool-btn" @click="addTextOverlay">
                    <Type :size="14" />
                    <span>文字</span>
                  </button>
                  <label class="tool-btn">
                    <input type="file" accept="image/*" class="hidden" @change="handleImageOverlayUpload($event, 'sticker')" />
                    <ImagePlus :size="14" />
                    <span>图片</span>
                  </label>
                  <button class="tool-btn" @click="openIconfontSearch">
                    <Search :size="14" />
                    <span>图标</span>
                  </button>
                </div>
                <div v-if="galleryOverlays.length > 0" class="mb-3">
                  <div class="mb-2 flex items-center justify-between text-xs">
                    <span class="font-medium text-slate-700">图层列表</span>
                    <span class="text-slate-400">{{ galleryOverlays.length }} 个</span>
                  </div>
                  <div class="grid gap-1.5">
                    <button
                      v-for="overlay in galleryOverlays"
                      :key="overlay.id"
                      class="layer-item"
                      :class="[selectedOverlayIds.includes(overlay.id) ? 'layer-item-active' : '', overlay.locked ? 'layer-item-locked' : '']"
                      @click="setSelectedOverlay(overlay.id, $event.shiftKey)"
                    >
                      <span class="truncate text-xs font-medium">{{ overlay.kind === 'text' ? (overlay.text || '文字') : overlay.name }}</span>
                      <div class="flex items-center gap-1.5">
                        <span v-if="overlay.locked" class="text-slate-400" title="已锁定">🔒</span>
                        <span class="layer-tag">{{ overlay.kind === 'text' ? '文字' : overlay.kind === 'svg' ? 'SVG' : '图片' }}</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div v-if="selectedOverlay" class="mb-3 grid grid-cols-3 gap-2">
                  <button class="control-btn" :disabled="selectedOverlay.locked" @click="moveOverlayLayer(selectedOverlay.id, 'forward')">
                    <span>上移</span>
                  </button>
                  <button class="control-btn" :disabled="selectedOverlay.locked" @click="moveOverlayLayer(selectedOverlay.id, 'backward')">
                    <span>下移</span>
                  </button>
                  <button class="control-btn" @click="duplicateOverlay(selectedOverlay.id)">
                    <span>复制</span>
                  </button>
                </div>

                <div v-if="selectedOverlay" class="rounded-lg border border-black/5 bg-slate-50 p-3">
                  <div class="mb-3 flex items-center justify-between">
                    <span class="text-xs font-semibold text-slate-700">图层属性</span>
                    <div class="flex items-center gap-1">
                      <button
                        class="icon-btn h-7 w-7"
                        :title="selectedOverlay.locked ? '解锁' : '锁定'"
                        @click="updateOverlay(selectedOverlay.id, { locked: !selectedOverlay.locked } as Partial<GalleryOverlay>)"
                      >
                        <span class="text-sm">{{ selectedOverlay.locked ? '🔒' : '🔓' }}</span>
                      </button>
                      <button class="icon-danger-btn h-7 w-7" title="删除" @click="removeOverlay(selectedOverlay.id)">
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </div>

                  <div class="mb-3 space-y-2">
                    <label class="block">
                      <span class="field-label">透明度：{{ Math.round((selectedOverlay.opacity ?? 1) * 100) }}%</span>
                      <input
                        :value="selectedOverlay.opacity ?? 1"
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        class="w-full accent-[#176bff]"
                        :disabled="selectedOverlay.locked"
                        @input="updateOverlay(selectedOverlay.id, { opacity: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                      />
                    </label>
                    <label class="block">
                      <span class="field-label">混合模式</span>
                      <select
                        :value="selectedOverlay.blendMode ?? 'normal'"
                        class="field-input text-xs"
                        :disabled="selectedOverlay.locked"
                        @change="updateOverlay(selectedOverlay.id, { blendMode: ($event.target as HTMLSelectElement).value } as Partial<GalleryOverlay>)"
                      >
                        <option value="normal">正常</option>
                        <option value="multiply">正片叠底</option>
                        <option value="screen">滤色</option>
                        <option value="overlay">叠加</option>
                        <option value="darken">变暗</option>
                        <option value="lighten">变亮</option>
                        <option value="color-dodge">颜色减淡</option>
                        <option value="color-burn">颜色加深</option>
                        <option value="hard-light">强光</option>
                        <option value="soft-light">柔光</option>
                        <option value="difference">差值</option>
                        <option value="exclusion">排除</option>
                      </select>
                    </label>
                  </div>

                  <template v-if="selectedOverlay.kind === 'text'">
                    <textarea
                      :value="selectedOverlay.text"
                      class="mb-2 h-16 w-full resize-none rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs outline-none focus:border-[#176bff]"
                      placeholder="输入文字内容"
                      :disabled="selectedOverlay.locked"
                      @input="updateOverlay(selectedOverlay.id, { text: ($event.target as HTMLTextAreaElement).value } as Partial<TextOverlay>)"
                    ></textarea>
                    <div class="mb-2 grid grid-cols-2 gap-2">
                      <select
                        :value="selectedOverlay.fontFamily"
                        class="field-input text-xs"
                        :disabled="selectedOverlay.locked"
                        @change="updateOverlay(selectedOverlay.id, { fontFamily: ($event.target as HTMLSelectElement).value as FontFamily } as Partial<TextOverlay>)"
                      >
                        <option v-for="font in fontFamilyOptions" :key="font.id" :value="font.id">{{ font.label }}</option>
                      </select>
                      <input
                        :value="selectedOverlay.fontSize"
                        class="field-input text-xs"
                        type="number"
                        min="12"
                        max="120"
                        placeholder="字号"
                        :disabled="selectedOverlay.locked"
                        @input="updateOverlay(selectedOverlay.id, { fontSize: Number(($event.target as HTMLInputElement).value) } as Partial<TextOverlay>)"
                      />
                    </div>
                    <div class="mb-2 grid grid-cols-2 gap-2">
                      <label class="field-input flex items-center gap-2 px-2">
                        <span class="text-xs text-slate-600">颜色</span>
                        <input
                          :value="selectedOverlay.color"
                          class="h-6 w-full"
                          type="color"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { color: ($event.target as HTMLInputElement).value } as Partial<TextOverlay>)"
                        />
                      </label>
                      <label class="flex items-center gap-2 text-xs">
                        <input
                          :checked="selectedOverlay.background"
                          type="checkbox"
                          class="h-3.5 w-3.5 accent-[#176bff]"
                          :disabled="selectedOverlay.locked"
                          @change="updateOverlay(selectedOverlay.id, { background: ($event.target as HTMLInputElement).checked } as Partial<TextOverlay>)"
                        />
                        <span class="text-slate-600">背景</span>
                      </label>
                    </div>
                  </template>

                  <template v-else>
                    <input
                      :value="selectedOverlay.name"
                      class="field-input mb-2 text-xs"
                      placeholder="图层名称"
                      :disabled="selectedOverlay.locked"
                      @input="updateOverlay(selectedOverlay.id, { name: ($event.target as HTMLInputElement).value } as Partial<SvgOverlay | ImageOverlay>)"
                    />
                    <div v-if="selectedOverlay.kind === 'image'" class="mb-2">
                      <select
                        :value="selectedOverlay.shape"
                        class="field-input text-xs"
                        :disabled="selectedOverlay.locked"
                        @change="updateOverlay(selectedOverlay.id, { shape: ($event.target as HTMLSelectElement).value as ImageOverlay['shape'] } as Partial<ImageOverlay>)"
                      >
                        <option value="sticker">贴纸</option>
                        <option value="badge">徽章</option>
                        <option value="watermark">水印</option>
                      </select>
                    </div>
                  </template>

                  <div class="space-y-2">
                    <div class="text-xs font-medium text-slate-700">变换</div>
                    <div class="grid grid-cols-2 gap-2">
                      <label>
                        <span class="field-label">X 位置</span>
                        <input
                          :value="selectedOverlay.x"
                          class="field-input text-xs"
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { x: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                        />
                      </label>
                      <label>
                        <span class="field-label">Y 位置</span>
                        <input
                          :value="selectedOverlay.y"
                          class="field-input text-xs"
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { y: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                        />
                      </label>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                      <label>
                        <span class="field-label">宽度</span>
                        <input
                          :value="selectedOverlay.width"
                          class="field-input text-xs"
                          type="number"
                          step="0.05"
                          min="0.05"
                          max="1"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { width: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                        />
                      </label>
                      <label>
                        <span class="field-label">高度</span>
                        <input
                          :value="selectedOverlay.height"
                          class="field-input text-xs"
                          type="number"
                          step="0.05"
                          min="0.05"
                          max="1"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { height: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                        />
                      </label>
                      <label>
                        <span class="field-label">旋转</span>
                        <input
                          :value="selectedOverlay.rotation"
                          class="field-input text-xs"
                          type="number"
                          min="-180"
                          max="180"
                          :disabled="selectedOverlay.locked"
                          @input="updateOverlay(selectedOverlay.id, { rotation: Number(($event.target as HTMLInputElement).value) } as Partial<GalleryOverlay>)"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </template>
            </section>
          </template>
        </aside>
      </div>
    </section>

    <section v-else class="h-full overflow-auto px-6 pb-8 pt-20">
      <div class="mx-auto grid max-w-[1280px] grid-cols-[320px_1fr] gap-5">
        <aside class="glass-panel h-fit rounded-[18px] p-4">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 class="text-base font-semibold">模型配置</h1>
              <p class="mt-1 text-xs text-[var(--muted)]">管理服务地址、密钥和主模型。</p>
            </div>
            <button class="icon-btn" title="新建配置" @click="newProfile">
              <ImagePlus :size="16" />
            </button>
          </div>

          <div class="grid gap-2">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              class="rounded-xl border p-3 text-left transition"
              :class="profile.id === activeProfileId ? 'border-[#176bff]/35 bg-[#176bff]/8' : 'border-black/5 bg-white/60 hover:bg-white'"
              @click="selectProfile(profile.id)"
            >
              <div class="flex min-w-0 items-center justify-between gap-3">
                <div class="min-w-0 flex-1 truncate text-sm font-semibold" :title="profile.name">{{ profile.name }}</div>
                <Star v-if="profile.id === activeProfileId" :size="14" class="shrink-0 text-[#176bff]" />
              </div>
              <div class="mt-1 line-clamp-2 break-all text-xs leading-5 text-[var(--muted)]" :title="profileSummary(profile)">{{ profileSummary(profile) }}</div>
            </button>
          </div>

          <div v-if="profiles.length === 0" class="rounded-xl border border-dashed border-black/15 bg-white/50 p-5 text-center text-xs text-[var(--muted)]">
            暂无配置，右侧填写后保存。
          </div>
        </aside>

        <section class="glass-panel rounded-[18px] p-5">
          <div class="mb-5 flex items-start justify-between gap-4 border-b border-black/5 pb-4">
            <div>
              <h2 class="text-xl font-bold tracking-tight">模型服务</h2>
              <p class="mt-2 text-sm leading-6 text-[var(--muted)]">支持自定义服务地址、获取多个模型，并把其中一个设为主模型。</p>
            </div>
            <div class="flex items-center gap-2">
                <button class="secondary-btn w-auto px-4" :disabled="isValidating || draftErrors.length > 0" @click="validateModel">
                  <Loader2 v-if="isValidating" :size="15" class="animate-spin" />
                  <Activity v-else :size="15" />
                  检测
                </button>
              <button class="primary-btn w-auto px-4" :disabled="isSaving || draftErrors.length > 0 || !isImageModelAdapter" @click="saveProfile">
                <Loader2 v-if="isSaving" :size="15" class="animate-spin" />
                <Save v-else :size="15" />
                保存
              </button>
              <button class="icon-danger-btn" :disabled="!activeProfileId" title="删除配置" @click="removeProfile">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <div class="grid gap-7">
            <section>
              <div class="setting-title">
                <span>API 密钥</span>
                <SlidersHorizontal :size="18" />
              </div>
              <div class="mt-3 flex rounded-xl border border-emerald-400 bg-white focus-within:border-emerald-500">
                <input
                  v-model="draft.apiKey"
                  :type="apiKeyVisible ? 'text' : 'password'"
                  class="min-w-0 flex-1 rounded-l-xl bg-transparent px-4 py-3 text-sm outline-none"
                  placeholder="可填写多个密钥，使用英文逗号分隔"
                />
                <button class="border-l border-black/10 px-4 text-[var(--muted)]" type="button" @click="apiKeyVisible = !apiKeyVisible">
                  <EyeOff v-if="apiKeyVisible" :size="18" />
                  <Eye v-else :size="18" />
                </button>
                <button class="border-l border-black/10 px-5 text-sm font-semibold" type="button" @click="validateModel">
                  检测
                </button>
              </div>
              <p class="mt-2 text-xs text-[var(--muted)]">多个密钥使用英文逗号分隔，后续可扩展轮询策略。</p>
            </section>

            <section>
              <div class="setting-title">
                <span>API 地址</span>
                <SlidersHorizontal :size="18" />
              </div>
              <div class="mt-3 grid grid-cols-[1fr_180px] gap-3">
                <input v-model="draft.baseUrl" class="field-input h-11" placeholder="https://code.linlong.xyz" />
                <select v-model="draft.adapter" class="field-input h-11">
                  <option v-for="adapter in adapters" :key="adapter.id" :value="adapter.id">{{ adapter.name }}</option>
                  <option v-if="adapters.length === 0" value="openai_images">OpenAI 图像</option>
                </select>
              </div>
              <p v-if="!isImageModelAdapter" class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                ⚠️ 当前适配器不支持图像生成功能，请选择支持文生图或图生图的适配器。
              </p>
              <p class="mt-2 text-xs text-[var(--muted)]">预览：{{ endpointPreview || '请先填写服务地址' }}</p>
            </section>

            <section class="grid grid-cols-2 gap-3">
              <label>
                <span class="field-label">配置名称</span>
                <input v-model="draft.name" class="field-input" placeholder="例如：Linlong API" />
              </label>
              <label>
                <span class="field-label">主模型</span>
                <div class="flex min-h-[42px] min-w-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">
                  <Star :size="15" class="shrink-0" />
                  <span class="min-w-0 flex-1 truncate" :title="draft.model">{{ draft.model || '请从模型列表选择' }}</span>
                </div>
              </label>
              <label>
                <span class="field-label">对话接口路径</span>
                <input v-model="draft.chatEndpoint" class="field-input" />
              </label>
              <label>
                <span class="field-label">图像接口路径</span>
                <input v-model="draft.imageEndpoint" class="field-input" />
              </label>
            </section>

            <section>
              <div class="mb-3 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="setting-title mb-0">
                    <span>模型</span>
                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">{{ filteredModels.length }}</span>
                  </div>
                  <div class="relative">
                    <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input v-model="modelSearch" class="h-10 w-56 rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#176bff]" placeholder="搜索模型" />
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button class="secondary-btn w-auto px-4" :disabled="isFetchingModels || draftErrors.length > 0" @click="fetchModelList">
                    <Loader2 v-if="isFetchingModels" :size="15" class="animate-spin" />
                    <RefreshCw v-else :size="15" />
                    获取模型列表
                  </button>
                  <div class="flex overflow-hidden rounded-xl border border-black/10 bg-white">
                    <input v-model="manualModelName" class="h-10 w-48 px-3 text-sm outline-none" placeholder="手动添加模型" @keyup.enter="addManualModel" />
                    <button class="border-l border-black/10 px-3" title="添加模型" @click="addManualModel">
                      <Plus :size="18" />
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="modelListResult" class="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                {{ modelListResult.message }}
              </div>

              <div class="overflow-hidden rounded-2xl border border-black/10 bg-white">
                <div v-if="groupedModels.length === 0" class="p-8 text-center text-sm text-[var(--muted)]">
                  还没有模型。点击“获取模型列表”，或手动添加一个模型。
                </div>

                <div v-for="group in groupedModels" :key="group.name" class="border-b border-black/5 last:border-b-0">
                  <div class="flex items-center gap-3 bg-slate-50 px-4 py-3">
                    <ChevronDown :size="16" class="text-[var(--muted)]" />
                    <span class="font-semibold">{{ group.name }}</span>
                    <span class="rounded-full bg-white px-2 py-0.5 text-xs text-[var(--muted)]">{{ group.models.length }}</span>
                  </div>

                  <div v-for="model in group.models" :key="model" class="grid grid-cols-[28px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-5 py-3">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#176bff]/10 text-[#176bff]">
                      <Sparkles :size="15" />
                    </div>
                    <button class="min-w-0 break-all text-left text-sm font-medium leading-5 line-clamp-2" :title="model" @click="setMainModel(model)">
                      {{ model }}
                    </button>
                    <span v-if="draft.model === model" class="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      主模型
                    </span>
                    <span v-else class="w-[52px]"></span>
                    <button class="shrink-0 whitespace-nowrap rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200" @click="setMainModel(model)">
                      设为主模型
                    </button>
                    <button class="shrink-0 rounded-lg px-2 py-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-600" title="移除模型" @click="removeModel(model)">
                      <Trash2 :size="15" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section class="grid grid-cols-2 gap-3">
              <label>
                <span class="field-label">请求超时（秒）</span>
                <input v-model.number="draft.timeoutSec" class="field-input" type="number" min="10" max="1800" />
              </label>
              <label>
                <span class="field-label">参考图上限</span>
                <input v-model.number="draft.referenceImageLimit" class="field-input" type="number" min="1" max="16" />
              </label>
            </section>

            <div class="flex items-center gap-2 rounded-xl border border-black/5 bg-white/60 p-3 text-xs">
              <input id="networkCheck" v-model="networkCheck" type="checkbox" class="h-4 w-4 accent-[#176bff]" />
              <label for="networkCheck" class="text-[var(--muted)]">模型检测时请求服务地址</label>
            </div>

            <div v-if="draftErrors.length" class="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
              <div v-for="error in draftErrors" :key="error">{{ error }}</div>
            </div>

            <div
              v-if="validationResult"
              class="rounded-xl border p-3 text-xs leading-5"
              :class="validationResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'"
            >
              <CheckCircle2 v-if="validationResult.ok" :size="15" class="mr-1 inline" />
              <AlertCircle v-else :size="15" class="mr-1 inline" />
              {{ validationResult.message }}
              <span v-if="validationResult.latencyMs"> 路 {{ validationResult.latencyMs }}ms</span>
            </div>

            <div v-if="currentAdapter" class="rounded-xl border border-[#176bff]/15 bg-[#176bff]/5 p-3 text-xs leading-5 text-slate-700">
              <ShieldCheck :size="15" class="mr-1 inline text-[#176bff]" />
              {{ currentAdapter.description }}
            </div>
          </div>
        </section>
      </div>
    </section>

    <div v-if="isTemplateManagerOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm" @click.self="isTemplateManagerOpen = false">
      <section class="grid max-h-[86vh] w-full max-w-5xl grid-cols-[360px_1fr] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-900/20">
        <aside class="thin-scrollbar overflow-auto border-r border-black/5 bg-slate-50 p-4">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-bold">提示词模板</h2>
              <p class="mt-1 text-xs text-[var(--muted)]">本地 SQLite 持久化保存</p>
            </div>
            <button class="icon-btn" title="新建模板" @click="resetTemplateDraft">
              <Plus :size="15" />
            </button>
          </div>

          <div v-if="promptTemplates.length === 0" class="rounded-xl border border-dashed border-black/10 bg-white p-5 text-center text-xs text-[var(--muted)]">
            暂无模板
          </div>
          <div v-else class="grid gap-2">
            <button
              v-for="template in promptTemplates"
              :key="template.id"
              class="rounded-xl border bg-white p-3 text-left transition hover:border-[#176bff]/40"
              :class="templateDraft.id === template.id ? 'border-[#176bff] shadow-sm' : 'border-black/5'"
              @click="editTemplate(template)"
            >
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="truncate text-sm font-bold">{{ template.title }}</span>
                <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-[var(--muted)]">
                  {{ template.isBuiltin ? '内置' : template.category }}
                </span>
              </div>
              <p class="line-clamp-2 text-xs leading-5 text-[var(--muted)]">{{ template.prompt }}</p>
            </button>
          </div>
        </aside>

        <section class="thin-scrollbar overflow-auto p-5">
          <header class="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold">{{ templateDraft.id ? '编辑模板' : '新建模板' }}</h2>
              <p class="mt-1 text-xs text-[var(--muted)]">保存后会立即出现在生图页的预设提示词中。</p>
            </div>
            <button class="icon-btn" title="关闭" @click="isTemplateManagerOpen = false">
              <X :size="16" />
            </button>
          </header>

          <div v-if="templateNotice" class="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">
            {{ templateNotice }}
          </div>

          <div class="grid gap-4">
            <div class="grid grid-cols-[1fr_160px] gap-3">
              <label>
                <span class="field-label">模板名称</span>
                <input v-model="templateDraft.title" class="field-input" placeholder="例如：电影分镜 3x4" />
              </label>
              <label>
                <span class="field-label">分类</span>
                <input v-model="templateDraft.category" class="field-input" placeholder="分镜" />
              </label>
            </div>

            <label>
              <span class="field-label">提示词内容</span>
              <textarea
                v-model="templateDraft.prompt"
                class="h-56 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#176bff]"
                placeholder="写下完整提示词模板"
              ></textarea>
            </label>

            <div class="template-form-actions">
              <button class="secondary-btn template-action-btn" @click="applyPromptTemplate(templateDraft)">
                <Star :size="15" />
                应用到当前提示词
              </button>
              <div class="template-action-group">
                <button v-if="templateDraft.id" class="icon-danger-btn" title="删除模板" @click="deleteTemplate(templateDraft)">
                  <Trash2 :size="15" />
                </button>
                <button class="primary-btn template-action-btn" @click="saveTemplate">
                  <Save :size="15" />
                  保存模板
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>

    <div v-if="isIconfontSearchOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm" @click.self="isIconfontSearchOpen = false">
      <section class="grid max-h-[86vh] w-full max-w-4xl grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-900/20">
        <section class="thin-scrollbar overflow-auto p-5">
          <header class="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold">多源图标导入</h2>
              <p class="mt-1 text-xs text-[var(--muted)]">支持中文或英文关键词搜索，并保留 SVG 链接、SVG 源码两种导入方式。</p>
            </div>
            <button class="icon-btn" title="关闭" @click="isIconfontSearchOpen = false">
              <X :size="16" />
            </button>
          </header>

          <div class="grid gap-4">
            <label>
              <span class="field-label">关键词</span>
              <div class="flex gap-2">
                <input v-model="iconfontKeyword" class="field-input" placeholder="例如：搜索、home、arrow" @keyup.enter="searchIconfontIcons" />
                <button class="secondary-btn w-auto px-4" :disabled="isSearchingIconfont" @click="searchIconfontIcons">
                  <Loader2 v-if="isSearchingIconfont" :size="14" class="animate-spin" />
                  <Search v-else :size="14" />
                  搜索
                </button>
              </div>
            </label>

            <div class="rounded-xl border border-black/5 bg-slate-50 p-3">
              <div class="mb-2 flex items-center justify-between">
                <div class="text-sm font-semibold">搜索结果</div>
                <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#176bff]">
                  <a :href="`https://icon-sets.iconify.design/search/?query=${encodeURIComponent(iconfontKeyword || 'icon')}`" target="_blank" rel="noreferrer">打开 Iconify</a>
                  <a :href="`https://www.iconfont.cn/search/index?searchType=icon&q=${encodeURIComponent(iconfontKeyword || 'icon')}`" target="_blank" rel="noreferrer">打开 iconfont</a>
                  <a href="https://iconstore.co" target="_blank" rel="noreferrer">iconstore</a>
                  <a href="https://www.flaticon.com" target="_blank" rel="noreferrer">flaticon</a>
                </div>
              </div>
              <div v-if="iconfontResults.length === 0" class="rounded-xl border border-dashed border-black/10 bg-white px-4 py-6 text-center text-xs text-[var(--muted)]">
                先输入关键词搜索；如果当前结果不合适，也可以直接粘贴 SVG 链接或 SVG 源码导入。
              </div>
              <div v-else class="grid gap-2">
                <button v-for="item in iconfontResults" :key="item.id" class="iconfont-result-item" @click="useIconfontResult(item)">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-slate-800">{{ item.name }}</div>
                    <div class="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span class="rounded-full bg-slate-100 px-2 py-0.5">{{ item.source === 'iconify' ? 'Iconify' : item.source === 'iconfont' ? 'iconfont' : '手动' }}</span>
                      <span v-if="item.author">{{ item.author }}</span>
                    </div>
                  </div>
                  <Link2 :size="14" class="shrink-0 text-[var(--muted)]" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside class="thin-scrollbar overflow-auto border-l border-black/5 bg-slate-50 p-5">
          <div class="grid gap-4">
            <label>
              <span class="field-label">SVG 链接</span>
              <div class="flex gap-2">
                <input v-model="iconfontUrlDraft" class="field-input" placeholder="https://api.iconify.design/mdi-light/home.svg" />
                <button class="secondary-btn w-auto px-4" @click="importIconfontSvg">
                  <Import :size="14" />
                  导入
                </button>
              </div>
            </label>

            <label>
              <span class="field-label">SVG 源码</span>
              <textarea
                v-model="iconfontSvgDraft"
                class="h-64 w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#176bff]"
                placeholder="<svg>...</svg>"
              ></textarea>
            </label>

            <button class="primary-btn" @click="importSvgMarkupDraft">
              <Plus :size="15" />
              导入为本地图层
            </button>
          </div>
        </aside>
      </section>
    </div>

    <div v-if="isModelConfigOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm" @click.self="isModelConfigOpen = false">
      <section class="grid max-h-[86vh] w-full max-w-[980px] grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-900/20">
        <aside class="thin-scrollbar overflow-auto border-r border-black/5 bg-slate-50 p-5">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">选择模型配置</h2>
              <p class="mt-1 text-xs text-[var(--muted)]">切换常用服务和主模型。</p>
            </div>
            <button class="icon-btn" title="新建配置" @click="newProfile">
              <Plus :size="15" />
            </button>
          </div>

          <div v-if="profiles.length > 0" class="grid gap-2">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              class="model-config-profile"
              :class="profile.id === activeProfileId ? 'is-active' : ''"
              @click="selectProfile(profile.id)"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-bold text-slate-900">{{ profile.name }}</div>
                <div class="mt-1 line-clamp-2 break-all text-[11px] leading-4 text-[var(--muted)]">{{ profileSummary(profile) }}</div>
              </div>
              <Star v-if="profile.id === activeProfileId" :size="14" class="shrink-0 text-[#176bff]" />
            </button>
          </div>

          <div v-else class="rounded-xl border border-dashed border-black/10 bg-white px-4 py-8 text-center text-sm text-[var(--muted)]">
            暂无配置，先创建一个模型服务。
          </div>

          <button class="secondary-btn mt-4" @click="openModelConfigPage">
            <SlidersHorizontal :size="15" />
            进入完整配置
          </button>
        </aside>

        <section class="thin-scrollbar overflow-auto p-5">
          <header class="mb-5 flex items-start justify-between gap-4 border-b border-black/5 pb-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#176bff] text-white">
                  <Star :size="16" />
                </div>
                <div class="min-w-0">
                  <h2 class="truncate text-lg font-bold">{{ activeProfile?.name || draft.name || '模型配置' }}</h2>
                  <p class="mt-0.5 truncate text-xs text-[var(--muted)]">{{ activeSummary }}</p>
                </div>
              </div>
            </div>
            <button class="icon-btn" title="关闭" @click="isModelConfigOpen = false">
              <X :size="16" />
            </button>
          </header>

          <div class="grid gap-5">
            <section class="grid grid-cols-3 gap-3">
              <div class="rounded-xl border border-black/5 bg-slate-50 p-3">
                <div class="text-[11px] font-semibold text-[var(--muted)]">服务地址</div>
                <div class="mt-1 truncate text-xs font-semibold text-slate-800" :title="draft.baseUrl">{{ draft.baseUrl || '未填写' }}</div>
              </div>
              <div class="rounded-xl border border-black/5 bg-slate-50 p-3">
                <div class="text-[11px] font-semibold text-[var(--muted)]">适配器</div>
                <div class="mt-1 truncate text-xs font-semibold text-slate-800">{{ currentAdapter?.name || draft.adapter }}</div>
              </div>
              <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div class="text-[11px] font-semibold text-emerald-700">主模型</div>
                <div class="mt-1 truncate text-xs font-bold text-emerald-800" :title="draft.model">{{ draft.model || '未选择' }}</div>
              </div>
            </section>

            <section class="flex flex-wrap items-center justify-between gap-3">
              <div class="relative min-w-[220px] flex-1">
                <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input v-model="modelSearch" class="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#176bff]" placeholder="搜索模型" />
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button class="secondary-btn w-auto px-4" :disabled="isValidating || draftErrors.length > 0" @click="validateModel">
                  <Loader2 v-if="isValidating" :size="15" class="animate-spin" />
                  <Activity v-else :size="15" />
                  检测
                </button>
                <button class="secondary-btn w-auto px-4" :disabled="isFetchingModels || draftErrors.length > 0" @click="fetchModelList">
                  <Loader2 v-if="isFetchingModels" :size="15" class="animate-spin" />
                  <RefreshCw v-else :size="15" />
                  获取模型
                </button>
                <button class="primary-btn w-auto px-4" :disabled="isSaving || draftErrors.length > 0" @click="saveProfile">
                  <Loader2 v-if="isSaving" :size="15" class="animate-spin" />
                  <Save v-else :size="15" />
                  保存
                </button>
              </div>
            </section>

            <section class="flex overflow-hidden rounded-xl border border-black/10 bg-white">
              <input v-model="manualModelName" class="h-10 min-w-0 flex-1 px-3 text-sm outline-none" placeholder="手动添加模型名称" @keyup.enter="addManualModel" />
              <button class="border-l border-black/10 px-3 text-[#176bff]" title="添加模型" @click="addManualModel">
                <Plus :size="18" />
              </button>
            </section>

            <div v-if="modelListResult" class="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              {{ modelListResult.message }}
            </div>

            <div v-if="draftErrors.length" class="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
              <div v-for="error in draftErrors" :key="error">{{ error }}</div>
            </div>

            <div
              v-if="validationResult"
              class="rounded-xl border p-3 text-xs leading-5"
              :class="validationResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'"
            >
              <CheckCircle2 v-if="validationResult.ok" :size="15" class="mr-1 inline" />
              <AlertCircle v-else :size="15" class="mr-1 inline" />
              {{ validationResult.message }} · {{ validationResult.latencyMs }}ms
            </div>

            <section class="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <div v-if="groupedModels.length === 0" class="p-8 text-center text-sm text-[var(--muted)]">
                还没有模型。可以获取模型列表，或手动添加一个模型名称。
              </div>

              <div v-for="group in groupedModels" :key="group.name" class="border-b border-black/5 last:border-b-0">
                <div class="flex items-center gap-3 bg-slate-50 px-4 py-3">
                  <Sparkles :size="15" class="text-[#176bff]" />
                  <span class="font-semibold">{{ group.name }}</span>
                  <span class="rounded-full bg-white px-2 py-0.5 text-xs text-[var(--muted)]">{{ group.models.length }}</span>
                </div>

                <div v-for="model in group.models" :key="model" class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3">
                  <button class="min-w-0 break-all text-left text-sm font-medium leading-5 line-clamp-2" :title="model" @click="setMainModel(model)">
                    {{ model }}
                  </button>
                  <span v-if="draft.model === model" class="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    主模型
                  </span>
                  <button v-else class="shrink-0 whitespace-nowrap rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200" @click="setMainModel(model)">
                    设为主模型
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>
    </div>

    <div v-if="isHelpOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-sm" @click.self="isHelpOpen = false">
      <section class="w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-900/20">
        <header class="flex items-start justify-between gap-4 border-b border-black/5 bg-slate-50 px-5 py-4">
          <div>
            <div class="flex items-center gap-2">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#176bff] text-white">
                <Sparkles :size="17" />
              </div>
              <div>
                <h2 class="text-lg font-bold">关于 SamImage</h2>
                <p class="mt-0.5 text-xs text-[var(--muted)]">AI 图片流程工作台</p>
              </div>
            </div>
          </div>
          <button class="icon-btn" title="关闭" @click="isHelpOpen = false">
            <X :size="16" />
          </button>
        </header>

        <div class="grid gap-4 px-5 py-5">
          <section class="rounded-2xl border border-black/5 bg-slate-50 p-4">
            <h3 class="text-sm font-bold">应用简介</h3>
            <p class="mt-2 text-sm leading-6 text-slate-700">
              SamImage 是一个桌面端 AI 图片生成工作台，围绕模型配置、生图流程、参考图管理、作品集和画廊导出构建。
              它适合把常用图像模型服务整理成一个可视化创作流程。
            </p>
          </section>

          <section class="rounded-2xl border border-black/5 bg-white p-4">
            <h3 class="text-sm font-bold">作者</h3>
            <div class="mt-3 grid gap-2 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-4">
                <span class="text-[var(--muted)]">作者</span>
                <span class="font-semibold">Samuel &amp; You</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-[var(--muted)]">经验</span>
                <span class="font-semibold">10 年全栈开发</span>
              </div>
              <p class="pt-2 leading-6">
                长期关注 Web、桌面端、后端服务和 AI 应用工程化，偏爱把复杂流程做成清晰、可操作的工具。
              </p>
            </div>
          </section>

          <section class="rounded-2xl border border-black/5 bg-white p-4">
            <h3 class="text-sm font-bold">开源与联系</h3>
            <div class="mt-3 grid gap-3 text-sm">
              <a
                class="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-slate-50 px-3 py-2.5 font-semibold text-[#176bff] hover:bg-slate-100"
                href="https://gitee.com/SamuelYou/sam-image-app.git"
                target="_blank"
                rel="noreferrer"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <Github :size="16" class="shrink-0" />
                  <span class="truncate">https://gitee.com/SamuelYou/sam-image-app.git</span>
                </span>
              </a>
              <div class="flex items-center justify-between gap-4 rounded-xl border border-black/5 bg-slate-50 px-3 py-2.5">
                <span class="text-[var(--muted)]">微信</span>
                <span class="font-semibold">malovoz</span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>

    <div class="pointer-events-none fixed bottom-3 right-4 z-20 rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] shadow-sm backdrop-blur-xl">
      v{{ appVersion }}
    </div>

    <Teleport to="body">
      <div
        v-if="isLightboxOpen && selectedArtifact"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click.self="isLightboxOpen = false"
        @keydown.escape.window="isLightboxOpen = false"
      >
        <button class="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" @click="isLightboxOpen = false">
          <X :size="20" />
        </button>
        <img
          :src="selectedArtifact.imageUrl"
          :alt="selectedArtifact.prompt"
          class="max-h-[92vh] max-w-[92vw] object-contain"
        />
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.toolbar-btn,
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: white;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.icon-btn {
  height: 2.25rem;
  width: 2.25rem;
  padding: 0;
  border-radius: 0.75rem;
}

.model-switcher-trigger {
  display: inline-flex;
  min-width: 12rem;
  max-width: 24rem;
  height: 2.75rem;
  align-items: center;
  gap: 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(23, 107, 255, 0.16);
  background: rgba(255, 255, 255, 0.88);
  padding: 0.35rem 0.75rem 0.35rem 0.45rem;
  box-shadow: 0 14px 40px rgba(42, 54, 68, 0.1);
  backdrop-filter: blur(18px);
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.model-switcher-trigger:hover {
  border-color: rgba(23, 107, 255, 0.32);
  background: white;
  transform: translateY(-1px);
}

.model-switcher-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 0.6rem);
  z-index: 60;
  width: min(24rem, calc(100vw - 2rem));
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.96);
  padding: 0.85rem;
  box-shadow: 0 22px 70px rgba(42, 54, 68, 0.18);
  backdrop-filter: blur(22px);
}

.model-switcher-list {
  display: grid;
  max-height: 18rem;
  gap: 0.5rem;
  overflow: auto;
  padding-right: 0.15rem;
}

.model-switcher-item,
.model-config-profile {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(248, 250, 252, 0.88);
  padding: 0.75rem;
  text-align: left;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.model-switcher-item:hover,
.model-config-profile:hover {
  border-color: rgba(23, 107, 255, 0.28);
  background: white;
  transform: translateY(-1px);
}

.model-switcher-item.is-active,
.model-config-profile.is-active {
  border-color: rgba(23, 107, 255, 0.38);
  background: rgba(23, 107, 255, 0.08);
  box-shadow: 0 12px 30px rgba(23, 107, 255, 0.1);
}

.setting-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
  font-size: 1rem;
  font-weight: 800;
}

.field-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.field-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.92);
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
}

.field-input:focus {
  border-color: #176bff;
}

.primary-btn,
.secondary-btn,
.icon-danger-btn {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border-radius: 0.8rem;
  font-size: 0.8rem;
  font-weight: 700;
  transition: transform 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.primary-btn {
  width: 100%;
  background: #176bff;
  color: white;
}

.secondary-btn {
  width: 100%;
  border: 1px solid rgba(23, 107, 255, 0.22);
  background: rgba(23, 107, 255, 0.08);
  color: #176bff;
}

.icon-danger-btn {
  width: 2.5rem;
  border: 1px solid rgba(214, 69, 69, 0.25);
  background: rgba(214, 69, 69, 0.08);
  color: #d64545;
}

.primary-btn:hover,
.secondary-btn:hover,
.icon-danger-btn:hover,
.toolbar-btn:hover,
.icon-btn:hover {
  transform: translateY(-1px);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.icon-danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.52;
  transform: none;
}

.template-form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 1rem;
}

.template-action-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.template-action-btn {
  width: auto;
  min-width: 8.25rem;
  padding: 0 1rem;
  white-space: nowrap;
}

.prompt-template-trigger {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  gap: 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.82);
  padding: 0 0.9rem;
  color: #1e2428;
  font-size: 0.78rem;
  font-weight: 800;
  box-shadow: 0 12px 34px rgba(42, 54, 68, 0.12);
  backdrop-filter: blur(18px);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.prompt-template-trigger:hover {
  border-color: rgba(23, 107, 255, 0.28);
  background: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
}

.prompt-template-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 0.6rem);
  width: 23rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.94);
  padding: 0.85rem;
  box-shadow: 0 22px 70px rgba(42, 54, 68, 0.18);
  backdrop-filter: blur(22px);
}

.template-list-btn {
  border-radius: 0.8rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(248, 250, 252, 0.86);
  padding: 0.75rem;
  text-align: left;
  font-size: 0.78rem;
  transition: border-color 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.template-list-btn:hover {
  border-color: rgba(23, 107, 255, 0.32);
  background: white;
  transform: translateY(-1px);
}

.gallery-list-toolbar {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.gallery-list-item {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 0;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: white;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.gallery-list-item:hover {
  transform: translateY(-1px);
  border-color: rgba(23, 107, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.gallery-list-item.is-active {
  border-color: rgba(23, 107, 255, 0.45);
  box-shadow: 0 6px 20px rgba(23, 107, 255, 0.14);
  background: linear-gradient(135deg, rgba(23, 107, 255, 0.03) 0%, white 100%);
}

.gallery-list-thumb {
  aspect-ratio: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-mode-tag {
  display: inline-block;
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

.tag-txt2img {
  background: #eef4ff;
  color: #3b6fde;
}

.tag-img2img {
  background: #ecfdf5;
  color: #16a34a;
}

.tag-reverse {
  background: #fef9ec;
  color: #ca8a04;
}

.tag-blend {
  background: #f5f0ff;
  color: #7c3aed;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.action-btn-primary {
  background: #176bff;
  color: white;
}

.action-btn-primary:hover {
  background: #1557cc;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(23, 107, 255, 0.25);
}

.action-btn-danger {
  background: #fee;
  color: #dc2626;
  border-color: #fecaca;
}

.action-btn-danger:hover {
  background: #fecaca;
  transform: translateY(-1px);
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: white;
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  border-color: rgba(23, 107, 255, 0.3);
  background: rgba(23, 107, 255, 0.04);
  color: #176bff;
  transform: translateY(-1px);
}

.layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: white;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.layer-item:hover {
  border-color: rgba(23, 107, 255, 0.2);
  background: rgba(23, 107, 255, 0.02);
}

.layer-item-active {
  border-color: #176bff !important;
  background: rgba(23, 107, 255, 0.06) !important;
  box-shadow: 0 0 0 3px rgba(23, 107, 255, 0.1);
}

.layer-item-locked {
  opacity: 0.6;
  cursor: not-allowed;
}

.layer-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
}

.control-btn {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: white;
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  transition: all 0.15s ease;
}

.control-btn:hover {
  border-color: rgba(23, 107, 255, 0.3);
  background: rgba(23, 107, 255, 0.04);
  color: #176bff;
}

.creative-tools-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.overlay-list-panel {
  display: grid;
  gap: 0.5rem;
}

.overlay-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.overlay-list-item {
  border-radius: 0.9rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.82);
  padding: 0.7rem 0.8rem;
  text-align: left;
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.overlay-list-item:hover {
  transform: translateY(-1px);
}

.creation-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.iconfont-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: white;
  padding: 0.8rem;
  text-align: left;
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.iconfont-result-item:hover {
  transform: translateY(-1px);
  border-color: rgba(23, 107, 255, 0.28);
  box-shadow: 0 10px 26px rgba(42, 54, 68, 0.08);
}

.gallery-download-btn,
.gallery-danger-btn {
  display: inline-flex;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border-radius: 0.8rem;
  font-size: 0.8rem;
  font-weight: 800;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.gallery-download-btn {
  min-width: 7rem;
  padding: 0 1rem;
  background: #176bff;
  color: white;
}

.gallery-danger-btn {
  width: 2.5rem;
  border: 1px solid rgba(214, 69, 69, 0.22);
  background: rgba(214, 69, 69, 0.08);
  color: #d64545;
}

.gallery-download-btn:hover,
.gallery-danger-btn:hover {
  transform: translateY(-1px);
}

.gallery-download-btn:disabled,
.gallery-danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.52;
  transform: none;
}

.canvas-grid {
  background-image:
    linear-gradient(rgba(31, 41, 48, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(31, 41, 48, 0.055) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black 0%, black 68%, transparent 100%);
}

.connection-path {
  fill: none;
  stroke: rgba(23, 107, 255, 0.42);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 10 10;
}

.connection-path.ready {
  stroke: rgba(15, 159, 143, 0.52);
  stroke-dasharray: none;
}
</style>
