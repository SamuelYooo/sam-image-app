import { describe, expect, it } from 'vitest'
import tauriConfig from '../../src-tauri/tauri.conf.json'

describe('tauri config contracts', () => {
  it('uses the 2.0 desktop bundle identifier', () => {
    expect(tauriConfig.identifier).toBe('xyz.samsofts.sam-image-app')
    expect(tauriConfig.productName).toBe('SamImage')
    expect(tauriConfig.app.windows[0].title).toBe('SamImage 2.0')
  })
})
