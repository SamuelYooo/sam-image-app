<script setup lang="ts">
import { onMounted } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

onMounted(() => {
  void store.loadPersistedTasks()
})
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
