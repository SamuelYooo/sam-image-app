<script setup lang="ts">
import { onMounted, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme
}

onMounted(() => {
  applyTheme(store.settings.theme)
  void store.loadPersistedTasks()
})

watch(() => store.settings.theme, applyTheme)
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>

  <Transition name="toast">
    <div v-if="store.toast" class="toast" :class="store.toast.type" role="status" aria-live="polite">
      <span class="status-dot" :class="{ error: store.toast.type === 'error', warn: store.toast.type === 'info' }" />
      {{ store.toast.message }}
    </div>
  </Transition>
</template>
