<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Copy, Download, Library, RotateCcw, Sparkles, Upload, WandSparkles } from 'lucide-vue-next'
import { aspectPresets, defaultCoverPresets, modeDescriptions, modeLabels, stylePresets } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { GeneratedAsset, GenerationMode, PromptItem } from '@/types/domain'

const route = useRoute()
const store = useAppStore()

const mode = ref<GenerationMode>('txt2img')
const prompt = ref('')
const negativePrompt = ref('低清晰度、变形、文字水印、错误构图')
const style = ref('自然')
const width = ref(1024)
const height = ref(1024)
const batchSize = ref(4)
const steps = ref(28)
const seed = ref(128409)
const referenceImage = ref('')
const selectedAsset = ref<GeneratedAsset | null>(null)
const generating = ref(false)
const promptModalOpen = ref(false)
const libraryOpen = ref(false)
const exportOpen = ref(false)
const promptSearch = ref('')

const currentModeLabel = computed(() => modeLabels[mode.value])
const primaryModel = computed(() => store.primaryImageModel)
const visiblePrompts = computed(() => {
  const keyword = promptSearch.value.trim().toLowerCase()
  return store.prompts.filter((item) => !keyword || `${item.title} ${item.prompt} ${item.category}`.toLowerCase().includes(keyword)).slice(0, 24)
})
const currentAssets = computed(() => store.recentTasks.find((task) => task.assets.some((asset) => asset.id === selectedAsset.value?.id))?.assets ?? store.recentTasks[0]?.assets ?? [])

watch(prompt, (value) => store.setActivePrompt(value))
watch(() => store.activePrompt, (value) => {
  if (value && value !== prompt.value) prompt.value = value
})

onMounted(() => {
  mode.value = store.resolveMode(String(route.query.mode ?? 'txt2img'))
  store.setMode(mode.value)
  const queryPrompt = typeof route.query.prompt === 'string' ? route.query.prompt : ''
  if (queryPrompt) prompt.value = queryPrompt
  else if (store.activePrompt) prompt.value = store.activePrompt

  const presetId = typeof route.query.preset === 'string' ? route.query.preset : ''
  const preset = [...defaultCoverPresets, ...store.coverPresets].find((item) => item.id === presetId)
  if (preset) {
    width.value = preset.width
    height.value = preset.height
  }
})

function setMode(next: GenerationMode): void {
  mode.value = next
  store.setMode(next)
  if (next === 'cover') {
    const xhs = defaultCoverPresets[0]
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

async function generate(): Promise<void> {
  generating.value = true
  try {
    const task = await store.generate({
      mode: mode.value,
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
      modelId: primaryModel.value?.id ?? 'local-preview',
      width: width.value,
      height: height.value,
      batchSize: batchSize.value,
      steps: steps.value,
      seed: seed.value,
      style: style.value,
      referenceImage: referenceImage.value,
    })
    selectedAsset.value = task.assets[0] ?? null
  } catch (error) {
    store.notify(error instanceof Error ? error.message : '生成失败', 'error')
  } finally {
    window.setTimeout(() => {
      generating.value = false
    }, 650)
  }
}

function handleReference(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    referenceImage.value = String(reader.result)
    store.notify('参考图已加载')
  }
  reader.readAsDataURL(file)
}

async function copyPrompt(): Promise<void> {
  await navigator.clipboard?.writeText(prompt.value)
  store.notify('提示词已复制')
}

async function downloadSelected(): Promise<void> {
  if (!selectedAsset.value) {
    store.notify('请先选择结果', 'error')
    return
  }
  await store.downloadAsset(selectedAsset.value)
  exportOpen.value = false
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
          <div class="btn-row">
            <button class="btn-soft" type="button" @click="promptModalOpen = true">编辑</button>
            <button class="btn-soft" type="button" @click="libraryOpen = true">
              <Library :size="15" />
              词库
            </button>
            <button class="btn-soft" type="button" @click="prompt += prompt ? '，画面层次清晰，主体明确，细节丰富。' : '高质量图像，画面层次清晰，主体明确，细节丰富。'">
              <Sparkles :size="15" />
              润色
            </button>
            <button class="btn-soft" type="button" @click="prompt = ''">
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
          <label class="upload-box">
            <Upload :size="18" />
            <span>{{ referenceImage ? '参考图已载入，点击替换' : '上传参考图或拖入素材' }}</span>
            <input type="file" accept="image/*" hidden @change="handleReference" />
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
              <p class="muted">{{ width }} x {{ height }} · {{ style }} · {{ primaryModel?.name }}</p>
            </div>
            <div class="btn-row">
              <button class="btn-soft" type="button" @click="copyPrompt">
                <Copy :size="15" />
                复制提示词
              </button>
              <button class="btn-soft" type="button" @click="mode = 'img2img'; referenceImage = selectedAsset?.dataUrl ?? referenceImage">作为参考图</button>
              <button class="btn-primary" type="button" @click="exportOpen = true">
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
            <label>图像模型</label>
            <select :value="primaryModel?.id">
              <option v-for="model in store.imageModels" :key="model.id" :value="model.id">{{ model.name }} / {{ model.model }}</option>
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
              <label>宽度</label>
              <input v-model.number="width" type="number" min="128" max="4096" />
            </div>
            <div class="field">
              <label>高度</label>
              <input v-model.number="height" type="number" min="128" max="4096" />
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
          <button class="btn-soft" type="button" @click="libraryOpen = true">从词库选择</button>
          <button class="btn-primary" type="button" @click="promptModalOpen = false">应用到工作台</button>
        </div>
      </div>
    </div>

    <div v-if="libraryOpen" class="modal-overlay" @click.self="libraryOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>提示词库</h2>
            <p class="muted">选择提示词，一键应用到当前工作台。</p>
          </div>
          <button class="btn-icon" type="button" @click="libraryOpen = false">×</button>
        </div>
        <div class="modal-body stack">
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
            <label>导出目录</label>
            <input v-model="store.settings.defaultOutputDir" />
          </div>
          <div class="field">
            <label>格式</label>
            <select>
              <option>SVG 本地预览</option>
              <option>PNG</option>
              <option>JPG</option>
              <option>WEBP</option>
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
    grid-template-columns: 300px 1fr;
  }

  .workspace-pane:last-child {
    display: none;
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
}
</style>
