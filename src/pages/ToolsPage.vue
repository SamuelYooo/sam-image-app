<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2, Wrench } from 'lucide-vue-next'
import { toolGroups } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import { resolveToolIcon } from '@/domain/icons'
import type { CoverPreset, GenerationMode } from '@/types/domain'
import type { ToolEntry } from '@/data/catalog'

const router = useRouter()
const store = useAppStore()
const modalOpen = ref(false)
const presetName = ref('')
const presetWidth = ref<number | ''>('')
const presetHeight = ref<number | ''>('')
const customCoverPresets = computed(() => store.coverPresets.filter((preset) => preset.custom && preset.enabled))
const presetRatio = computed(() => {
  const width = Math.round(Number(presetWidth.value))
  const height = Math.round(Number(presetHeight.value))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '—'

  const divisor = gcd(width, height)
  return `${width / divisor} : ${height / divisor}`
})
const ratioPreviewStyle = computed(() => {
  const width = Math.round(Number(presetWidth.value))
  const height = Math.round(Number(presetHeight.value))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: '60px', height: '34px' }
  }

  const scale = Math.min(64 / width, 40 / height)
  return {
    width: `${Math.max(12, Math.round(width * scale))}px`,
    height: `${Math.max(12, Math.round(height * scale))}px`,
  }
})

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

function openWorkspace(mode: GenerationMode, preset?: string): void {
  router.push({ path: '/workspace', query: { mode, ...(preset ? { preset } : {}) } })
}

function openPresetModal(): void {
  presetName.value = ''
  presetWidth.value = ''
  presetHeight.value = ''
  modalOpen.value = true
}

function openTool(tool: ToolEntry): void {
  router.push({
    path: '/workspace',
    query: {
      mode: tool.mode,
      tool: tool.id,
      prompt: tool.promptSeed,
      ...(tool.style ? { style: tool.style } : {}),
      ...(tool.preset ? { preset: tool.preset } : {}),
    },
  })
}

function savePreset(): void {
  if (!presetName.value.trim()) {
    store.notify('请输入预设名称', 'error')
    return
  }
  const width = Number(presetWidth.value)
  const height = Number(presetHeight.value)
  const saved = store.addCoverPreset({
    name: presetName.value.trim(),
    width,
    height,
    enabled: true,
  })
  if (!saved) return

  presetName.value = ''
  presetWidth.value = ''
  presetHeight.value = ''
  modalOpen.value = false
}

function removeCustomPreset(preset: CoverPreset): void {
  const confirmed = window.confirm(`确定删除封面预设「${preset.name}」？此操作会移除这个自定义尺寸。`)
  if (!confirmed) return

  store.removeCoverPreset(preset.id)
}
</script>

