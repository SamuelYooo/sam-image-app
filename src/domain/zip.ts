/**
 * 最小化 ZIP 文件生成器（STORED，不压缩）。
 * 用于 ICON 多尺寸导出打包，无需外部依赖。
 */

interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * 构建一个合法的 ZIP 文件（STORED 模式，不压缩）。
 * @param files 文件列表，name 为 ZIP 内路径，data 为文件内容
 * @returns ZIP 文件的完整 Uint8Array
 */
export function buildZipFile(files: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()

  // 计算总大小
  let totalSize = 0
  const encodedNames: Uint8Array[] = []
  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    encodedNames.push(nameBytes)
    // local file header (30 + name) + data
    totalSize += 30 + nameBytes.length + file.data.length
  }
  // central directory: 46 + name per file
  for (const nameBytes of encodedNames) {
    totalSize += 46 + nameBytes.length
  }
  // end of central directory: 22
  totalSize += 22

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const out = new Uint8Array(buffer)
  let offset = 0

  // ── Local file headers + data ──
  const localOffsets: number[] = []
  for (let i = 0; i < files.length; i++) {
    localOffsets.push(offset)
    const { data } = files[i]
    const nameBytes = encodedNames[i]
    const crc = crc32(data)

    // Local file header
    view.setUint32(offset, 0x04034b50, true); offset += 4
    view.setUint16(offset, 20, true); offset += 2       // version needed
    view.setUint16(offset, 0, true); offset += 2        // flags
    view.setUint16(offset, 0, true); offset += 2        // compression: STORED
    view.setUint16(offset, 0, true); offset += 2        // mod time
    view.setUint16(offset, 0, true); offset += 2        // mod date
    view.setUint32(offset, crc, true); offset += 4      // CRC-32
    view.setUint32(offset, data.length, true); offset += 4  // compressed size
    view.setUint32(offset, data.length, true); offset += 4  // uncompressed size
    view.setUint16(offset, nameBytes.length, true); offset += 2  // name length
    view.setUint16(offset, 0, true); offset += 2        // extra length

    out.set(nameBytes, offset); offset += nameBytes.length
    out.set(data, offset); offset += data.length
  }

  // ── Central directory ──
  const centralOffset = offset
  for (let i = 0; i < files.length; i++) {
    const { data } = files[i]
    const nameBytes = encodedNames[i]
    const crc = crc32(data)

    view.setUint32(offset, 0x02014b50, true); offset += 4
    view.setUint16(offset, 20, true); offset += 2       // version made by
    view.setUint16(offset, 20, true); offset += 2       // version needed
    view.setUint16(offset, 0, true); offset += 2        // flags
    view.setUint16(offset, 0, true); offset += 2        // compression: STORED
    view.setUint16(offset, 0, true); offset += 2        // mod time
    view.setUint16(offset, 0, true); offset += 2        // mod date
    view.setUint32(offset, crc, true); offset += 4      // CRC-32
    view.setUint32(offset, data.length, true); offset += 4  // compressed size
    view.setUint32(offset, data.length, true); offset += 4  // uncompressed size
    view.setUint16(offset, nameBytes.length, true); offset += 2  // name length
    view.setUint16(offset, 0, true); offset += 2        // extra length
    view.setUint16(offset, 0, true); offset += 2        // comment length
    view.setUint16(offset, 0, true); offset += 2        // disk number
    view.setUint16(offset, 0, true); offset += 2        // internal attrs
    view.setUint32(offset, 0, true); offset += 4        // external attrs
    view.setUint32(offset, localOffsets[i], true); offset += 4  // local header offset

    out.set(nameBytes, offset); offset += nameBytes.length
  }

  // ── End of central directory ──
  const centralSize = offset - centralOffset
  view.setUint32(offset, 0x06054b50, true); offset += 4
  view.setUint16(offset, 0, true); offset += 2          // disk number
  view.setUint16(offset, 0, true); offset += 2          // central dir disk
  view.setUint16(offset, files.length, true); offset += 2  // entries on disk
  view.setUint16(offset, files.length, true); offset += 2  // total entries
  view.setUint32(offset, centralSize, true); offset += 4   // central dir size
  view.setUint32(offset, centralOffset, true)              // central dir offset
  // comment length is 0 (last field, already zero-initialized)

  return out
}

/**
 * CRC-32 校验（ZIP 标准多项式 0xEDB88320）
 */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
