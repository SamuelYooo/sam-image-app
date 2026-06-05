import { ref, watch } from 'vue'

export type ThemeName = 'default' | 'ocean' | 'starry'

export interface ThemeOption {
  name: ThemeName
  label: string
}

const THEME_STORAGE_KEY = 'samimage.v3.theme'

export const themes: ThemeOption[] = [
  { name: 'default', label: '默认' },
  { name: 'ocean', label: '海洋' },
  { name: 'starry', label: '星空' },
]

const currentTheme = ref<ThemeName>('default')
const isDark = ref(false)

function loadPersisted(): void {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { theme?: ThemeName; dark?: boolean }
      if (saved.theme && themes.some((t) => t.name === saved.theme)) {
        currentTheme.value = saved.theme
      }
      if (typeof saved.dark === 'boolean') {
        isDark.value = saved.dark
      }
    }
  } catch { /* ignore corrupt storage */ }
}

function persist(): void {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({
    theme: currentTheme.value,
    dark: isDark.value,
  }))
}

function applyToDom(): void {
  const el = document.documentElement
  // Remove all theme classes
  el.classList.remove('theme-default', 'theme-ocean', 'theme-starry', 'dark')
  // Add current theme class
  el.classList.add(`theme-${currentTheme.value}`)
  // Add dark class if dark mode
  if (isDark.value) {
    el.classList.add('dark')
  }
}

let initialized = false

function init(): void {
  if (initialized) return
  initialized = true
  loadPersisted()
  applyToDom()
  watch([currentTheme, isDark], () => {
    applyToDom()
    persist()
  })
}

function setTheme(name: ThemeName): void {
  currentTheme.value = name
}

function setDark(value: boolean): void {
  isDark.value = value
}

function toggleDark(): void {
  isDark.value = !isDark.value
}

export function useTheme() {
  init()
  return {
    currentTheme,
    isDark,
    themes,
    setTheme,
    setDark,
    toggleDark,
  }
}
