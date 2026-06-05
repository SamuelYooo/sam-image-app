<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CircleHelp, Github, Keyboard, LockKeyhole, Rocket, UserRound } from 'lucide-vue-next'
import { invokeOptional } from '@/services/tauri'

const tab = ref<'about' | 'help' | 'faq' | 'shortcuts'>('about')
const openFaq = ref(0)
const authorGithubUrl = 'https://github.com/SamuelYooo/sam-image-app'

const faqs = [
  ['SamImage 需要联网吗？', '大部分功能不需要联网。只有在调用你配置的模型 API 生成图像时才需要网络连接。'],
  ['支持哪些模型？', '支持 OpenAI 兼容协议的图像模型，以及用于 AI 润色的文本模型。可以配置多个模型并设置主模型。'],
  ['提示词如何导入？', '在设置的 Prompts 市场中同步 glidea/banana-prompt-quicker、EvoLinkAI/awesome-gpt-image-2-API-and-Prompts、freestylefly/awesome-gpt-image-2 等开源仓库，或导入自定义 JSON。支持数组、{prompts:[]}、{items:[]} 等常见结构，并按 source+sourceId 或 content hash 去重。感谢这些开源项目提供的提示词整理与分享。'],
  ['如何添加自定义封面预设？', '在工具库的封面预设区域点击「自定义」，或在设置的系统设置里点击「新增预设」，输入名称、宽度、高度后即可在列表中看到并使用。自定义预设保存在本地，支持随时删除。'],
  ['图片保存在哪里？', '浏览器预览会保存到下载目录；桌面版会使用设置里的默认输出目录。资产库可查看所有生成结果、提示词和参数，并支持重新导出。'],
  ['数据安全吗？', 'SamImage 不收集任何用户数据。API Key 保存在本地，配置、提示词和资产库记录不会上传到任何服务器。只有在生成图像时才会向你配置的模型 API 发送请求。'],
]

const workspaceShortcuts = [
  { action: '生成图像', keys: 'Ctrl + Enter' },
  { action: '清空提示词', keys: 'Ctrl + D' },
  { action: 'AI 润色', keys: 'Ctrl + Shift + R' },
  { action: '复制结果图', keys: 'Ctrl + Shift + C' },
  { action: '打开提示词库', keys: 'Ctrl + L' },
  { action: '上传参考图', keys: 'Ctrl + U' },
  { action: '导出结果', keys: 'Ctrl + S' },
]

const navigationShortcuts = [
  { action: '首页', keys: 'Ctrl + 1' },
  { action: '工作台', keys: 'Ctrl + 2' },
  { action: '工具库', keys: 'Ctrl + 3' },
  { action: '资产库', keys: 'Ctrl + 4' },
  { action: '设置', keys: 'Ctrl + 5' },
  { action: '关于帮助', keys: 'Ctrl + 6' },
]

