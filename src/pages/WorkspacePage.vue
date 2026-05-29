<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Copy, Download, FolderOpen, Library, RotateCcw, Sparkles, Upload, WandSparkles } from 'lucide-vue-next'
import { aspectPresets, exportFormatOptions, modeDescriptions, modeLabels, stylePresets, toolEntries } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/tauri'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask, PromptItem } from '@/types/domain'

const route = useRoute()
const store = useAppStore()

const mode = ref<GenerationMode>('txt2img')
const prompt = ref('')
const negativePrompt = ref('低清晰度、变形、文字水印、错误构图')
const style = ref(store.settings.defaultStyle)
const width = ref(store.settings.defaultGenerationSize)
const height = ref(store.settings.defaultGenerationSize)
const batchSize = ref(store.settings.defaultBatchSize)
const steps = ref(28)
const seed = ref(128409)
const creativity = ref(64)
const detailLevel = ref(72)
const imageStrength = ref(55)
const resizeMode = ref('just-resize')
const iconBackground = ref('transparent')
const depthStrength = ref(78)
const gifDuration = ref(4)
const selectedModelId = ref('')
const selectedTextModelId = ref('')
const referenceImage = ref('')
const currentTask = ref<GenerationTask | null>(null)
const selectedAsset = ref<GeneratedAsset | null>(null)
const generating = ref(false)
const promptModalOpen = ref(false)
const libraryOpen = ref(false)
const exportOpen = ref(false)
const promptSearch = ref('')
const promptCategory = ref('全部')
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)
const exportScale = ref(1)
const retryNotice = ref('')
const referenceInput = ref<HTMLInputElement | null>(null)

const currentModeLabel = computed(() => modeLabels[mode.value])
const modeFlowCopy = computed(() => {
  const flowCopy: Record<GenerationMode, string> = {
    txt2img: '文生图读取正向/反向提示词与风格预设，结合模型、尺寸和批量参数生成多张结果。',
    img2img: '图生图读取参考图、正向提示词与图片强度，保留主体结构并输出新的风格变体。',
    cover: '封面图读取平台尺寸、标题提示词与风格预设，生成适配自媒体平台的封面。',
    icon: 'ICON 读取品牌描述、输出尺寸和背景策略，生成适合应用或网站的图标。',
    '3d': '3D 图读取产品描述、立体感和材质提示，生成具备空间深度的概念图。',
    gif: 'GIF 动图读取提示词、时长和循环动作描述，生成短循环动画结果。',
  }
  return flowCopy[mode.value]
})
const defaultModel = computed(() => store.defaultImageModel)
const selectedModel = computed(() => store.imageModels.find((model) => model.id === selectedModelId.value) ?? defaultModel.value)
const selectedTextModel = computed(() => store.textModels.find((model) => model.id === selectedTextModelId.value) ?? store.primaryTextModel)
const promptCategories = computed(() => ['全部', ...Array.from(new Set(store.prompts.map((item) => item.category).filter(Boolean)))])
const visiblePrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts
    .filter((item) => promptCategory.value === '全部' || item.category === promptCategory.value || item.subCategory === promptCategory.value)
    .filter((item) => !keyword || `${item.title} ${item.prompt} ${item.category}`.toLowerCase().includes(keyword))
    .slice(0, 24)
})
const currentAssets = computed(() => currentTask.value?.assets ?? store.recentTasks[0]?.assets ?? [])
const modeOptions = computed<Record<string, string | number | boolean>>(() => {
  const options: Record<string, string | number | boolean> = {}
  if (mode.value === 'txt2img') {
    options.creativity = creativity.value
    options.detailLevel = detailLevel.value
  } else if (mode.value === 'img2img') {
    options.imageStrength = imageStrength.value
    options.resizeMode = resizeMode.value
  } else if (mode.value === 'icon') {
    options.background = iconBackground.value
  } else if (mode.value === '3d') {
    options.depthStrength = depthStrength.value
  } else if (mode.value === 'gif') {
    options.durationSeconds = gifDuration.value
  }
  return options
})

