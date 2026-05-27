import { describe, expect, it } from 'vitest'
import { hasTauriRuntime } from '../../src/utils/tauriRuntime'

describe('tauri runtime detection', () => {
  it('returns false in the Vitest browser-like environment', () => {
    expect(hasTauriRuntime()).toBe(false)
  })
})