<template>
  <div class="page-wide">
    <div class="page-header">
      <div>
        <p class="page-kicker">功能目录</p>
        <h1 class="page-title">工具库</h1>
        <p class="page-desc">从提示词生成到图片修复，从 ICON 设计到 GIF 动图，全部围绕本地工作流组织。</p>
      </div>
      <button class="btn-primary" type="button" @click="openWorkspace('txt2img')">
        <Wrench :size="16" />
        进入工作台
      </button>
    </div>

    <section v-for="group in toolGroups" :key="group.id" class="tool-section">
      <div class="section-head">
        <h2><span class="section-dot" :class="group.tone" />{{ group.name }}</h2>
        <span class="badge">{{ group.tools.length }} 项</span>
      </div>
      <div class="grid grid-3">
        <button v-for="tool in group.tools" :key="tool.id" class="tool-card" type="button" @click="openTool(tool)">
          <span class="icon-tile" :class="group.tone">
            <component :is="resolveToolIcon(tool.icon)" :size="20" />
          </span>
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.desc }}</p>
          <span class="tool-arrow">进入 -></span>
        </button>
      </div>
    </section>

    <section class="tool-section">
      <div class="section-head">
        <h2><span class="section-dot pom" />封面预设</h2>
        <button class="btn-soft btn-sm" type="button" @click="openPresetModal">
          <Plus :size="14" />
          自定义
        </button>
      </div>
      <div class="cover-grid">
        <button
          v-for="preset in store.enabledCoverPresets"
          :key="preset.id"
          class="cover-preset"
          type="button"
          @click="openWorkspace('cover', preset.id)"
        >
          <span class="cover-thumb">{{ preset.name.slice(0, 4) }}</span>
          <strong>{{ preset.name }}</strong>
          <small>{{ preset.width }} x {{ preset.height }}</small>
        </button>
        <button class="cover-preset add" type="button" @click="openPresetModal">
          <Plus :size="28" />
          <strong>自定义尺寸</strong>
        </button>
      </div>

      <div v-if="customCoverPresets.length" class="custom-presets">
        <div class="custom-presets-head">
          <h3>自定义封面预设</h3>
          <span>{{ customCoverPresets.length }} 项</span>
        </div>
        <div class="custom-preset-list">
          <article v-for="preset in customCoverPresets" :key="preset.id" class="custom-preset-row">
            <div>
              <strong>{{ preset.name }}</strong>
              <span>{{ preset.width }} x {{ preset.height }}</span>
            </div>
            <div class="btn-row">
              <button class="btn-soft btn-sm" type="button" :aria-label="`使用${preset.name}`" @click="openWorkspace('cover', preset.id)">使用</button>
              <button class="btn-icon" type="button" :aria-label="`删除${preset.name}`" @click="removeCustomPreset(preset)">
                <Trash2 :size="14" />
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <div v-if="modalOpen" class="modal-overlay" @click.self="modalOpen = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>自定义封面预设</h2>
            <p class="muted">添加常用尺寸，快速生成对应封面。</p>
          </div>
          <button class="btn-icon" type="button" @click="modalOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="tools-custom-preset-name">名称</label>
            <input id="tools-custom-preset-name" v-model="presetName" placeholder="例如：抖音横版封面" />
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label for="tools-custom-preset-width">宽度</label>
              <input id="tools-custom-preset-width" v-model.number="presetWidth" type="number" min="128" max="4096" />
            </div>
            <div class="field">
              <label for="tools-custom-preset-height">高度</label>
              <input id="tools-custom-preset-height" v-model.number="presetHeight" type="number" min="128" max="4096" />
            </div>
          </div>
          <div class="ratio-display">
            <span>比例</span>
            <strong>{{ presetRatio }}</strong>
            <i :style="ratioPreviewStyle" aria-hidden="true" />
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="modalOpen = false">取消</button>
          <button class="btn-primary" type="button" @click="savePreset">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-section {
  margin-bottom: 34px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.section-head h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
}

.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.section-dot.matcha {
  background: var(--success);
}

.section-dot.ube {
  background: var(--accent-2);
}

.section-dot.lemon {
  background: var(--warn);
}

.section-dot.pom {
  background: var(--danger);
}

.tool-arrow {
  margin-top: auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.cover-preset {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 16px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.cover-preset:hover {
  border-color: var(--accent);
}

.cover-thumb {
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: white;
  font-weight: 800;
  background: linear-gradient(135deg, #ff4d8d, #ffb86b);
}

.cover-thumb.custom {
  background: linear-gradient(135deg, #57a6ff, #2ee8c8);
}

.cover-preset small {
  color: var(--muted);
  font-family: var(--font-mono);
}

.cover-preset.add {
  min-height: 150px;
  place-items: center;
  text-align: center;
  border-style: dashed;
  color: var(--muted);
}

.ratio-display {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}

.ratio-display strong {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 12px;
}

.ratio-display i {
  display: block;
  border: 2px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
}

.custom-presets {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.custom-presets-head,
.custom-preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.custom-presets-head {
  padding: 12px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-soft);
}

.custom-presets-head h3 {
  font-size: 14px;
  font-weight: 700;
}

.custom-presets-head span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.custom-preset-list {
  display: grid;
}

.custom-preset-row {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-soft);
}

.custom-preset-row:last-child {
  border-bottom: 0;
}

.custom-preset-row div:first-child {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.custom-preset-row span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
}

@media (max-width: 900px) {
  .cover-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