watch(prompt, (value) => store.setActivePrompt(value))
watch(() => store.activePrompt, (value) => {
  if (value && value !== prompt.value) prompt.value = value
})
watch(defaultModel, (value) => {
  if (!selectedModelId.value || !store.imageModels.some((model) => model.id === selectedModelId.value)) {
    selectedModelId.value = value?.id ?? ''
  }
})

function routeString(name: string): string {
  const value = route.query[name]
  return typeof value === 'string' ? value : ''
}

function routeInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = routeString(name)
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

onMounted(() => {
  selectedModelId.value = defaultModel.value?.id ?? ''
  selectedTextModelId.value = selectedTextModel.value?.id ?? ''
  mode.value = store.resolveMode(routeString('mode') || 'txt2img')
  store.setMode(mode.value)
  const toolId = routeString('tool')
  const selectedTool = toolEntries.find((item) => item.id === toolId)
  const queryPrompt = routeString('prompt')
  if (queryPrompt) prompt.value = queryPrompt
  else if (selectedTool) prompt.value = selectedTool.promptSeed
  else if (store.activePrompt) prompt.value = store.activePrompt

  const queryNegativePrompt = routeString('negativePrompt')
  if (queryNegativePrompt) negativePrompt.value = queryNegativePrompt

  const queryStyle = routeString('style')
  if (queryStyle && stylePresets.includes(queryStyle)) style.value = queryStyle
  else if (selectedTool?.style && stylePresets.includes(selectedTool.style)) style.value = selectedTool.style

  const queryModelId = routeString('modelId')
  if (queryModelId && store.imageModels.some((model) => model.id === queryModelId)) selectedModelId.value = queryModelId
  if (routeString('retryTaskId')) retryNotice.value = '已载入失败任务参数，可重新生成'

  const presetId = routeString('preset') || selectedTool?.preset || ''
  const preset = store.coverPresets.find((item) => item.id === presetId)
  if (preset) {
    width.value = preset.width
    height.value = preset.height
  }

  width.value = routeInteger('width', width.value, 128, 4096)
  height.value = routeInteger('height', height.value, 128, 4096)
  batchSize.value = routeInteger('batchSize', batchSize.value, 1, 4)
  steps.value = routeInteger('steps', steps.value, 1, 80)
  seed.value = routeInteger('seed', seed.value, 0, 999999999)
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('paste', handlePaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('paste', handlePaste)
})

function setMode(next: GenerationMode): void {
  mode.value = next
  store.setMode(next)
  if (next === 'cover') {
    const xhs = store.enabledCoverPresets[0] ?? store.coverPresets[0]
    width.value = xhs.width
    height.value = xhs.height
  }
}

function applyAspect(preset: { width: number; height: number }): void {
  width.value = preset.width
  height.value = preset.height
}

function applyPrompt(item: PromptItem): void {
  prompt.value = item.prompt
  store.usePrompt(item)
  libraryOpen.value = false
}

function openPromptLibrary(): void {
  promptCategory.value = '全部'
  promptSearch.value = ''
  libraryOpen.value = true
}

function polishPrompt(): void {
  const source = prompt.value.trim()
  if (!source) {
    prompt.value = `高质量${currentModeLabel.value}，主体明确，${style.value}风格，画面层次清晰，细节丰富。`
    store.notify('已生成基础提示词')
    return
  }

  const modelName = selectedTextModel.value?.name ?? '本地文本润色'
  prompt.value = [
    source,
    `${style.value}风格`,
    '主体明确，构图稳定，光线层次清晰，材质细节丰富',
    `适合${currentModeLabel.value}输出`,
    `由 ${modelName} 润色`,
  ].join('，')
  store.notify(`已使用 ${modelName} 润色提示词`)
}

function clearPrompt(): void {
  prompt.value = ''
}

function handleShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey) return

  const key = event.key.toLowerCase()
  if (key === 'enter') {
    event.preventDefault()
    void generate()
    return
  }
  if (key === 'd') {
    event.preventDefault()
    clearPrompt()
    return
  }
  if (event.shiftKey && key === 'r') {
    event.preventDefault()
    polishPrompt()
    return
  }
  if (event.shiftKey && key === 'c') {
    event.preventDefault()
    void copySelectedResult()
    return
  }
  if (key === 'l') {
    event.preventDefault()
    openPromptLibrary()
    return
  }
  if (key === 's') {
    event.preventDefault()
    openExportDialog()
    return
  }
  if (key === 'u') {
    event.preventDefault()
    setMode('img2img')
    openReferencePicker()
  }
}