async function openExternalLink(url: string): Promise<void> {
  const opened = await invokeOptional('plugin:opener|open_url', { url }).catch((error: unknown) => {
    console.warn('Tauri opener failed', error)
    return null
  })
  if (opened !== null) return
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="page">
    <section class="about-hero">
      <div class="about-logo">S</div>
      <h1>Sam<span>Image</span> 3.0</h1>
      <p class="version">本地 AI 生图工具 · 离线优先</p>
      <p class="tagline">你的私人图像工厂。配置、提示词和资产库记录默认保存在本机。</p>
      <div class="btn-row hero-actions">
        <RouterLink class="btn-primary" to="/workspace">
          <Rocket :size="16" />
          进入工作台
        </RouterLink>
        <RouterLink class="btn-soft" to="/settings">模型设置</RouterLink>
      </div>
    </section>

    <div class="about-tabs">
      <button class="about-tab" :class="{ active: tab === 'about' }" type="button" @click="tab = 'about'">关于</button>
      <button class="about-tab" :class="{ active: tab === 'help' }" type="button" @click="tab = 'help'">快速上手</button>
      <button class="about-tab" :class="{ active: tab === 'faq' }" type="button" @click="tab = 'faq'">常见问题</button>
      <button class="about-tab" :class="{ active: tab === 'shortcuts' }" type="button" @click="tab = 'shortcuts'">快捷键</button>
    </div>

    <section v-if="tab === 'about'" class="about-panel">
      <article class="info-card">
        <h2><UserRound :size="17" /> 产品信息</h2>
        <div class="info-row"><span>应用名称</span><strong>SamImage</strong></div>
        <div class="info-row"><span>版本</span><strong>3.0.0</strong></div>
        <div class="info-row"><span>运行模式</span><strong>本地单机 · 离线优先</strong></div>
        <div class="info-row"><span>数据存储</span><strong>SQLite WAL + 本地文件系统</strong></div>
      </article>
      <article class="author-card">
        <div class="author-head">
          <div>
            <h2><UserRound :size="17" /> 作者信息</h2>
            <p>「当了13年技术宅，以为会修电脑就能拯救世界，结果只拯救了自己的体重。」</p>
          </div>
          <button class="btn-soft" type="button" @click="openExternalLink(authorGithubUrl)">
            <Github :size="16" />
            求 star 哦
          </button>
        </div>
        <div class="info-row"><span>作者</span><strong>Samuel游</strong></div>
        <div class="info-row"><span>微信</span><strong>malovoz</strong></div>
        <div class="info-row">
          <span>GitHub</span>
          <button class="author-link" type="button" @click="openExternalLink(authorGithubUrl)">
            {{ authorGithubUrl }}
          </button>
        </div>
      </article>
      <article class="privacy-note">
        <LockKeyhole :size="18" />
        <span><strong>隐私承诺</strong>：SamImage 不上传配置、提示词和资产库记录。API Key 保存在本地，只有主动生成时才向配置的模型 API 发送请求。</span>
      </article>
    </section>

    <section v-else-if="tab === 'help'" class="about-panel step-list">
      <article v-for="(item, index) in ['配置模型', '选择生成模式', '输入提示词', '调整参数并生成', '导出结果']" :key="item" class="step-item">
        <span class="step-num">{{ index + 1 }}</span>
        <div>
          <h3>{{ item }}</h3>
          <p>按照工作台和设置页的引导完成这一环节，所有参数都会进入资产库，方便复用。</p>
        </div>
      </article>
    </section>

    <section v-else-if="tab === 'faq'" class="about-panel faq-list">
      <article v-for="(item, index) in faqs" :key="item[0]" class="faq-item" :class="{ open: openFaq === index }">
        <button type="button" @click="openFaq = openFaq === index ? -1 : index">
          <span><CircleHelp :size="16" /> {{ item[0] }}</span>
          <b>{{ openFaq === index ? '-' : '+' }}</b>
        </button>
        <p v-if="openFaq === index">{{ item[1] }}</p>
      </article>
    </section>

    <section v-else class="about-panel shortcut-panel">
      <article class="shortcut-section">
        <h2>工作台快捷键</h2>
        <div class="shortcut-grid">
          <div v-for="item in workspaceShortcuts" :key="item.keys" class="shortcut-row">
            <span><Keyboard :size="15" /> {{ item.action }}</span>
            <kbd>{{ item.keys }}</kbd>
          </div>
        </div>
      </article>
      <article class="shortcut-section">
        <h2>页面导航</h2>
        <div class="shortcut-grid">
          <div v-for="item in navigationShortcuts" :key="item.keys" class="shortcut-row">
            <span><Keyboard :size="15" /> {{ item.action }}</span>
            <kbd>{{ item.keys }}</kbd>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.about-hero {
  text-align: center;
  padding: 46px 24px 32px;
  border-bottom: 1px solid var(--border);
}

.about-logo {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  color: var(--accent-on);
  display: grid;
  place-items: center;
  margin: 0 auto 18px;
  font-size: 30px;
  font-weight: 900;
  box-shadow: var(--elev-raised);
}

.about-hero h1 {
  font-size: 32px;
  font-weight: 780;
}

.about-hero h1 span {
  color: var(--accent);
}

.version {
  color: var(--muted);
  font-family: var(--font-mono);
}

.tagline {
  max-width: 48ch;
  margin: 12px auto 0;
  color: var(--fg-2);
  font-size: 16px;
}

.hero-actions {
  justify-content: center;
  margin-top: 20px;
}

.about-tabs {
  display: flex;
  gap: 4px;
  width: fit-content;
  margin: 24px 0;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.about-tab {
  padding: 8px 18px;
  border-radius: 8px;
  color: var(--muted);
}

.about-tab.active {
  background: var(--surface-3);
  color: var(--fg);
}

.about-panel {
  display: grid;
  gap: 14px;
  padding-bottom: 36px;
}

.info-card,
.author-card,
.step-item,
.faq-item,
.privacy-note,
.shortcut-row {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
}

.info-card h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.author-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.author-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.author-head p {
  color: var(--fg-2);
  line-height: 1.7;
}

.author-link {
  max-width: min(100%, 420px);
  color: var(--accent);
  text-align: right;
  overflow-wrap: anywhere;
}

.author-link:hover {
  text-decoration: underline;
}

.info-row,
.shortcut-row,
.faq-item button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.info-row {
  padding: 9px 0;
  border-bottom: 1px solid var(--border-soft);
}

.info-row span,
.faq-item p,
.step-item p {
  color: var(--muted);
}

.privacy-note,
.step-item {
  display: flex;
  gap: 14px;
}

.step-num {
  width: 34px;
  height: 34px;
  border-radius: 99px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--accent);
  background: var(--accent-soft);
  font-family: var(--font-mono);
  font-weight: 800;
}

.faq-item button {
  width: 100%;
}

.faq-item button span,
.shortcut-row span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.faq-item p {
  margin-top: 12px;
  line-height: 1.7;
}

.shortcut-panel {
  gap: 18px;
}

.shortcut-section {
  display: grid;
  gap: 12px;
}

.shortcut-section h2 {
  font-size: 14px;
  color: var(--muted);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 8px;
}

@media (max-width: 720px) {
  .author-head {
    align-items: stretch;
    flex-direction: column;
  }

  .author-link {
    text-align: left;
  }
}
</style>
