<script setup lang="ts">
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Eye,
  EyeOff,
  Github,
  ImagePlus,
  Loader2,
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
  Trash2,
  Wand2,
} from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, reactive, ref } from 'vue';
import packageJson from '../package.json';
import { api } from './api/client';
import type {
  AdapterInfo,
  Artifact,
  GenerationRequest,
  ModelListResult,
  ModelProfile,
  ModelValidationResult,
  WorkMode,
} from './types';
import {
  buildDownloadName,
  clampCropBox,
  type CropBox,
  type ExportFormat,
  mimeForFormat,
  qualityForFormat,
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

type PageKey = 'generate' | 'models' | 'gallery';

const appVersion = packageJson.version;
const page = ref<PageKey>('generate');
const adapters = ref<AdapterInfo[]>([]);
const profiles = ref<ModelProfile[]>([]);
const artifacts = ref<Artifact[]>([]);
const activeProfileId = ref('');
const draft = reactive<ModelProfile>(defaultProfile());
const prompt = ref('清晨的玻璃温室里，一台银色机器人正在修剪发光植物，电影感构图，高细节');
const negativePrompt = ref('低清晰度，畸形，文字水印');
const size = ref('1024x1024');
const mode = ref<WorkMode>('txt2img');
const seed = ref<number | undefined>(undefined);
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
const exportFormat = ref<ExportFormat>('png');
const exportQuality = ref(86);
const cropEnabled = ref(false);
const cropBox = reactive<CropBox>({ x: 0, y: 0, width: 768, height: 768 });
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

const modeOptions: Array<{ id: WorkMode; label: string; desc: string }> = [
  { id: 'txt2img', label: '文生图', desc: '从提示词创建新图' },
  { id: 'img2img', label: '图生图', desc: '使用参考图编辑' },
  { id: 'reverse', label: '反推', desc: '图片理解与提示词' },
  { id: 'blend', label: '融合', desc: '多图参考混合' },
];

const draftErrors = computed(() => validateProfileDraft(draft));
const activeProfile = computed(() => profiles.value.find((item) => item.id === activeProfileId.value));
const selectedProfile = computed(() => activeProfile.value ?? draft);
const activeSummary = computed(() => profileSummary(selectedProfile.value));
const currentAdapter = computed(() => adapters.value.find((item) => item.id === draft.adapter));
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
    const profileMatches = galleryProfileFilter.value === 'all' || artifact.profileId === galleryProfileFilter.value;
    const modeMatches = galleryModeFilter.value === 'all' || artifact.mode === galleryModeFilter.value;
    return profileMatches && modeMatches;
  });
});
const selectedArtifact = computed(() => {
  const visible = galleryArtifacts.value;
  return visible.find((item) => item.id === selectedArtifactId.value) ?? visible[0] ?? null;
});
const selectedProfileName = computed(() => {
  if (!selectedArtifact.value) return '未选择作品';
  return profiles.value.find((item) => item.id === selectedArtifact.value?.profileId)?.name ?? '未知配置';
});
const referenceSourceCount = computed(
  () => collectReferenceSources(referenceImageItems.value, referenceImageUrlDraft.value).length,
);

function modeLabel(value: WorkMode): string {
  return modeOptions.find((item) => item.id === value)?.label ?? value;
}