async function generate(): Promise<void> {
  generating.value = true
  try {
    const task = await store.generate({
      mode: mode.value,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
      modelId: selectedModel.value?.id ?? 'local-preview',
      width: width.value,
      height: height.value,
      batchSize: batchSize.value,
      steps: steps.value,
      seed: seed.value,
      style: style.value,
      referenceImage: referenceImage.value,
      modeOptions: modeOptions.value,
    })
    currentTask.value = task
    selectedAsset.value = task.assets[0] ?? null
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '生成失败', 'error')
  } finally {
    window.setTimeout(() => {
      generating.value = false
    }, 650)
  }
}

function openReferencePicker(): void {
  referenceInput.value?.click()
}

function loadReferenceFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    store.notify('请选择图片文件作为参考图', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    referenceImage.value = String(reader.result)
    store.notify('参考图已加载')
  }
  reader.readAsDataURL(file)
}

function handleReference(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) loadReferenceFile(file)
  input.value = ''
}

function handleReferenceDrop(event: DragEvent): void {
  const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) {
    store.notify('请拖入图片文件作为参考图', 'error')
    return
  }

  setMode('img2img')
  loadReferenceFile(file)
}

function handlePaste(event: ClipboardEvent): void {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
  if (!file) return
  event.preventDefault()
  setMode('img2img')
  loadReferenceFile(file)
}

function reuseSelectedAsReference(): void {
  const asset = selectedAsset.value ?? currentAssets.value[0]
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }
  setMode('img2img')
  referenceImage.value = asset.dataUrl
  store.notify('已将结果作为参考图')
}

async function copySelectedResult(): Promise<void> {
  const asset = selectedAsset.value ?? currentAssets.value[0]
  if (!asset) {
    store.notify('请先生成或选择结果', 'error')
    return
  }

  const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  if (!writeText) {
    store.notify('当前环境不支持复制结果图', 'error')
    return
  }

  try {
    await writeText(asset.dataUrl)
    store.notify('结果图已复制')
  } catch {
    store.notify('复制结果图失败', 'error')
  }
}

async function downloadSelected(): Promise<void> {
  if (!selectedAsset.value) {
    store.notify('请先选择结果', 'error')
    return
  }
  await store.downloadAsset(selectedAsset.value, exportFormat.value, exportScale.value, currentTask.value ?? undefined)
  exportOpen.value = false
}

function openExportDialog(): void {
  exportFormat.value = store.settings.defaultExportFormat
  exportScale.value = 1
  exportOpen.value = true
}

async function chooseWorkspaceExportDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.settings.defaultOutputDir = directory
  store.notify(`已选择导出目录：${directory}`)
}
</script>

