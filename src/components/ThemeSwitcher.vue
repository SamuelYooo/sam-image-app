<script setup lang="ts">
import { ref } from 'vue'
import { Moon, Palette, Sun } from 'lucide-vue-next'
import { useTheme, type ThemeName } from '@/composables/useTheme'

const { currentTheme, isDark, themes, setTheme, toggleDark } = useTheme()
const open = ref(false)

function selectTheme(name: ThemeName): void {
  setTheme(name)
  open.value = false
}

function themePreviewColor(name: ThemeName): string {
  const colors: Record<ThemeName, string> = {
    default: 'linear-gradient(135deg, #3b82f6, #0ea5a0)',
    ocean: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    starry: 'linear-gradient(135deg, #a78bfa, #6366f1)',
  }
  return colors[name]
}
</script>

<template>
  <div class="theme-switcher" @mouseenter="open = true" @mouseleave="open = false">
    <button class="theme-toggle-btn" type="button" aria-label="切换主题">
      <Palette :size="18" />
    </button>
    <Transition name="dropdown">
      <div v-if="open" class="theme-dropdown">
        <div class="theme-dropdown-section">
          <span class="theme-dropdown-label">主题风格</span>
          <div class="theme-options">
            <button
              v-for="t in themes"
              :key="t.name"
              class="theme-option"
              :class="{ active: currentTheme === t.name }"
              type="button"
              @click="selectTheme(t.name)"
            >
              <span class="theme-swatch" :style="{ background: themePreviewColor(t.name) }" />
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>
        <div class="theme-dropdown-divider" />
        <div class="theme-dropdown-section">
          <span class="theme-dropdown-label">明暗模式</span>
          <button class="theme-mode-toggle" type="button" @click="toggleDark">
            <Sun v-if="isDark" :size="16" />
            <Moon v-else :size="16" />
            <span>{{ isDark ? '切换到浅色' : '切换到深色' }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.theme-switcher {
  position: relative;
}

.theme-toggle-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--muted);
  border: 1px solid var(--border);
  background: var(--tint);
  transition: color 160ms, border-color 160ms, background 160ms;
}

.theme-toggle-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}

.theme-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  width: 200px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-raised);
  backdrop-filter: blur(20px);
}

.theme-dropdown-section {
  display: grid;
  gap: 6px;
}

.theme-dropdown-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 6px 2px;
}

.theme-dropdown-divider {
  height: 1px;
  background: var(--border-soft);
  margin: 6px 0;
}

.theme-options {
  display: grid;
  gap: 2px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-2);
  transition: background 120ms, color 120ms;
}

.theme-option:hover {
  background: var(--tint);
  color: var(--fg);
}

.theme-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.theme-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.theme-mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-2);
  width: 100%;
  transition: background 120ms, color 120ms;
}

.theme-mode-toggle:hover {
  background: var(--tint);
  color: var(--fg);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 160ms, transform 160ms;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
