<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CircleHelp, Keyboard, LockKeyhole, Rocket, UserRound } from 'lucide-vue-next'

const tab = ref<'about' | 'help' | 'faq' | 'shortcuts'>('about')
const openFaq = ref(0)

const faqs = [
  ['SamImage 需要联网吗？', '大部分功能不需要联网。只有在调用你配置的模型 API 生成图像时才需要网络连接。'],
  ['支持哪些模型？', '支持本地预览模型，以及 OpenAI 兼容协议的图像和文本模型配置。'],
  ['提示词如何导入？', '在设置的 Prompts 市场中导入 JSON，支持数组、{prompts:[]}、{items:[]} 等常见结构。'],
  ['图片保存在哪里？', '浏览器预览会保存到下载目录；桌面版会使用设置里的默认输出目录。'],
]
</script>

<template>
  <div class="page">
    <section class="about-hero">
      <div class="about-logo">S</div>
      <h1>Sam<span>Image</span> 3.0</h1>
      <p class="version">本地 AI 生图工具 · 离线优先</p>
      <p class="tagline">你的私人图像工厂。配置、提示词和历史记录默认保存在本机。</p>
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
      <article class="privacy-note">
        <LockKeyhole :size="18" />
        <span><strong>隐私承诺</strong>：SamImage 不上传配置、提示词和历史记录。只有主动生成时才向配置的模型 API 发送请求。</span>
      </article>
    </section>

    <section v-else-if="tab === 'help'" class="about-panel step-list">
      <article v-for="(item, index) in ['配置模型', '选择生成模式', '输入提示词', '调整参数并生成', '导出结果']" :key="item" class="step-item">
        <span class="step-num">{{ index + 1 }}</span>
        <div>
          <h3>{{ item }}</h3>
          <p>按照工作台和设置页的引导完成这一环节，所有参数都会进入本地历史，方便复用。</p>
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

    <section v-else class="about-panel shortcut-grid">
      <div v-for="item in ['Ctrl + Enter 生成图像', 'Ctrl + D 清空提示词', 'Ctrl + L 打开提示词库', 'Ctrl + S 导出结果', 'Ctrl + 1 首页', 'Ctrl + 2 工作台']" :key="item" class="shortcut-row">
        <span><Keyboard :size="15" /> {{ item.split(' ').slice(2).join(' ') }}</span>
        <kbd>{{ item.split(' ').slice(0, 2).join(' ') }}</kbd>
      </div>
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

.shortcut-grid {
  grid-template-columns: repeat(2, 1fr);
}

kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 8px;
}
</style>