<template>
  <div class="page-full workspace-page">
    <section class="workspace-grid">
      <aside class="workspace-pane">
        <div class="block">
          <div class="title-row">
            <strong>选择任务</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="mode-grid">
            <button
              v-for="(label, key) in modeLabels"
              :key="key"
              class="select-card mode-card"
              :class="{ active: mode === key }"
              type="button"
              @click="setMode(key as GenerationMode)"
            >
              <span>{{ label }}</span>
              <small>{{ modeDescriptions[key as GenerationMode] }}</small>
            </button>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>正向提示词</strong>
            <span>{{ prompt.length }} 字</span>
          </div>
          <button class="prompt-preview" type="button" @click="promptModalOpen = true">
            {{ prompt || '点击打开大编辑器，输入主题、构图、风格、镜头、颜色和平台用途。' }}
          </button>
          <p v-if="retryNotice" class="retry-notice">{{ retryNotice }}</p>
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="promptModalOpen = true">编辑</button>
            <button class="btn-soft" type="button" @click="openPromptLibrary">
              <Library :size="15" />
              词库
            </button>
            <button class="btn-soft" type="button" @click="polishPrompt">
              <Sparkles :size="15" />
              润色
            </button>
            <button class="btn-soft" type="button" @click="clearPrompt">
              <RotateCcw :size="15" />
              清空
            </button>
          </div>
          <div class="field">
            <label>反向提示词</label>
            <textarea v-model="negativePrompt" rows="3" />
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>参考素材</strong>
            <span>{{ mode === 'img2img' ? '必填建议' : '可选' }}</span>
          </div>
          <label class="upload-box" @dragover.prevent @drop.prevent="handleReferenceDrop">
            <Upload :size="18" />
            <span>{{ referenceImage ? '参考图已载入，点击替换' : '上传参考图或拖入素材' }}</span>
            <input ref="referenceInput" type="file" accept="image/*" hidden @change="handleReference" />
          </label>
          <img v-if="referenceImage" class="reference-preview" :src="referenceImage" alt="参考图预览" />
        </div>

        <div class="block">
          <div class="title-row">
            <strong>风格预设</strong>
            <span>可切换</span>
          </div>
          <div class="chip-grid">
            <button v-for="item in stylePresets" :key="item" class="chip-button" :class="{ active: style === item }" type="button" @click="style = item">
              {{ item }}
            </button>
          </div>
        </div>
      </aside>

      <section class="workspace-center">
        <div class="flow-row">
          <span class="active">1 输入</span>
          <span>2 参数</span>
          <span :class="{ active: generating }">3 生成</span>
          <span :class="{ active: selectedAsset }">4 导出</span>
        </div>

        <div class="result-card">
          <div class="result-head">
            <div>
              <h1>生成结果预览</h1>
              <p class="muted">本地预览模型会生成 SVG 占位结果；配置真实模型后由 Rust/Tauri 命令接管。</p>
            </div>
            <span class="chip accent">{{ currentAssets.length || batchSize }} 个结果</span>
          </div>
          <div class="stage">
            <div v-if="generating" class="generating">
              <div class="shimmer" />
              <strong>正在调用生成流程...</strong>
              <p class="muted">校验提示词、组合参数并写入历史</p>
            </div>
            <div v-else-if="currentAssets.length" class="samples">
              <button
                v-for="asset in currentAssets"
                :key="asset.id"
                class="sample"
                :class="{ selected: selectedAsset?.id === asset.id }"
                type="button"
                @click="selectedAsset = asset"
              >
                <img :src="asset.dataUrl" :alt="asset.title" />
                <span>{{ asset.title }}</span>
              </button>
            </div>
            <div v-else class="empty-stage">
              <WandSparkles :size="42" />
              <strong>准备生成</strong>
              <p>输入提示词后点击“生成新结果”。</p>
            </div>
          </div>
          <div class="result-foot">
            <div>
              <strong>{{ selectedAsset ? `已选择：${selectedAsset.title}` : '尚未选择结果' }}</strong>
              <p class="muted">{{ width }} x {{ height }} · {{ style }} · {{ selectedModel?.name }}</p>
            </div>
            <div class="btn-row">
              <button class="btn-soft" type="button" @click="copySelectedResult">
                <Copy :size="15" />
                复制结果图
              </button>
              <button class="btn-soft" type="button" @click="reuseSelectedAsReference">作为参考图</button>
              <button class="btn-primary" type="button" @click="openExportDialog">
                <Download :size="15" />
                导出
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside class="workspace-pane">
        <div class="block">
          <div class="title-row">
            <strong>参数与导出</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="field">
            <label for="workspace-image-model">图像模型</label>
            <select id="workspace-image-model" v-model="selectedModelId">
              <option v-for="model in store.imageModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
            </select>
          </div>
          <div class="field">
            <label for="workspace-text-model">文本润色模型</label>
            <select id="workspace-text-model" v-model="selectedTextModelId">
              <option v-for="model in store.textModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model || '未配置模型 ID' }}</option>
            </select>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>输出尺寸</strong>
            <span>{{ width }} x {{ height }}</span>
          </div>
          <div class="chip-grid">
            <button v-for="preset in aspectPresets" :key="preset.id" class="chip-button" type="button" @click="applyAspect(preset)">
              {{ preset.name }}
            </button>
          </div>
          <div class="param-two">
            <div class="field">
              <label for="workspace-width">宽度</label>
              <input id="workspace-width" v-model.number="width" type="number" min="128" max="4096" />
            </div>
            <div class="field">
              <label for="workspace-height">高度</label>
              <input id="workspace-height" v-model.number="height" type="number" min="128" max="4096" />
            </div>
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>生成控制</strong>
            <span>本地保存</span>
          </div>
          <div class="range-row"><span>批量</span><input v-model.number="batchSize" type="range" min="1" max="4" /><b>{{ batchSize }}</b></div>
          <div class="range-row"><span>步数</span><input v-model.number="steps" type="range" min="1" max="80" /><b>{{ steps }}</b></div>
          <div class="field">
            <label>Seed</label>
            <input v-model.number="seed" type="number" />
          </div>
        </div>

        <div class="block">
          <div class="title-row">
            <strong>模式专属</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <template v-if="mode === 'txt2img'">
            <div class="range-row"><label for="workspace-creativity">创意度</label><input id="workspace-creativity" v-model.number="creativity" type="range" min="0" max="100" /><b>{{ creativity }}</b></div>
            <div class="range-row"><label for="workspace-detail-level">细节</label><input id="workspace-detail-level" v-model.number="detailLevel" type="range" min="0" max="100" /><b>{{ detailLevel }}</b></div>
          </template>
          <template v-else-if="mode === 'img2img'">
            <div class="range-row"><label for="workspace-image-strength">图片强度</label><input id="workspace-image-strength" v-model.number="imageStrength" type="range" min="0" max="100" /><b>{{ imageStrength }}</b></div>
            <div class="field">
              <label for="workspace-resize-mode">Resize Mode</label>
              <select id="workspace-resize-mode" v-model="resizeMode">
                <option value="just-resize">Just resize</option>
                <option value="crop-resize">Crop and resize</option>
                <option value="resize-fill">Resize and fill</option>
              </select>
            </div>
          </template>
          <template v-else-if="mode === 'icon'">
            <div class="chip-grid">
              <button class="chip-button" :class="{ active: iconBackground === 'transparent' }" type="button" @click="iconBackground = 'transparent'">透明底</button>
              <button class="chip-button" :class="{ active: iconBackground === 'rounded' }" type="button" @click="iconBackground = 'rounded'">圆角底</button>
              <button class="chip-button" :class="{ active: iconBackground === 'solid' }" type="button" @click="iconBackground = 'solid'">纯色底</button>
            </div>
          </template>
          <template v-else-if="mode === '3d'">
            <div class="range-row"><label for="workspace-depth-strength">立体感</label><input id="workspace-depth-strength" v-model.number="depthStrength" type="range" min="0" max="100" /><b>{{ depthStrength }}</b></div>
          </template>
          <template v-else-if="mode === 'gif'">
            <div class="range-row"><label for="workspace-gif-duration">时长</label><input id="workspace-gif-duration" v-model.number="gifDuration" type="range" min="2" max="8" /><b>{{ gifDuration }}s</b></div>
          </template>
          <template v-else>
            <p class="muted">封面图使用输出尺寸和风格预设控制平台效果。</p>
          </template>
        </div>

        <div class="block mode-flow-block">
          <div class="title-row">
            <strong>数据流说明</strong>
            <span>{{ currentModeLabel }}</span>
          </div>
          <p class="muted">{{ modeFlowCopy }}</p>
        </div>

        <button class="generate-btn btn-primary" type="button" @click="generate">
          <WandSparkles :size="17" />
          生成新结果
        </button>
      </aside>
    </section>

    <div v-if="promptModalOpen" class="modal-overlay" @click.self="promptModalOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>编辑正向提示词</h2>
            <p class="muted">推荐结构：主体 + 场景 + 风格 + 构图 + 色彩 + 用途。</p>
          </div>
          <button class="btn-icon" type="button" @click="promptModalOpen = false">×</button>
        </div>
        <div class="modal-body">
          <textarea v-model="prompt" rows="12" placeholder="输入更完整的正向提示词" />
        </div>
        <div class="modal-foot">
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="openPromptLibrary">从词库选择</button>
            <button class="btn-soft" type="button" @click="polishPrompt">AI 润色</button>
            <button class="btn-soft" type="button" @click="clearPrompt">清空</button>
          </div>
          <button class="btn-primary" type="button" @click="promptModalOpen = false">应用到工作台</button>
        </div>
      </div>
    </div>

    <div v-if="libraryOpen" class="modal-overlay" @click.self="libraryOpen = false">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="prompt-library-title">
        <div class="modal-head">
          <div>
            <h2 id="prompt-library-title">提示词库</h2>
            <p class="muted">选择提示词，一键应用到当前工作台。</p>
          </div>
          <button class="btn-icon" type="button" @click="libraryOpen = false">×</button>
        </div>
        <div class="modal-body">
          <div class="library-grid">
            <aside class="library-categories" aria-label="提示词分类">
              <button
                v-for="category in promptCategories"
                :key="category"
                class="category-button"
                :class="{ active: promptCategory === category }"
                type="button"
                @click="promptCategory = category"
              >
                {{ category }}
              </button>
            </aside>
            <main class="library-main">
              <input v-model="promptSearch" placeholder="搜索提示词" />
              <div class="prompt-list">
                <article v-for="item in visiblePrompts" :key="item.id" class="prompt-item">
                  <div>
                    <div class="inline"><strong>{{ item.title }}</strong><span class="chip">{{ item.source }}</span><span class="chip accent">{{ item.category }}</span></div>
                    <p>{{ item.prompt }}</p>
                  </div>
                  <button class="btn-primary btn-sm" type="button" @click="applyPrompt(item)">使用</button>
                </article>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>

    <div v-if="exportOpen" class="modal-overlay" @click.self="exportOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>导出结果</h2>
            <p class="muted">浏览器预览会保存到下载目录；桌面版会使用设置中的默认输出目录。</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="workspace-export-dir">导出目录</label>
            <div class="directory-picker">
              <input id="workspace-export-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseWorkspaceExportDir">
                <FolderOpen :size="16" />
                重新选择目录
              </button>
            </div>
          </div>
          <div class="field">
            <label for="workspace-export-format">格式</label>
            <select id="workspace-export-format" v-model="exportFormat">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="field">
            <label for="workspace-export-scale">倍率</label>
            <select id="workspace-export-scale" v-model.number="exportScale">
              <option :value="1">1x 原尺寸</option>
              <option :value="2">2x 高清</option>
              <option :value="4">4x 超清</option>
            </select>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-primary" type="button" @click="downloadSelected">导出图片</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  padding: 0;
}

