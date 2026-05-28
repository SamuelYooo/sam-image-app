import { invoke } from '@tauri-apps/api/core'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriRuntime()) return null
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    console.warn(`Tauri command failed: ${command}`, error)
    return null
  }
}
