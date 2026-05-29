import { invoke } from '@tauri-apps/api/core'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    samimageE2eDirectory?: string
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) return null
  return await invoke<T>(command, args)
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const browserFallback = typeof window !== 'undefined' ? window.samimageE2eDirectory : undefined
  if (!isTauriRuntime()) return browserFallback ?? null

  try {
    return await invoke<string | null>('plugin:dialog|open', {
      options: {
        title: '选择输出目录',
        directory: true,
        multiple: false,
        defaultPath: defaultPath?.trim() || undefined,
        recursive: true,
        canCreateDirectories: true,
      },
    })
  } catch (error) {
    console.warn('Tauri directory picker failed', error)
    return null
  }
}
