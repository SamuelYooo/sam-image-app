<script setup lang="ts">
import {
  CircleHelp,
  ClipboardList,
  Home,
  Images,
  Layers3,
  Settings,
  Wrench,
} from 'lucide-vue-next'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/workspace', label: '工作台', icon: Layers3 },
  { to: '/tools', label: '工具库', icon: Wrench },
  { to: '/history', label: '资产库', icon: Images, badge: computed(() => store.historyAssetCount) },
  { to: '/operations', label: '操作记录', icon: ClipboardList, badge: computed(() => store.tasks.filter((task) => task.status === 'failed').length) },
  { to: '/settings', label: '设置', icon: Settings },
  { to: '/about', label: '关于帮助', icon: CircleHelp },
]

const imageStatus = computed(() => store.primaryImageModel?.status ?? 'untested')
const textStatus = computed(() => store.textModels.some((model) => model.status === 'connected') ? 'connected' : 'untested')

function handleGlobalShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return
  const index = Number(event.key) - 1
  const item = Number.isInteger(index) ? navItems[index] : undefined
  if (!item) return
  event.preventDefault()
  void router.push(item.to)
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalShortcut)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalShortcut)
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">S</span>
        <span class="brand-name">
          <strong>SamImage</strong>
          <span>本地 AI 生图</span>
        </span>
      </RouterLink>

      <div class="sidebar-section">
        <div class="sidebar-label">导航</div>
        <nav class="sidebar-nav">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            class="nav-link"
            :class="{ active: route.path === item.to }"
            :to="item.to"
          >
            <component :is="item.icon" :size="16" />
            {{ item.label }}
            <span v-if="item.badge?.value" class="badge">{{ item.badge.value }}</span>
          </RouterLink>
        </nav>
      </div>

      <div class="sidebar-footer">
        <div class="model-status">
          <div class="model-status-row">
            <strong>图像模型</strong>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: imageStatus !== 'connected' }" />
              {{ imageStatus === 'connected' ? '已连接' : '待配置' }}
            </span>
          </div>
          <div class="model-status-row">
            <strong>文本模型</strong>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: textStatus !== 'connected' }" />
              {{ textStatus === 'connected' ? '已连接' : '未配置' }}
            </span>
          </div>
        </div>
      </div>
    </aside>

    <main class="app-main">
      <div class="app-topbar">
        <div class="breadcrumb">
          <Images :size="16" />
          <strong>SamImage 3.0</strong>
          <span>/</span>
          <span>{{ route.name }}</span>
        </div>
        <div class="topbar-actions">
          <ThemeSwitcher />
        </div>
      </div>

      <slot />
    </main>
  </div>
</template>