function openGallery(artifactId?: string) {
  if (artifactId) selectedArtifactId.value = artifactId;
  else if (!selectedArtifactId.value && artifacts.value[0]) selectedArtifactId.value = artifacts.value[0].id;
  page.value = 'gallery';
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

async function loadAll() {
  isLoading.value = true;
  notice.value = '';
  try {
    const [health, adapterList, profileList, artifactList] = await Promise.all([
      api.health(),
      api.adapters(),
      api.profiles(),
      api.artifacts(),
    ]);
    apiOnline.value = health.ok;
    adapters.value = adapterList;
    profiles.value = profileList;
    artifacts.value = artifactList;
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

async function saveProfile() {
  if (draftErrors.value.length > 0) return;
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
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeForFormat(exportFormat.value), qualityForFormat(exportFormat.value, exportQuality.value));
  });
  if (!blob) throw new Error('图片压缩失败');
  return blob;
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
          生图工作台
        </button>
        <button
          class="rounded-full px-4 py-2 transition"
          :class="page === 'models' ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
          @click="page = 'models'"
        >
          模型配置
        </button>
        <button
          class="rounded-full px-4 py-2 transition"
          :class="page === 'gallery' ? 'bg-[#1e2428] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-white'"
          @click="openGallery()"
        >
          画廊
        </button>
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <div class="hidden min-w-0 max-w-[420px] rounded-full bg-white/65 px-3 py-1.5 text-xs text-[var(--muted)] xl:block">
          <div class="truncate">主模型：{{ activeSummary }}</div>
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
          <p class="mt-1 text-xs text-[var(--muted)]">主界面只保留创作流程；模型、密钥和服务地址在模型配置页管理。</p>
        </div>

        <div class="absolute left-10 top-[138px] z-10 w-[300px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
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
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full bg-[#0f9f8f]"></span>
              <span class="text-sm font-semibold">{{ modeLabel(mode) }}</span>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">任务</span>
          </div>
          <p class="line-clamp-4 text-xs leading-5 text-[var(--muted)]">{{ prompt || '等待提示词' }}</p>
        </div>

        <div class="absolute right-14 top-[138px] z-10 w-[300px] rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full bg-[#c77911]"></span>
              <span class="text-sm font-semibold">作品入库</span>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">{{ artifacts.length }} 张</span>
          </div>
          <p class="text-xs leading-5 text-[var(--muted)]">生成结果会保存到本地 SQLite，右侧作品集即时展示。</p>
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
              <span class="mt-1 text-[11px] text-[var(--muted)]">粘贴非图片文件会给出提示</span>
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
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-base font-semibold">作品集</h2>
            <p class="mt-1 text-xs text-[var(--muted)]">{{ artifacts.length }} 张作品</p>
          </div>
          <Database :size="18" class="text-[var(--muted)]" />
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
          <p class="mt-2 text-xs leading-5 text-[var(--muted)]">配置主模型后，点击“开始生成”会创建第一张预览作品。</p>
        </div>

        <div v-else class="grid gap-3">
          <article
            v-for="artifact in artifacts"
            :key="artifact.id"
            class="overflow-hidden rounded-2xl border border-black/5 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <img :src="artifact.imageUrl" :alt="artifact.prompt" class="aspect-[4/3] w-full object-cover" />
            <div class="p-3">
              <div class="mb-1 flex items-center justify-between">
                <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">{{ modeLabel(artifact.mode) }}</span>
                <span class="text-[11px] text-[var(--muted)]">{{ artifact.createdAt.slice(0, 16).replace('T', ' ') }}</span>
              </div>
              <p class="line-clamp-2 text-xs leading-5 text-slate-700">{{ artifact.prompt }}</p>
              <div class="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold hover:bg-slate-200" @click="openGallery(artifact.id)">
                  进入画廊
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

    <section v-else-if="page === 'gallery'" class="h-full overflow-hidden px-6 pb-6 pt-20">
      <div class="grid h-full grid-cols-[320px_1fr_340px] gap-5">
        <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h1 class="text-base font-semibold">画廊</h1>
              <p class="mt-1 text-xs text-[var(--muted)]">选择作品集、预览和导出图片。</p>
            </div>
            <Database :size="18" class="text-[var(--muted)]" />
          </div>

          <div class="mb-4 grid gap-3">
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
            当前筛选下没有作品。
          </div>

          <div v-else class="grid gap-3">
            <button
              v-for="artifact in galleryArtifacts"
              :key="artifact.id"
              class="overflow-hidden rounded-2xl border bg-white text-left transition"
              :class="selectedArtifact?.id === artifact.id ? 'border-[#176bff] shadow-lg shadow-blue-500/10' : 'border-black/5 hover:border-black/15'"
              @click="selectedArtifactId = artifact.id"
            >
              <img :src="artifact.imageUrl" :alt="artifact.prompt" class="aspect-[4/3] w-full object-cover" />
              <div class="p-3">
                <div class="mb-1 flex items-center justify-between">
                  <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-[var(--muted)]">{{ modeLabel(artifact.mode) }}</span>
                  <span class="text-[11px] text-[var(--muted)]">{{ artifact.createdAt.slice(0, 16).replace('T', ' ') }}</span>
                </div>
                <p class="line-clamp-2 text-xs leading-5 text-slate-700">{{ artifact.prompt }}</p>
              </div>
            </button>
          </div>
        </aside>

        <section class="glass-panel flex min-h-0 flex-col rounded-[18px] p-4">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-lg font-bold">作品预览</h2>
              <p class="mt-1 truncate text-xs text-[var(--muted)]">{{ selectedProfileName }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
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

          <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-black/5 bg-[#eef2f5]">
            <img
              v-if="selectedArtifact"
              :src="selectedArtifact.imageUrl"
              :alt="selectedArtifact.prompt"
              class="max-h-full max-w-full object-contain"
            />
            <div v-else class="text-sm text-[var(--muted)]">请选择一张作品</div>
          </div>

          <div v-if="selectedArtifact" class="mt-4 rounded-2xl border border-black/5 bg-white/65 p-3">
            <div class="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{{ modeLabel(selectedArtifact.mode) }}</span>
              <span>{{ selectedArtifact.createdAt.slice(0, 19).replace('T', ' ') }}</span>
            </div>
            <p class="text-sm leading-6 text-slate-700">{{ selectedArtifact.prompt }}</p>
          </div>
        </section>

        <aside class="glass-panel thin-scrollbar overflow-auto rounded-[18px] p-4">
          <div class="mb-4">
            <h2 class="text-base font-semibold">导出处理</h2>
            <p class="mt-1 text-xs text-[var(--muted)]">裁剪、压缩并选择下载格式。</p>
          </div>

          <div v-if="galleryNotice" class="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-800">
            {{ galleryNotice }}
          </div>

          <div class="grid gap-4">
            <section class="rounded-2xl border border-black/5 bg-white/60 p-3">
              <label class="flex items-center gap-2 text-sm font-semibold">
                <input v-model="cropEnabled" type="checkbox" class="h-4 w-4 accent-[#176bff]" />
                启用裁剪
              </label>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <label>
                  <span class="field-label">X</span>
                  <input v-model.number="cropBox.x" class="field-input" type="number" min="0" />
                </label>
                <label>
                  <span class="field-label">Y</span>
                  <input v-model.number="cropBox.y" class="field-input" type="number" min="0" />
                </label>
                <label>
                  <span class="field-label">宽度</span>
                  <input v-model.number="cropBox.width" class="field-input" type="number" min="1" />
                </label>
                <label>
                  <span class="field-label">高度</span>
                  <input v-model.number="cropBox.height" class="field-input" type="number" min="1" />
                </label>
              </div>
              <p class="mt-2 text-xs leading-5 text-[var(--muted)]">裁剪值按原图像素计算，超出范围会在导出时自动收束。</p>
            </section>

            <section class="rounded-2xl border border-black/5 bg-white/60 p-3">
              <label>
                <span class="field-label">导出格式</span>
                <select v-model="exportFormat" class="field-input">
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </label>
              <label class="mt-3 block">
                <span class="field-label">JPG 压缩质量：{{ exportQuality }}%</span>
                <input v-model.number="exportQuality" type="range" min="10" max="100" class="w-full accent-[#176bff]" :disabled="exportFormat === 'png'" />
              </label>
              <p class="mt-2 text-xs leading-5 text-[var(--muted)]">PNG 不使用有损压缩；JPG 会按质量滑块压缩并自动填充白底。</p>
            </section>
          </div>
        </aside>
      </div>
    </section>

    <section v-else class="h-full overflow-auto px-6 pb-8 pt-20">
      <div class="mx-auto grid max-w-[1280px] grid-cols-[320px_1fr] gap-5">
        <aside class="glass-panel h-fit rounded-[18px] p-4">
          <div class="mb-4 flex items-center justify-between">
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
              <p class="mt-2 text-sm leading-6 text-[var(--muted)]">支持自定义服务地址，获取多个模型，并把其中一个设为主模型。</p>
            </div>
            <div class="flex items-center gap-2">
              <button class="secondary-btn w-auto px-4" :disabled="isValidating || draftErrors.length > 0" @click="validateModel">
                <Loader2 v-if="isValidating" :size="15" class="animate-spin" />
                <Activity v-else :size="15" />
                检测
              </button>
              <button class="primary-btn w-auto px-4" :disabled="isSaving || draftErrors.length > 0" @click="saveProfile">
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
              <span v-if="validationResult.latencyMs"> · {{ validationResult.latencyMs }}ms</span>
            </div>

            <div v-if="currentAdapter" class="rounded-xl border border-[#176bff]/15 bg-[#176bff]/5 p-3 text-xs leading-5 text-slate-700">
              <ShieldCheck :size="15" class="mr-1 inline text-[#176bff]" />
              {{ currentAdapter.description }}
            </div>
          </div>
        </section>
      </div>
    </section>

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
