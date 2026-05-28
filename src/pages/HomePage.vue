<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ImagePlus, ShieldCheck, Sparkles, Settings, WandSparkles } from 'lucide-vue-next'
import { defaultCoverPresets, modeLabels, toolGroups } from '@/data/catalog'
import { useAppStore } from '@/stores/app'
import type { GenerationMode } from '@/types/domain'

const store = useAppStore()
const quickTools = computed(() => toolGroups.flatMap((group) => group.tools).slice(0, 6))
const modelRows = computed(() => store.models.map((model) => ({
  id: model.id,
  name: model.name,
  tag: model.model || (model.provider === 'local-preview' ? '本地预览' : '未设置'),
  status: model.status,
})))

function workspaceLink(mode: GenerationMode) {
  return { path: '/workspace', query: { mode } }
}
</script>

<template>
  <div class="page">
    <section class="home-hero card">
      <div>
        <p class="page-kicker">SamImage 3.0</p>
        <h1 class="page-title">你的私人图像工厂</h1>
        <p class="page-desc">离线优先，配置留在本地；支持文生图、图生图、封面、ICON、3D 和动图工作流。</p>
      </div>
      <RouterLink class="btn-primary" to="/workspace">
        <WandSparkles :size="16" />
        开始创作
      </RouterLink>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />快速开始</h2>
        <span class="mono">{{ quickTools.length }} 工具</span>
      </div>
      <div class="grid grid-3">
        <RouterLink v-for="tool in quickTools" :key="tool.title" class="tool-card" :to="workspaceLink(tool.mode)">
          <span class="icon-tile" :class="{ matcha: tool.mode === 'txt2img', ube: tool.mode === 'img2img', lemon: tool.mode === 'icon', pom: tool.mode === 'gif' }">
            <ImagePlus :size="19" />
          </span>
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.desc }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />本地模型状态</h2>
        <RouterLink class="btn-soft btn-sm" to="/settings">
          <Settings :size="14" />
          配置模型
        </RouterLink>
      </div>
      <div class="card">
        <div class="card-body model-detail">
          <div v-for="model in modelRows" :key="model.id" class="model-row">
            <div>
              <strong>{{ model.name }}</strong>
              <span class="model-tag">{{ model.tag }}</span>
            </div>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: model.status !== 'connected', error: model.status === 'failed' }" />
              {{ model.status === 'connected' ? '已连接' : model.status === 'failed' ? '失败' : '待检测' }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />常用封面预设</h2>
        <RouterLink class="mono" to="/tools">查看全部 -></RouterLink>
      </div>
      <div class="preset-grid">
        <RouterLink
          v-for="preset in defaultCoverPresets"
          :key="preset.id"
          class="preset-btn"
          :to="{ path: '/workspace', query: { mode: 'cover', preset: preset.id } }"
        >
          <span>{{ preset.name }}</span>
          <small>{{ preset.width }} x {{ preset.height }}</small>
        </RouterLink>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />最近生成</h2>
        <RouterLink class="mono" to="/history">查看全部 -></RouterLink>
      </div>
      <div v-if="store.recentTasks.length" class="recent-grid">
        <button v-for="task in store.recentTasks.slice(0, 6)" :key="task.id" class="recent-card" type="button">
          <div class="art-preview recent-thumb">
            <img :src="task.assets[0]?.dataUrl" :alt="task.prompt" />
          </div>
          <div class="recent-meta">
            <span>{{ modeLabels[task.mode] }}</span>
            <small>{{ task.assets.length }} 张</small>
          </div>
          <strong>{{ task.prompt }}</strong>
        </button>
      </div>
      <div v-else class="empty-line card">
        <Sparkles :size="18" />
        <span>还没有生成记录，进入工作台创建第一张图。</span>
      </div>
    </section>

    <section class="privacy-card">
      <ShieldCheck :size="20" />
      <span><strong>本地隐私安全</strong>：配置、提示词和历史记录默认保存在本地，只有主动调用模型 API 时才联网。</span>
    </section>
  </div>
</template>

<style scoped>
.home-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px;
  margin-bottom: 26px;
}

.home-section {
  margin-bottom: 30px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
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

.model-detail {
  display: grid;
  gap: 10px;
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  background: rgba(6, 10, 18, 0.42);
  border-radius: var(--radius-sm);
}

.model-row > div {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.model-tag {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-grid,
.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.preset-btn {
  display: grid;
  gap: 2px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.preset-btn:hover {
  border-color: var(--accent);
}

.preset-btn span {
  font-weight: 650;
}

.preset-btn small,
.recent-meta small {
  color: var(--muted);
  font-family: var(--font-mono);
}

.recent-card {
  overflow: hidden;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.recent-thumb {
  height: 120px;
}

.recent-meta {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px 4px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
}

.recent-card strong {
  display: block;
  padding: 0 12px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.privacy-card,
.empty-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: var(--fg-2);
}

.privacy-card {
  background: rgba(66, 211, 146, 0.08);
  border: 1px solid rgba(66, 211, 146, 0.24);
  border-radius: var(--radius-md);
}
</style>
