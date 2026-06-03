import { describe, expect, it } from 'vitest'
import { isKnownToolIcon, resolveToolIcon } from '../icons'

describe('resolveToolIcon', () => {
  it('resolves a known lucide name to a component', () => {
    const icon = resolveToolIcon('Sparkles')
    expect(icon).toBeDefined()
    // lucide-vue-next exports a component (functional or SFC)
    expect(['function', 'object']).toContain(typeof icon)
  })

  it('falls back to a default icon for unknown names', () => {
    const icon = resolveToolIcon('NotAnIcon')
    expect(icon).toBeDefined()
  })

  it('falls back when name is empty or null', () => {
    expect(resolveToolIcon('')).toBeDefined()
    expect(resolveToolIcon(null)).toBeDefined()
    expect(resolveToolIcon(undefined)).toBeDefined()
  })

  it('isKnownToolIcon returns true only for registered names', () => {
    expect(isKnownToolIcon('Sparkles')).toBe(true)
    expect(isKnownToolIcon('NotAnIcon')).toBe(false)
    expect(isKnownToolIcon(undefined)).toBe(false)
  })

  it('exposes a registry covering every icon name used in the catalog', () => {
    const used = ['Plus', 'Image', 'Box', 'Grid2X2', 'Repeat', 'Sparkles', 'Badge', 'UserRound',
      'PanelsTopLeft', 'IdCard', 'Eraser', 'MessageSquareX', 'ShieldCheck', 'Activity',
      'History', 'Smile', 'Aperture', 'Layers', 'Wrench']
    for (const name of used) {
      expect(isKnownToolIcon(name)).toBe(true)
    }
  })
})