.workspace-grid {
  height: calc(100vh - var(--titlebar-h) - 72px - var(--app-topbar-h));
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr) 310px;
  overflow: hidden;
}

.workspace-pane {
  background: rgba(255, 255, 255, .045);
  overflow: auto;
  backdrop-filter: blur(18px);
}

.workspace-pane:first-child {
  border-right: 1px solid var(--border);
}

.workspace-pane:last-child {
  border-left: 1px solid var(--border);
}

.block {
  padding: 16px;
  border-bottom: 1px solid var(--border-soft);
  display: grid;
  gap: 12px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.title-row strong {
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 14px;
}

.mode-grid,
.chip-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.select-card,
.chip-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, .045);
  color: var(--fg-2);
}

.mode-card {
  min-height: 74px;
  display: grid;
  place-items: center;
  padding: 8px;
  text-align: center;
}

.mode-card small {
  display: none;
}

.select-card.active,
.chip-button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.prompt-preview {
  min-height: 128px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg);
  color: var(--fg-2);
  text-align: left;
  line-height: 1.6;
}

.retry-notice {
  margin-top: -4px;
  color: var(--accent);
  font-size: 12px;
}

.upload-box {
  min-height: 92px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  gap: 8px;
  color: var(--muted);
  cursor: pointer;
}

