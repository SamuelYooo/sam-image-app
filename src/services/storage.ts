export interface JsonStorage {
  read<T>(key: string, fallback: T): T
  write<T>(key: string, value: T): void
}

export const browserStorage: JsonStorage = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  write<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value))
  },
}
