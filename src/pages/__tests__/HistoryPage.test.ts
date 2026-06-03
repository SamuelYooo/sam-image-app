import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const historyPagePath = resolve('src/pages/HistoryPage.vue')
const shellPath = resolve('src/components/AppShell.vue')

describe('HistoryPage asset library copy and deletion', () => {
  it('presents history as an asset library with single-asset deletion', () => {
    const source = readFileSync(historyPagePath, 'utf8')
    const shell = readFileSync(shellPath, 'utf8')

    expect(source).toContain('资产库')
    expect(source).toContain('清空资产库')
    expect(source).toContain('暂无资产')
    expect(source).toContain('deleteAsset')
    expect(source).toContain('store.removeGeneratedAsset')
    expect(source).toContain('删除图片')
    expect(source).toContain('滤镜预览')
    expect(source).toContain('导出原图')
    expect(source).toContain('导出调整后图片')
    expect(source).toContain('放大查看')
    expect(source).toContain('viewerZoom')
    expect(source).toContain('z-index: 120')
    expect(shell).toContain("label: '资产库'")
  })
})
