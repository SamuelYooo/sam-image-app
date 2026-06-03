import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const operationPagePath = resolve('src/pages/OperationHistoryPage.vue')
const routerPath = resolve('src/router.ts')
const shellPath = resolve('src/components/AppShell.vue')

describe('OperationHistoryPage', () => {
  it('lists generation operations with failure diagnostics and retry support', () => {
    const source = readFileSync(operationPagePath, 'utf8')

    expect(source).toContain('store.operationTasks')
    expect(source).toContain("statusFilter = ref<'all' | TaskStatus>('all')")
    expect(source).toContain('task.error')
    expect(source).toContain('failureSummary(task)')
    expect(source).toContain('task.errorDetails')
    expect(source).toContain('调用地址')
    expect(source).toContain('重试')
    expect(source).toContain('查询生成请求、失败原因、模型参数和重试入口')
    expect(source).toContain('store.historyTasks')
  })

  it('is available from routing and primary navigation', () => {
    const router = readFileSync(routerPath, 'utf8')
    const shell = readFileSync(shellPath, 'utf8')

    expect(router).toContain("path: '/operations'")
    expect(router).toContain('OperationHistoryPage')
    expect(shell).toContain("to: '/operations'")
    expect(shell).toContain("label: '操作记录'")
    expect(shell).toContain('store.historyAssetCount')
    expect(shell).not.toContain('store.tasks.length')
  })

  it('keeps the operation search and record rows responsive', () => {
    const source = readFileSync(operationPagePath, 'utf8')

    expect(source).toContain('class="operation-search"')
    expect(source).toContain('class="operation-filter"')
    expect(source).toContain('.operation-search {')
    expect(source).toContain('.operation-search input:not([type="checkbox"]):not([type="radio"]) {')
    expect(source).toContain('.operation-actions {')
    expect(source).toContain('.stat-card {')
    expect(source).toContain('operation-empty')
    expect(source).toContain('.operation-empty {')
    expect(source).toContain('.operation-item h2 {')
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).toContain('@media (max-width: 1040px)')
  })
})