.reference-preview {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.mode-flow-block p {
  line-height: 1.65;
}

.chip-button {
  min-height: 36px;
  padding: 7px;
}

.workspace-center {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.flow-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.flow-row span {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--surface);
  color: var(--fg-2);
}

.flow-row .active {
  color: var(--accent);
  border-color: var(--accent);
}

.result-card {
  margin: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--elev-raised);
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.result-head,
.result-foot {
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.result-head {
  border-bottom: 1px solid var(--border-soft);
}

.stage {
  min-height: 430px;
  display: grid;
  place-items: center;
  padding: 18px;
  background: radial-gradient(circle at 20% 10%, rgba(87, 166, 255, .14), transparent 30%), rgba(255, 255, 255, .025);
}

.samples {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.sample {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
  text-align: left;
}

.sample.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--border-glow);
}

.sample img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.sample span {
  display: block;
  padding: 10px 12px;
  font-weight: 650;
}

.generating,
.empty-stage {
  display: grid;
  place-items: center;
  gap: 12px;
  text-align: center;
  color: var(--fg-2);
}

.shimmer {
  width: min(540px, 70vw);
  height: 300px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: linear-gradient(110deg, var(--surface-2), var(--surface), var(--surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}

@keyframes shimmer {
  to {
    background-position-x: -200%;
  }
}

.result-foot {
  border-top: 1px solid var(--border-soft);
}

.param-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.range-row {
  display: grid;
  grid-template-columns: 64px 1fr 36px;
  gap: 10px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}

.generate-btn {
  margin: 16px;
  width: calc(100% - 32px);
}

.prompt-list {
  display: grid;
  gap: 10px;
}

.library-grid {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 14px;
}

.library-categories {
  display: grid;
  align-content: start;
  gap: 6px;
}

.category-button {
  min-height: 34px;
  padding: 7px 10px;
  color: var(--fg-2);
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.category-button.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.library-main {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.prompt-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(6, 10, 18, .38);
}

.prompt-item p {
  margin-top: 6px;
  color: var(--fg-2);
}

@media (max-width: 1180px) {
  .workspace-grid {
    height: auto;
    min-height: calc(100vh - var(--titlebar-h) - 72px - var(--app-topbar-h));
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
    overflow: visible;
  }

  .workspace-pane:last-child {
    display: block;
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--border);
  }

  .workspace-center {
    overflow: visible;
  }
}

@media (max-width: 820px) {
  .workspace-grid {
    height: auto;
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .workspace-center {
    overflow: visible;
  }

  .library-grid {
    grid-template-columns: 1fr;
  }

  .library-categories {
    display: flex;
    overflow-x: auto;
  }

  .category-button {
    white-space: nowrap;
  }
}
</style>
