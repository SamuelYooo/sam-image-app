<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SamImageWorkbench from '../features/workspace/SamImageWorkbench.vue'
import AssetsPage from '../pages/AssetsPage.vue'
import ProjectsPage from '../pages/ProjectsPage.vue'
import PromptsMarketPage from '../pages/PromptsMarketPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import TasksPage from '../pages/TasksPage.vue'
import { animatePageEnter, animatePageLeave, installAppMotion } from '../utils/appMotion'

type AppPage = 'workspace' | 'assets' | 'tasks' | 'projects' | 'prompts' | 'settings'

function getPageFromHash(): AppPage {
  if (typeof window === 'undefined') {
    return 'workspace'
  }
  if (window.location.hash === '#assets') {
    return 'assets'
  }
  if (window.location.hash === '#tasks') {
    return 'tasks'
  }
  if (window.location.hash === '#projects') {
    return 'projects'
  }
  if (window.location.hash === '#prompts') {
    return 'prompts'
  }
  if (window.location.hash === '#settings') {
    return 'settings'
  }
  return 'workspace'
}

const activePage = ref<AppPage>(getPageFromHash())
const activePageComponent = computed(() => {
  if (activePage.value === 'assets') {
    return AssetsPage
  }
  if (activePage.value === 'tasks') {
    return TasksPage
  }
  if (activePage.value === 'projects') {
    return ProjectsPage
  }
  if (activePage.value === 'prompts') {
    return PromptsMarketPage
  }
  if (activePage.value === 'settings') {
    return SettingsPage
  }
  return SamImageWorkbench
})

let teardownAppMotion: (() => void) | null = null

function syncPageFromHash() {
  activePage.value = getPageFromHash()
}

function setActivePage(page: AppPage) {
  activePage.value = page
  if (typeof window === 'undefined') {
    return
  }
  const hash =
    page === 'assets'
      ? '#assets'
      : page === 'tasks'
        ? '#tasks'
        : page === 'projects'
          ? '#projects'
          : page === 'prompts'
            ? '#prompts'
            : page === 'settings'
              ? '#settings'
              : ''
  const nextUrl = `${window.location.pathname}${window.location.search}${hash}`
  window.history.replaceState(null, '', nextUrl)
}

onMounted(() => {
  teardownAppMotion = installAppMotion(document)
  window.addEventListener('hashchange', syncPageFromHash)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncPageFromHash)
  teardownAppMotion?.()
  teardownAppMotion = null
})
</script>

<template>
  <main class="sam-app-shell">
    <nav class="sam-app-nav" aria-label="主导航">
      <div class="sam-app-nav-brand">
        <span class="sam-brand-mark">
          <span class="i-mdi-creation" aria-hidden="true" />
        </span>
        <div>
          <strong>SamImage 2.0</strong>
          <span>创作内核</span>
        </div>
      </div>
      <div class="sam-app-nav-tabs">
        <button type="button" :class="{ active: activePage === 'workspace' }" @click="setActivePage('workspace')">
          工作台
        </button>
        <button type="button" :class="{ active: activePage === 'assets' }" @click="setActivePage('assets')">
          资产库
        </button>
        <button type="button" :class="{ active: activePage === 'tasks' }" @click="setActivePage('tasks')">任务</button>
        <button type="button" :class="{ active: activePage === 'projects' }" @click="setActivePage('projects')">
          项目
        </button>
        <button type="button" :class="{ active: activePage === 'prompts' }" @click="setActivePage('prompts')">
          提示词
        </button>
        <button type="button" :class="{ active: activePage === 'settings' }" @click="setActivePage('settings')">
          设置
        </button>
      </div>
    </nav>

    <Transition appear mode="out-in" :css="false" @enter="animatePageEnter" @leave="animatePageLeave">
      <section :key="activePage" class="sam-page-motion">
        <component :is="activePageComponent" />
      </section>
    </Transition>
  </main>
</template>
