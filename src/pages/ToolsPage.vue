<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2, Wrench } from 'lucide-vue-next'
import { defaultCoverPresets, toolGroups } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { GenerationMode } from '@/types/domain'

const router = useRouter()
const store = useAppStore()
const modalOpen = ref(false)
const presetName = ref('')
const presetWidth = ref(1080)
const presetHeight = ref(608)

function openWorkspace(mode: GenerationMode, preset?: string): void {
  router.push({ path: '/workspace', query: { mode, ...(preset ? { preset } : {}) } })
}

function savePreset(): void {
  if (!presetName.value.trim()) {
    store.notify('请输入预设名称', 'error')
    return
  }
  store.addCoverPreset({
    name: presetName.value.trim(),
    width: presetWidth.value,
    height: presetHeight.value,
    enabled: true,
  })
  presetName.value = ''
  modalOpen.value = false
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
        <button v-for="tool in group.tools" :key="tool.title" class="tool-card" type="button" @click="openWorkspace(tool.mode)">
          <span class="icon-tile" :class="group.tone">{{ tool.icon.slice(0, 2) }}</span>
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.desc }}</p>
          <span class="tool-arrow">进入 -></span>
        </button>
      </div>
    </section>

    <section class="tool-section">
      <div class="section-head">
        <h2><span class="section-dot pom" />封面预设</h2>
        <button class="btn-soft btn-sm" type="button" @click="modalOpen = true">
          <Plus :size="14" />
          自定义
        </button>
      </div>
      <div class="cover-grid">
        <button v-for="preset in defaultCoverPresets" :key="preset.id" class="cover-preset" type="button" @click="openWorkspace('cover', preset.id)">
          <span class="cover-thumb">{{ preset.name.slice(0, 4) }}</span>
          <strong>{{ preset.name }}</strong>
          <small>{{ preset.width }} x {{ preset.height }}</small>
        </button>
        <button v-for="preset in store.coverPresets.filter((item) => item.custom)" :key="preset.id" class="cover-preset custom-preset" type="button" @click="openWorkspace('cover', preset.id)">
          <span class="cover-thumb custom">{{ preset.name.slice(0, 4) }}</span>
          <strong>{{ preset.name }}</strong>
          <small>{{ preset.width }} x {{ preset.height }}</small>
          <button class="btn-icon delete-btn" type="button" @click.stop="store.removeCoverPreset(preset.id)">
            <Trash2 :size="14" />
          </button>
        </button>
        <button class="cover-preset add" type="button" @click="modalOpen = true">
          <Plus :size="28" />
          <strong>自定义尺寸</strong>
        </button>
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
            <label>名称</label>
            <input v-model="presetName" placeholder="例如：抖音横版封面" />
          </div>
          <div class="grid grid-2">
            <div class="field">
              <label>宽度</label>
              <input v-model.number="presetWidth" type="number" />
            </div>
            <div class="field">
              <label>高度</label>
              <input v-model.number="presetHeight" type="number" />
            </div>
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

.delete-btn {
  position: absolute;
  right: 10px;
  top: 10px;
}

@media (max-width: 900px) {
  .cover-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
