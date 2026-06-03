import { describe, expect, it } from 'vitest'
import { buildZipFile } from '../zip'

describe('buildZipFile', () => {
  it('produces a valid ZIP binary with correct signatures', () => {
    const files = [
      { name: 'test.txt', data: new TextEncoder().encode('hello') },
    ]
    const zip = buildZipFile(files)

    // ZIP magic number: PK\x03\x04
    expect(zip[0]).toBe(0x50) // P
    expect(zip[1]).toBe(0x4B) // K
    expect(zip[2]).toBe(0x03)
    expect(zip[3]).toBe(0x04)
  })

  it('includes file data at the correct offset', () => {
    const content = new TextEncoder().encode('hello world')
    const files = [
      { name: 'a.txt', data: content },
    ]
    const zip = buildZipFile(files)

    // Local file header: 30 bytes + 5 byte name
    const dataOffset = 30 + 'a.txt'.length
    const extracted = zip.slice(dataOffset, dataOffset + content.length)
    expect(Array.from(extracted)).toEqual(Array.from(content))
  })

  it('packs multiple files with correct central directory', () => {
    const files = [
      { name: 'a.png', data: new Uint8Array([1, 2, 3]) },
      { name: 'b.png', data: new Uint8Array([4, 5, 6, 7]) },
    ]
    const zip = buildZipFile(files)

    // Central directory signature: PK\x01\x02
    // Find it by scanning for the signature
    let centralDirOffset = -1
    for (let i = 0; i < zip.length - 3; i++) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4B && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) {
        centralDirOffset = i
        break
      }
    }
    expect(centralDirOffset).toBeGreaterThan(0)

    // End of central directory signature: PK\x05\x06
    let eocdOffset = -1
    for (let i = 0; i < zip.length - 3; i++) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4B && zip[i + 2] === 0x05 && zip[i + 3] === 0x06) {
        eocdOffset = i
        break
      }
    }
    expect(eocdOffset).toBeGreaterThan(centralDirOffset)

    // Entry count in EOCD
    const entryCount = new DataView(zip.buffer).getUint16(eocdOffset + 10, true)
    expect(entryCount).toBe(2)
  })

  it('handles empty data', () => {
    const files = [
      { name: 'empty.bin', data: new Uint8Array(0) },
    ]
    const zip = buildZipFile(files)

    // Should still be a valid ZIP with the entry
    expect(zip[0]).toBe(0x50)
    expect(zip.length).toBeGreaterThan(30)
  })

  it('preserves PNG file content exactly', () => {
    // Simulate a minimal PNG
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const files = [
      { name: 'icon-16x16.png', data: pngHeader },
    ]
    const zip = buildZipFile(files)

    const dataOffset = 30 + 'icon-16x16.png'.length
    const extracted = zip.slice(dataOffset, dataOffset + pngHeader.length)
    expect(Array.from(extracted)).toEqual(Array.from(pngHeader))
  })
})
