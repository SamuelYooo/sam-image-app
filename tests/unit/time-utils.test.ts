import { describe, expect, it } from 'vitest'
import { formatBeijingDateTime } from '../../src/utils/time'

describe('time utils', () => {
  it('formats UTC ISO timestamps as Beijing time', () => {
    expect(formatBeijingDateTime('2026-05-25T00:00:00.000Z')).toBe('2026-05-25 08:00')
  })

  it('formats sqlite current timestamp values as UTC source into Beijing time', () => {
    expect(formatBeijingDateTime('2026-05-25 00:00:00')).toBe('2026-05-25 08:00')
  })

  it('formats legacy unix timestamps as Beijing time', () => {
    expect(formatBeijingDateTime('unix:0')).toBe('1970-01-01 08:00')
    expect(formatBeijingDateTime('unix:1000000000')).toBe('2001-09-09 09:46')
  })
})
