import { expect, test } from '@playwright/test'
import type { Download, Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function collectDownloads(page: Page, action: () => Promise<void>, count: number): Promise<Download[]> {
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  await action()
  await expect.poll(() => downloads.length).toBe(count)
  return downloads
}

function findDownload(downloads: Download[], suffix: string): Download {
  const download = downloads.find((item) => item.suggestedFilename().endsWith(suffix))
  expect(download, `expected a ${suffix} download`).toBeTruthy()
  return download!
}

test('workspace can generate a local preview and show it in history', async ({ page }) => {
  await page.goto('/workspace?mode=cover')

  await expect(page.getByRole('heading', { name: '生成结果预览' })).toBeVisible({ timeout: 20000 })
  await page.getByText('点击打开大编辑器').click()
  await page.getByPlaceholder('输入更完整的正向提示词').fill('小红书 AI 工具合集封面，赛博科技风，清晰标题层级')
  await page.getByRole('button', { name: '应用到工作台' }).click()
  await page.getByRole('button', { name: '生成新结果' }).click()

  await expect(page.getByText('已生成')).toBeVisible()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await expect(page.getByText('小红书 AI 工具合集封面').first()).toBeVisible()
})

test('history clear persists after reload', async ({ page }) => {
  await page.goto('/workspace?mode=cover')

  await page.getByText('点击打开大编辑器').click()
  await page.getByPlaceholder('输入更完整的正向提示词').fill('清空历史回归测试封面')
  await page.getByRole('button', { name: '应用到工作台' }).click()
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await expect(page.getByText('清空历史回归测试封面').first()).toBeVisible()

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: '清空历史', exact: true }).click()
  await expect(page.getByText('暂无历史记录')).toBeVisible()

  await page.reload()
  await expect(page.getByText('暂无历史记录')).toBeVisible()
  await expect(page.getByText('清空历史回归测试封面')).toHaveCount(0)
})

test('workspace prompt editor can polish and clear draft prompts', async ({ page }) => {
  await page.goto('/workspace?mode=cover')

  await page.getByText('点击打开大编辑器').click()
  const dialog = page.locator('.modal').filter({ has: page.getByRole('heading', { name: '编辑正向提示词' }) })
  const editor = page.getByPlaceholder('输入更完整的正向提示词')
  await editor.fill('弹窗内润色回归测试封面')
  await dialog.getByRole('button', { name: 'AI 润色' }).click()

  await expect(page.getByText(/已使用 .* 润色提示词/)).toBeVisible()
  await expect(editor).toHaveValue(/弹窗内润色回归测试封面.*封面图输出/)

  await dialog.getByRole('button', { name: '清空', exact: true }).click()
  await expect(editor).toHaveValue('')

  await page.getByRole('button', { name: '应用到工作台' }).click()
  await expect(page.getByText('点击打开大编辑器')).toBeVisible()
})

test('tool catalog opens workspace with a focused generation intent', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: /ICON 图标/ }).click()

  await expect(page).toHaveURL(/\/workspace\?/)
  await expect(page.locator('.prompt-preview')).toContainText('本地 AI 图像工具 App Icon')
  await expect(page.getByRole('button', { name: /^ICON$/ })).toHaveClass(/active/)

  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await expect(page.getByText('本地 AI 图像工具 App Icon').first()).toBeVisible()
})

test('workspace explains the active generation mode data flow', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img')

  await expect(page.getByText('文生图读取正向/反向提示词与风格预设')).toBeVisible()

  await page.getByRole('button', { name: /图生图/ }).click()
  await expect(page.getByText('图生图读取参考图、正向提示词与图片强度')).toBeVisible()

  await page.getByRole('button', { name: /GIF 动图/ }).click()
  await expect(page.getByText('GIF 动图读取提示词、时长和循环动作描述')).toBeVisible()
})

test('default export format from settings is used by workspace export', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByLabel('默认导出格式').selectOption('webp')
  await page.getByRole('button', { name: '保存系统设置' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=默认导出格式测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.getByLabel('格式')).toHaveValue('webp')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  const download = findDownload(downloads, '.webp')
  expect(download.suggestedFilename()).toMatch(/\.webp$/)
  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const content = await readFile(downloadedPath!)
  expect(content.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(content.subarray(8, 12).toString('ascii')).toBe('WEBP')
})

test('settings can pick and persist the default output directory', async ({ page }) => {
  await page.addInitScript(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\Picked'
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()

  await expect(page.getByLabel('默认输出目录')).toHaveValue('D:\\SamImage\\Picked')
  await page.getByRole('button', { name: '保存系统设置' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '系统设置' }).click()
  await expect(page.getByLabel('默认输出目录')).toHaveValue('D:\\SamImage\\Picked')
})

test('export dialogs can pick output directories from all result surfaces', async ({ page }) => {
  await page.addInitScript(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\WorkspacePicked'
  })

  await page.goto('/workspace?mode=cover&prompt=导出目录选择回归测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\WorkspacePicked')
  await page.getByRole('button', { name: '×' }).last().click()

  await page.evaluate(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\HistoryPicked'
  })
  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /导出目录选择回归测试封面/ }).first().click()
  await page.getByRole('button', { name: '导出到本地' }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\HistoryPicked')
  await page.getByRole('button', { name: '×' }).last().click()
  await page.getByRole('button', { name: '×' }).last().click()

  await page.evaluate(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\HomePicked'
  })
  await page.getByRole('link', { name: /首页/ }).click()
  await page.getByRole('button', { name: /导出目录选择回归测试封面/ }).first().click()
  await page.getByRole('button', { name: '导出到本地' }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\HomePicked')
})

test('workspace export scale produces a larger png download', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=导出倍率回归测试封面')
  await page.getByLabel('宽度').fill('320')
  await page.getByLabel('高度').fill('240')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('格式').selectOption('png')
  await page.getByLabel('倍率').selectOption('2')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  const download = findDownload(downloads, '.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const content = await readFile(path!)
  expect(content.readUInt32BE(16)).toBe(640)
  expect(content.readUInt32BE(20)).toBe(480)
})

test('workspace export includes prompt metadata when enabled', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=导出元数据回归测试封面')
  await page.getByRole('button', { name: '赛博' }).click()
  await page.getByLabel('宽度').fill('512')
  await page.getByLabel('高度').fill('768')
  await page.getByText('批量').locator('..').getByRole('slider').fill('2')
  await page.getByText('步数').locator('..').getByRole('slider').fill('36')
  await page.getByText('Seed').locator('..').getByRole('spinbutton').fill('246810')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('格式').selectOption('png')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  const metadataDownload = findDownload(downloads, '.metadata.json')

  const metadataPath = await metadataDownload.path()
  expect(metadataPath).toBeTruthy()
  const metadata = JSON.parse(await readFile(metadataPath!, 'utf8'))
  expect(metadata.prompt).toBe('导出元数据回归测试封面')
  expect(metadata.mode).toBe('cover')
  expect(metadata.modelId).toBe('local-preview')
  expect(metadata.width).toBe(512)
  expect(metadata.height).toBe(768)
  expect(metadata.batchSize).toBe(2)
  expect(metadata.steps).toBe(36)
  expect(metadata.seed).toBe(246810)
  expect(metadata.style).toBe('赛博')
  expect(metadata.asset.format).toBe('png')
  expect(metadata.asset.width).toBe(512)
  expect(metadata.asset.height).toBe(768)
})

test('history detail export confirms format before browser download', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=历史导出弹窗回归测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /历史导出弹窗回归测试封面/ }).first().click()
  await page.getByRole('button', { name: '导出到本地' }).click()

  await expect(page.getByRole('heading', { name: '导出到本地' })).toBeVisible()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\Exports')
  await page.getByLabel('格式').selectOption('webp')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '确认导出' }).click(), 2)
  const download = findDownload(downloads, '.webp')
  expect(download.suggestedFilename()).toMatch(/\.webp$/)
})

test('history export all confirms format before downloading every asset', async ({ page }) => {
  await page.goto('/history')
  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: '清空历史', exact: true }).click()
  await expect(page.getByText('暂无历史记录')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=历史批量导出 A')
  await page.getByText('批量').locator('..').getByRole('slider').fill('1')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.goto('/workspace?mode=icon&prompt=历史批量导出 B')
  await page.getByText('批量').locator('..').getByRole('slider').fill('1')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: '导出全部' }).click()

  await expect(page.getByRole('heading', { name: '导出全部' })).toBeVisible()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\Exports')
  await page.getByLabel('格式').selectOption('webp')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '确认导出全部' }).click(), 4)
  expect(downloads.filter((download) => download.suggestedFilename().endsWith('.webp'))).toHaveLength(2)
  expect(downloads.filter((download) => download.suggestedFilename().endsWith('.metadata.json'))).toHaveLength(2)
})

test('history reuse restores generation parameters in workspace', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img&prompt=历史复用参数回归测试')
  await page.getByRole('button', { name: '赛博' }).click()
  await page.getByLabel('宽度').fill('1536')
  await page.getByLabel('高度').fill('1024')
  await page.getByText('批量').locator('..').getByRole('slider').fill('2')
  await page.getByText('步数').locator('..').getByRole('slider').fill('44')
  await page.getByText('Seed').locator('..').getByRole('spinbutton').fill('987654')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample')).toHaveCount(2)

  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /历史复用参数回归测试/ }).first().click()
  await page.getByRole('button', { name: '复用提示词' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.locator('.prompt-preview')).toContainText('历史复用参数回归测试')
  await expect(page.getByRole('button', { name: '赛博' })).toHaveClass(/active/)
  await expect(page.getByLabel('宽度')).toHaveValue('1536')
  await expect(page.getByLabel('高度')).toHaveValue('1024')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('2')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('44')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('987654')
})

test('history failed task can retry generation with original parameters', async ({ page }) => {
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#b84c4c"/></svg>')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'local-preview',
            name: 'Local Preview',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-preview',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
        ],
        prompts: [],
        tasks: [
          {
            id: 'history-failed-task',
            mode: 'img2img',
            prompt: '失败重试参数回归测试',
            negativePrompt: '低质量',
            modelId: 'local-preview',
            width: 896,
            height: 1152,
            batchSize: 2,
            steps: 37,
            seed: 7654321,
            style: '赛博',
            status: 'failed',
            error: '模型连接失败',
            assets: [
              {
                id: 'history-failed-asset',
                taskId: 'history-failed-task',
                title: '失败任务占位资源',
                width: 896,
                height: 1152,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-12T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-12T00:00:00.000Z',
          },
        ],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/history')
  await page.getByRole('button', { name: /失败重试参数回归测试/ }).click()
  await page.getByRole('button', { name: '失败重新生成' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page).toHaveURL(/retryTaskId=history-failed-task/)
  await expect(page.locator('.prompt-preview')).toContainText('失败重试参数回归测试')
  await expect(page.getByRole('button', { name: '图生图' })).toHaveClass(/active/)
  await expect(page.getByLabel('宽度')).toHaveValue('896')
  await expect(page.getByLabel('高度')).toHaveValue('1152')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('2')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('37')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('7654321')
  await expect(page.getByText('已载入失败任务参数，可重新生成')).toBeVisible()
})

test('history supports sorting and loading more records', async ({ page }) => {
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#1f6bff"/></svg>')
    const tasks = Array.from({ length: 10 }, (_, index) => {
      const order = index + 1
      const createdAt = new Date(Date.UTC(2026, 0, order)).toISOString()
      return {
        id: `history-sort-task-${order}`,
        mode: 'txt2img',
        prompt: `历史排序 ${String(order).padStart(2, '0')}`,
        negativePrompt: '',
        modelId: order % 2 === 0 ? 'zeta-model' : 'alpha-model',
        width: 512,
        height: 512,
        batchSize: 1,
        steps: 28,
        seed: order,
        style: '自然',
        status: 'completed',
        assets: [
          {
            id: `history-sort-asset-${order}`,
            taskId: `history-sort-task-${order}`,
            title: `历史排序资源 ${order}`,
            width: 512,
            height: 512,
            format: 'svg',
            dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
            createdAt,
          },
        ],
        createdAt,
      }
    })

    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks,
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/history')
  await expect(page.getByText('历史排序 10')).toBeVisible()
  await expect(page.getByText('历史排序 01')).toHaveCount(0)

  await page.getByLabel('排序').selectOption('oldest')
  await expect(page.getByText('历史排序 01')).toBeVisible()
  await expect(page.getByText('历史排序 10')).toHaveCount(0)

  await page.getByRole('button', { name: '加载更多' }).click()
  await expect(page.getByText('历史排序 10')).toBeVisible()
})

test('history can favorite records and persist the favorite count', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('samimage.e2e.history-favorite-seeded')) return
    localStorage.setItem('samimage.e2e.history-favorite-seeded', '1')
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f6c945"/></svg>')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks: [
          {
            id: 'history-favorite-task-a',
            mode: 'cover',
            prompt: '历史收藏回归测试封面 A',
            negativePrompt: '',
            modelId: 'local-preview',
            width: 512,
            height: 512,
            batchSize: 1,
            steps: 28,
            seed: 101,
            style: '自然',
            status: 'completed',
            isFavorite: false,
            assets: [
              {
                id: 'history-favorite-asset-a',
                taskId: 'history-favorite-task-a',
                title: '历史收藏资源 A',
                width: 512,
                height: 512,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-11T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-11T00:00:00.000Z',
          },
          {
            id: 'history-favorite-task-b',
            mode: 'txt2img',
            prompt: '历史收藏回归测试封面 B',
            negativePrompt: '',
            modelId: 'local-preview',
            width: 512,
            height: 512,
            batchSize: 1,
            steps: 28,
            seed: 202,
            style: '赛博',
            status: 'completed',
            isFavorite: true,
            assets: [
              {
                id: 'history-favorite-asset-b',
                taskId: 'history-favorite-task-b',
                title: '历史收藏资源 B',
                width: 512,
                height: 512,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-10T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-10T00:00:00.000Z',
          },
        ],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/history')
  await expect(page.getByText('1 条')).toBeVisible()
  await expect(page.getByText('已收藏')).toBeVisible()

  const card = page.locator('.history-card').filter({ hasText: '历史收藏回归测试封面 A' })
  await card.getByRole('button', { name: '收藏', exact: true }).click()
  await expect(page.getByText('已收藏：历史收藏回归测试封面 A')).toBeVisible()
  await expect(page.getByText('2 条')).toBeVisible()

  await page.reload()
  await expect(page.getByText('2 条')).toBeVisible()
  await expect(card.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.tasks?.find((task: { id: string }) => task.id === 'history-favorite-task-a')?.isFavorite
  })).toBe(true)
})

test('home recent detail can reuse prompt in workspace', async ({ page }) => {
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#42d392"/></svg>')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks: [
          {
            id: 'home-recent-task',
            mode: 'cover',
            prompt: '首页最近生成详情回归测试封面',
            negativePrompt: '低清晰度',
            modelId: 'local-preview',
            width: 640,
            height: 360,
            batchSize: 1,
            steps: 32,
            seed: 13579,
            style: '赛博',
            status: 'completed',
            assets: [
              {
                id: 'home-recent-asset',
                taskId: 'home-recent-task',
                title: '首页最近生成详情资源',
                width: 640,
                height: 360,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-10T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-10T00:00:00.000Z',
          },
        ],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/')
  await page.getByRole('button', { name: /首页最近生成详情回归测试封面/ }).click()

  await expect(page.getByRole('heading', { name: '生成详情' })).toBeVisible()
  await expect(page.getByText('local-preview', { exact: true })).toBeVisible()
  await expect(page.getByText('640 x 360')).toBeVisible()
  await expect(page.getByText('首页最近生成详情回归测试封面').first()).toBeVisible()

  await page.getByRole('button', { name: '复用提示词' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.locator('.prompt-preview')).toContainText('首页最近生成详情回归测试封面')
  await expect(page.getByRole('button', { name: '赛博' })).toHaveClass(/active/)
  await expect(page.getByLabel('宽度')).toHaveValue('640')
  await expect(page.getByLabel('高度')).toHaveValue('360')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('32')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('13579')
})

test('home recent detail can retry a failed generation with original parameters', async ({ page }) => {
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#b84c4c"/></svg>')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'local-preview',
            name: 'Local Preview',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-preview',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
        ],
        prompts: [],
        tasks: [
          {
            id: 'home-failed-task',
            mode: 'img2img',
            prompt: '首页失败重试回归测试',
            negativePrompt: '低质量',
            modelId: 'local-preview',
            width: 720,
            height: 1280,
            batchSize: 3,
            steps: 41,
            seed: 424242,
            style: '像素',
            status: 'failed',
            error: '模型连接失败',
            assets: [
              {
                id: 'home-failed-asset',
                taskId: 'home-failed-task',
                title: '首页失败任务占位资源',
                width: 720,
                height: 1280,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-13T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-13T00:00:00.000Z',
          },
        ],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/')
  await page.getByRole('button', { name: /首页失败重试回归测试/ }).click()
  await expect(page.getByText('模型连接失败')).toBeVisible()

  await page.getByRole('button', { name: '失败重新生成' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page).toHaveURL(/retryTaskId=home-failed-task/)
  await expect(page.locator('.prompt-preview')).toContainText('首页失败重试回归测试')
  await expect(page.getByRole('button', { name: '图生图' })).toHaveClass(/active/)
  await expect(page.getByLabel('宽度')).toHaveValue('720')
  await expect(page.getByLabel('高度')).toHaveValue('1280')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('3')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('41')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('424242')
  await expect(page.getByText('已载入失败任务参数，可重新生成')).toBeVisible()
})

test('home model status summarizes primary models and api key readiness', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'primary-image',
            name: 'Primary Image',
            provider: 'openai-compatible',
            endpoint: 'https://api.example.test/v1',
            apiKey: 'sk-image-test',
            model: 'qwen-image-v3',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
          {
            id: 'backup-image',
            name: 'Backup Image',
            provider: 'openai-compatible',
            endpoint: 'https://api.example.test/v1',
            apiKey: '',
            model: 'backup-image-model',
            kind: 'image',
            isPrimary: false,
            status: 'untested',
          },
          {
            id: 'primary-text',
            name: 'Primary Text',
            provider: 'openai-compatible',
            endpoint: '',
            apiKey: '',
            model: 'gpt-polish-v1',
            kind: 'text',
            isPrimary: true,
            status: 'untested',
          },
        ],
        prompts: [],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultImageModelId: 'primary-image',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/')

  const modelSection = page.locator('.home-section').filter({ hasText: '本地模型状态' })
  const imageRow = modelSection.locator('.model-row').filter({ hasText: '主图像模型' })
  const textRow = modelSection.locator('.model-row').filter({ hasText: '文本润色模型' })
  const apiKeyRow = modelSection.locator('.model-row').filter({ hasText: 'API Key' })

  await expect(imageRow).toContainText('qwen-image-v3')
  await expect(imageRow).toContainText('已连接')
  await expect(textRow).toContainText('gpt-polish-v1')
  await expect(textRow).toContainText('未配置')
  await expect(apiKeyRow).toContainText('已设置')
  await expect(modelSection.getByText('Backup Image')).toHaveCount(0)
})

test('workspace keyboard shortcuts run documented actions', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img&prompt=快捷键回归测试')

  await page.dispatchEvent('body', 'keydown', {
    key: 'R',
    code: 'KeyR',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  await expect(page.locator('.prompt-preview')).toContainText('快捷键回归测试')
  await expect(page.locator('.prompt-preview')).toContainText('Text Polish')

  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.keyboard.press('Control+D')
  await expect(page.locator('.prompt-preview')).toContainText('点击打开大编辑器')
})

test('workspace can copy the selected result image with shortcut', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        async writeText(value: string) {
          localStorage.setItem('samimage.e2e.clipboard', value)
        },
      },
      configurable: true,
    })
  })

  await page.goto('/workspace?mode=cover&prompt=复制结果图回归测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.keyboard.press('Control+Shift+C')

  await expect(page.getByText('结果图已复制')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('samimage.e2e.clipboard')?.startsWith('data:image/svg+xml'))).toBe(true)
})

test('workspace can load a reference image with shortcut', async ({ page }) => {
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )

  await page.goto('/workspace?mode=img2img&prompt=参考图快捷键回归测试')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Control+U')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  })

  await expect(page.getByText('参考图已加载')).toBeVisible()
  await expect(page.getByAltText('参考图预览')).toBeVisible()
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
})

test('workspace switches to img2img when a reference image is dropped', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img&prompt=拖拽参考图回归测试')

  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['reference'], 'dropped-reference.png', { type: 'image/png' }))
    return dt
  })

  const dropZone = page.locator('.upload-box')
  await dropZone.dispatchEvent('dragover', { dataTransfer })
  await dropZone.dispatchEvent('drop', { dataTransfer })

  await expect(page.getByText('参考图已加载')).toBeVisible()
  await expect(page.getByRole('button', { name: /图生图/ })).toHaveClass(/active/)
  await expect(page.getByAltText('参考图预览')).toBeVisible()

  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toContainText('图生图 1')
})

test('workspace can reuse a generated result as an image reference', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=结果作为参考图回归测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '作为参考图', exact: true }).click()

  await expect(page.getByText('已将结果作为参考图')).toBeVisible()
  await expect(page.getByRole('button', { name: /图生图/ })).toHaveClass(/active/)
  await expect(page.getByText('参考图已载入，点击替换')).toBeVisible()
  await expect(page.getByAltText('参考图预览')).toBeVisible()
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toContainText('图生图 1')
})

test('workspace prompt library filters prompts by category', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'workspace-library-cover',
            title: '封面分类提示词',
            prompt: '只应该在封面分类里出现',
            source: 'custom',
            sourceId: 'workspace-cover',
            category: '封面',
            subCategory: '',
            author: 'User',
            tags: ['封面'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'workspace-library-icon',
            title: 'ICON 分类提示词',
            prompt: '玻璃拟态应用图标，蓝色发光边缘',
            source: 'custom',
            sourceId: 'workspace-icon',
            category: 'ICON',
            subCategory: '',
            author: 'User',
            tags: ['ICON'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/workspace?mode=txt2img')
  await page.getByRole('button', { name: '词库' }).click()
  const promptLibrary = page.getByRole('dialog').filter({ hasText: '提示词库' })
  await promptLibrary.getByRole('button', { name: 'ICON' }).click()

  await expect(promptLibrary.getByText('ICON 分类提示词')).toBeVisible()
  await expect(promptLibrary.getByText('封面分类提示词')).toHaveCount(0)

  await promptLibrary.locator('.prompt-item').filter({ hasText: 'ICON 分类提示词' }).getByRole('button', { name: '使用' }).click()
  await expect(page.locator('.prompt-preview')).toContainText('玻璃拟态应用图标')
})

test('global numeric shortcuts navigate between primary pages', async ({ page }) => {
  await page.goto('/about')

  const shortcuts = [
    ['1', /\/$/],
    ['2', /\/workspace$/],
    ['3', /\/tools$/],
    ['4', /\/history$/],
    ['5', /\/settings$/],
    ['6', /\/about$/],
  ] as const

  for (const [key, url] of shortcuts) {
    await page.dispatchEvent('body', 'keydown', {
      key,
      code: `Digit${key}`,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    await expect(page).toHaveURL(url)
  }
})

test('about page documents complete keyboard shortcuts', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('button', { name: '快捷键' }).click()

  await expect(page.getByText('生成图像')).toBeVisible()
  await expect(page.getByText('Ctrl + Enter')).toBeVisible()
  await expect(page.getByText('AI 润色')).toBeVisible()
  await expect(page.getByText('Ctrl + Shift + R')).toBeVisible()
  await expect(page.getByText('复制结果图')).toBeVisible()
  await expect(page.getByText('Ctrl + Shift + C')).toBeVisible()
  await expect(page.getByText('上传参考图')).toBeVisible()
  await expect(page.getByText('Ctrl + U')).toBeVisible()
  await expect(page.getByRole('main').getByText('关于帮助')).toBeVisible()
  await expect(page.getByText('Ctrl + 6')).toBeVisible()
})

test('about faq documents prompt import and local preset workflows', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('button', { name: '常见问题' }).click()

  await page.getByRole('button', { name: /提示词如何导入/ }).click()
  await expect(page.getByText('glidea/banana-prompt-quicker')).toBeVisible()
  await expect(page.getByText('EvoLinkAI/awesome-gpt-image')).toBeVisible()
  await expect(page.getByText('{prompts:[]}')).toBeVisible()
  await expect(page.getByText('content hash')).toBeVisible()

  await page.getByRole('button', { name: /如何添加自定义封面预设/ }).click()
  await expect(page.getByText('工具库的封面预设区域')).toBeVisible()
  await expect(page.getByText('输入名称、宽度、高度')).toBeVisible()

  await page.getByRole('button', { name: /数据安全吗/ }).click()
  await expect(page.getByText('API Key 保存在本地')).toBeVisible()
  await expect(page.getByText('不会上传到任何服务器')).toBeVisible()
})

test('generation can run without saving to history when auto-save is disabled', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '生成参数' }).click()
  await page.getByLabel('自动保存生成历史').uncheck()
  await page.getByRole('button', { name: '保存生成参数' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=不保存历史回归测试封面')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await expect(page.getByText('暂无历史记录')).toBeVisible()
  await expect(page.getByText('不保存历史回归测试封面')).toHaveCount(0)
})

test('prompt market imports multiple json files at once', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'batch-prompts-a.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ title: '批量导入提示词 A', prompt: '第一份批量导入的提示词内容', category: '批量' }])),
    },
    {
      name: 'batch-prompts-b.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ title: '批量导入提示词 B', prompt: '第二份批量导入的提示词内容', category: '批量' }])),
    },
  ])

  await expect(page.getByText('已导入 2 条提示词')).toBeVisible()
  await expect(page.getByText('批量导入提示词 A')).toBeVisible()
  await expect(page.getByText('批量导入提示词 B')).toBeVisible()
})

test('prompt market imports json files by drag and drop', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  const payload = JSON.stringify([
    { title: '拖拽导入提示词', prompt: '通过拖拽导入的提示词内容', category: '拖拽' },
  ])
  const dataTransfer = await page.evaluateHandle((content) => {
    const dt = new DataTransfer()
    dt.items.add(new File([content], 'drag-prompts.json', { type: 'application/json' }))
    return dt
  }, payload)

  const dropZone = page.getByText('拖拽文件或点击导入')
  await dropZone.dispatchEvent('dragover', { dataTransfer })
  await dropZone.dispatchEvent('drop', { dataTransfer })

  await expect(page.getByText('已导入 1 条提示词')).toBeVisible()
  await expect(page.getByText('拖拽导入提示词')).toBeVisible()
  await expect(page.getByText('通过拖拽导入的提示词内容')).toBeVisible()
})

test('prompt market filters prompts by source and category', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'prompt-filter-builtin',
            title: '内置封面提示词',
            prompt: '内置封面提示词内容',
            source: 'builtin',
            sourceId: 'builtin-cover',
            category: '封面',
            subCategory: '',
            author: 'SamImage',
            tags: ['封面'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'prompt-filter-custom',
            title: '自定义 ICON 提示词',
            prompt: '自定义 ICON 提示词内容',
            source: 'custom',
            sourceId: 'custom-icon',
            category: 'ICON',
            subCategory: '',
            author: 'User',
            tags: ['ICON'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-02T00:00:00.000Z',
          },
          {
            id: 'prompt-filter-glidea',
            title: 'Glidea 摄影提示词',
            prompt: 'Glidea 摄影提示词内容',
            source: 'glidea',
            sourceId: 'glidea-photo',
            category: '摄影',
            subCategory: '',
            author: 'glidea',
            tags: ['摄影'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-03T00:00:00.000Z',
          },
        ],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  await page.getByLabel('来源筛选').selectOption('custom')
  await expect(page.getByText('自定义 ICON 提示词', { exact: true })).toBeVisible()
  await expect(page.getByText('内置封面提示词', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Glidea 摄影提示词', { exact: true })).toHaveCount(0)

  await page.getByLabel('来源筛选').selectOption('all')
  await page.getByLabel('分类筛选').selectOption('摄影')
  await expect(page.getByText('Glidea 摄影提示词', { exact: true })).toBeVisible()
  await expect(page.getByText('自定义 ICON 提示词', { exact: true })).toHaveCount(0)
})

test('prompt market copies a prompt to clipboard', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        text: '',
        async writeText(value: string) {
          this.text = value
          localStorage.setItem('samimage.e2e.clipboard', value)
        },
      },
      configurable: true,
    })
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'prompt-copy-custom',
            title: '复制提示词回归测试',
            prompt: '复制到剪贴板的完整提示词内容',
            source: 'custom',
            sourceId: 'copy-custom',
            category: '封面',
            subCategory: '',
            author: 'User',
            tags: ['封面'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-04T00:00:00.000Z',
          },
        ],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()
  await page.getByRole('button', { name: '复制' }).click()

  await expect(page.getByText('提示词已复制')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('samimage.e2e.clipboard'))).toBe('复制到剪贴板的完整提示词内容')
})

test('prompt market syncs open source prompt repositories safely', async ({ page }) => {
  await page.addInitScript(() => {
    const syncedPayload = JSON.stringify({
      prompts: [
        {
          id: 'remote-glidea-cover',
          title: '远程 Glidea 封面提示词',
          prompt: '远程同步得到的封面提示词内容',
          category: '封面',
          author: 'glidea',
        },
      ],
    })
    let shouldFail = false
    window.fetch = async () => {
      if (shouldFail) throw new Error('network down')
      return new Response(syncedPayload, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    Object.defineProperty(window, 'samimageE2eFailPromptSync', {
      get: () => shouldFail,
      set: (value) => {
        shouldFail = Boolean(value)
      },
    })
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  await expect(page.getByRole('heading', { name: '从开源仓库同步' })).toBeVisible()
  await page.getByRole('button', { name: '同步-Glide' }).click()

  await expect(page.getByText('Glide 已同步 1 条提示词')).toBeVisible()
  await expect(page.getByText('远程 Glidea 封面提示词')).toBeVisible()
  await page.getByLabel('来源筛选').selectOption('glidea')
  await expect(page.getByText('远程 Glidea 封面提示词')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return {
      synced: state.prompts?.some((prompt: { source: string; sourceId: string }) => prompt.source === 'glidea' && prompt.sourceId === 'remote-glidea-cover'),
      syncCount: state.promptSync?.glidea?.count,
    }
  })).toEqual({ synced: true, syncCount: 1 })

  await page.evaluate(() => {
    ;(window as typeof window & { samimageE2eFailPromptSync: boolean }).samimageE2eFailPromptSync = true
  })
  await page.getByRole('button', { name: '同步-Glide' }).click()

  await expect(page.getByText(/Glide 同步失败/)).toBeVisible()
  await expect(page.getByText('远程 Glidea 封面提示词')).toBeVisible()
})

test('prompt market sync parses markdown readme prompt blocks', async ({ page }) => {
  await page.addInitScript(() => {
    const markdownPayload = [
      '# Awesome GPT Image Prompts',
      '## 封面',
      '### 霓虹封面',
      '```',
      '小红书封面，赛博霓虹标题，清晰信息层级',
      '```',
    ].join('\n')
    window.fetch = async () => new Response(markdownPayload, { status: 200, headers: { 'Content-Type': 'text/markdown' } })
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()
  await page.getByRole('button', { name: '同步-EvoLinkAI' }).click()

  await expect(page.getByText('EvoLinkAI 已同步 1 条提示词')).toBeVisible()
  await expect(page.getByText('霓虹封面')).toBeVisible()
  await page.getByLabel('来源筛选').selectOption('EvoLinkAI')
  await page.getByLabel('分类筛选').selectOption('封面')
  await expect(page.getByText('小红书封面，赛博霓虹标题，清晰信息层级')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    const prompt = state.prompts?.find((item: { source: string; title: string }) => item.source === 'EvoLinkAI' && item.title === '霓虹封面')
    return {
      category: prompt?.category,
      syncCount: state.promptSync?.EvoLinkAI?.count,
    }
  })).toEqual({ category: '封面', syncCount: 1 })
})

test('settings cover presets control the tools catalog', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()

  await expect(page.getByRole('heading', { name: '自媒体封面预设' })).toBeVisible()
  await page.getByLabel('启用 小红书封面').uncheck()
  await expect(page.getByText('3 个启用')).toBeVisible()

  await page.goto('/tools')
  await expect(page.getByRole('button', { name: /小红书封面/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /公众号封面/ })).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByRole('button', { name: '恢复默认封面预设' }).click()
  await expect(page.getByText('4 个启用')).toBeVisible()

  await page.goto('/tools')
  await expect(page.getByRole('button', { name: /小红书封面/ })).toBeVisible()
})

test('settings can add a custom cover preset for tools and workspace', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()

  await page.getByRole('button', { name: '新增预设' }).click()
  await expect(page.getByRole('heading', { name: '新增封面预设' })).toBeVisible()
  await page.getByLabel('名称').fill('设置页竖版封面')
  await page.getByLabel('宽度').fill('900')
  await page.getByLabel('高度').fill('1200')
  await page.getByRole('button', { name: '添加预设' }).click()

  await expect(page.getByText('封面预设已添加')).toBeVisible()
  await expect(page.locator('.cover-row').filter({ hasText: '设置页竖版封面' })).toContainText('900 x 1200')
  await expect(page.getByText('5 个启用')).toBeVisible()

  await page.goto('/tools')
  const presetCard = page.locator('.cover-preset').filter({ hasText: '设置页竖版封面' }).first()
  await expect(presetCard).toBeVisible()
  await presetCard.click()
  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.getByLabel('宽度')).toHaveValue('900')
  await expect(page.getByLabel('高度')).toHaveValue('1200')
})

test('tools page manages custom cover presets', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: '自定义尺寸' }).click()
  await page.getByLabel('名称').fill('竖版课程封面')
  await page.getByLabel('宽度').fill('720')
  await page.getByLabel('高度').fill('1280')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('封面预设已添加')).toBeVisible()
  await expect(page.getByRole('heading', { name: '自定义封面预设' })).toBeVisible()
  const customPreset = page.locator('.custom-preset-row').filter({ hasText: '竖版课程封面' })
  await expect(customPreset).toContainText('720 x 1280')

  await customPreset.getByRole('button', { name: '使用竖版课程封面' }).click()
  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.getByLabel('宽度')).toHaveValue('720')
  await expect(page.getByLabel('高度')).toHaveValue('1280')

  await page.goto('/tools')
  await page.locator('.custom-preset-row').filter({ hasText: '竖版课程封面' }).getByRole('button', { name: '删除竖版课程封面' }).click()

  await expect(page.getByText('封面预设已删除')).toBeVisible()
  await expect(page.getByText('竖版课程封面')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.coverPresets?.some((preset: { name: string }) => preset.name === '竖版课程封面')
  })).toBe(false)
})

test('tools custom cover preset previews the entered aspect ratio', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: '自定义尺寸' }).click()
  await expect(page.getByText('比例')).toBeVisible()
  await expect(page.getByText('—')).toBeVisible()

  await page.getByLabel('宽度').fill('1080')
  await page.getByLabel('高度').fill('608')
  await expect(page.getByText('135 : 76')).toBeVisible()

  await page.getByLabel('高度').fill('1920')
  await expect(page.getByText('9 : 16')).toBeVisible()
})

test('custom cover presets reject invalid dimensions', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: '自定义尺寸' }).click()
  await page.getByLabel('名称').fill('非法尺寸封面')
  await page.getByLabel('宽度').fill('0')
  await page.getByLabel('高度').fill('5000')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('请输入 128 到 4096 之间的有效尺寸')).toBeVisible()
  await expect(page.locator('.custom-preset-row').filter({ hasText: '非法尺寸封面' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return Boolean(state.coverPresets?.some((preset: { name: string }) => preset.name === '非法尺寸封面'))
  })).toBe(false)
})

test('workspace generation uses the selected image model', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'local-preview',
            name: 'Local Preview',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-preview',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
          {
            id: 'secondary-image',
            name: 'Secondary Image',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'secondary-image-model',
            kind: 'image',
            isPrimary: false,
            status: 'connected',
          },
        ],
        prompts: [],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/workspace?mode=cover&prompt=模型选择回归测试封面')
  await page.getByLabel('图像模型').selectOption('secondary-image')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /模型选择回归测试封面/ }).first().click()
  await expect(page.getByText('secondary-image')).toBeVisible()
})

test('workspace keeps generation parameters accessible on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto('/workspace?mode=cover&prompt=窄屏参数面板回归测试')

  await expect(page.getByLabel('图像模型')).toBeVisible()
  await expect(page.getByLabel('文本润色模型')).toBeVisible()
  await expect(page.getByLabel('宽度')).toBeVisible()
  await expect(page.getByLabel('高度')).toBeVisible()

  await page.getByLabel('宽度').fill('900')
  await page.getByLabel('高度').fill('1200')
  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
})

test('default image model from settings initializes a new workspace', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('samimage.v3.state', JSON.stringify({
      models: [
        {
          id: 'local-preview',
          name: 'Local Preview',
          provider: 'local-preview',
          endpoint: '',
          apiKey: '',
          model: 'samimage-local-preview',
          kind: 'image',
          isPrimary: true,
          status: 'connected',
        },
        {
          id: 'secondary-image',
          name: 'Secondary Image',
          provider: 'local-preview',
          endpoint: '',
          apiKey: '',
          model: 'secondary-image-model',
          kind: 'image',
          isPrimary: false,
          status: 'connected',
        },
      ],
      prompts: [],
      tasks: [],
      coverPresets: [],
      settings: {
        defaultOutputDir: 'D:\\SamImage\\Exports',
        defaultExportFormat: 'svg',
        defaultGenerationSize: 1024,
        defaultBatchSize: 1,
        defaultStyle: '自然',
        autoSaveHistory: true,
        includePromptMetadata: true,
        theme: 'dark',
      },
    }))
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: '生成参数' }).click()
  await page.getByLabel('默认生图模型').selectOption('secondary-image')
  await page.getByRole('button', { name: '保存生成参数' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=默认生图模型回归测试封面')
  await expect(page.getByLabel('图像模型')).toHaveValue('secondary-image')

  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /默认生图模型回归测试封面/ }).first().click()
  await expect(page.getByText('secondary-image')).toBeVisible()
})

test('settings model cards can set the primary image model directly', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('samimage.e2e.primary-model-seeded')) return
    localStorage.setItem('samimage.e2e.primary-model-seeded', '1')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'local-preview',
            name: 'Local Preview',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-preview',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
          {
            id: 'secondary-image',
            name: 'Secondary Image',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'secondary-image-model',
            kind: 'image',
            isPrimary: false,
            status: 'connected',
          },
        ],
        prompts: [],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultImageModelId: 'local-preview',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '自然',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/settings')
  const localCard = page.locator('.model-card').filter({ hasText: 'Local Preview' })
  const secondaryCard = page.locator('.model-card').filter({ hasText: 'Secondary Image' })

  await expect(localCard.getByText('主模型')).toBeVisible()
  await secondaryCard.getByRole('button', { name: '设为主模型' }).click()

  await expect(page.getByText('已设为主模型：Secondary Image')).toBeVisible()
  await expect(secondaryCard.getByText('主模型')).toBeVisible()
  await expect(localCard.getByRole('button', { name: '设为主模型' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return {
      defaultImageModelId: state.settings?.defaultImageModelId,
      localPrimary: state.models?.find((model: { id: string }) => model.id === 'local-preview')?.isPrimary,
      secondaryPrimary: state.models?.find((model: { id: string }) => model.id === 'secondary-image')?.isPrimary,
    }
  })).toEqual({
    defaultImageModelId: 'secondary-image',
    localPrimary: false,
    secondaryPrimary: true,
  })

  await page.goto('/workspace?mode=cover&prompt=主模型快捷切换回归测试封面')
  await expect(page.getByLabel('图像模型')).toHaveValue('secondary-image')
})

test('settings model editor can fetch a model from the local catalog', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '新增模型' }).click()
  await page.getByRole('button', { name: '获取模型' }).click()
  await expect(page.getByRole('heading', { name: '获取模型' })).toBeVisible()

  await page.getByPlaceholder('搜索模型…').fill('flux')
  await expect(page.getByText('flux-1-dev', { exact: true })).toBeVisible()
  await expect(page.getByText('gpt-image-2', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /flux-1-dev/ }).click()
  await page.getByRole('button', { name: '确认选择' }).click()

  await expect(page.getByText('已选择模型：flux-1-dev')).toBeVisible()
  await expect(page.getByLabel('模型名称')).toHaveValue('flux-1-dev')
  await expect(page.getByLabel('模型 ID')).toHaveValue('black-forest-labs/flux-1-dev')
})

test('settings can set the primary text model used by prompt polish', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '新增模型' }).click()
  await page.getByLabel('模型名称').fill('Local Text Refiner')
  await page.getByLabel('类型').selectOption('text')
  await expect(page.getByLabel('设为主文本模型')).toBeVisible()
  await expect(page.getByLabel('设为主图像模型')).toHaveCount(0)
  await page.getByLabel('API 地址').fill('')
  await page.getByLabel('模型 ID').fill('local-text-refiner')
  await page.getByLabel('设为主文本模型').check()
  await page.getByRole('button', { name: '保存模型' }).click()

  await expect(page.getByText('模型配置已保存')).toBeVisible()
  const textCard = page.locator('.model-card').filter({ hasText: 'Local Text Refiner' })
  await expect(textCard.getByText('主文本模型')).toBeVisible()

  await page.goto('/workspace?mode=txt2img&prompt=主文本模型回归测试')
  await expect(page.getByLabel('文本润色模型')).toHaveValue(/model-/)
  await page.getByRole('button', { name: '润色' }).click()
  await expect(page.locator('.prompt-preview')).toContainText('主文本模型回归测试')
  await expect(page.locator('.prompt-preview')).toContainText('Local Text Refiner')
})

test('workspace prompt polish uses the selected text model', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [
          {
            id: 'local-preview',
            name: 'Local Preview',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-preview',
            kind: 'image',
            isPrimary: true,
            status: 'connected',
          },
          {
            id: 'local-text-polish',
            name: 'Local Text Polish',
            provider: 'local-preview',
            endpoint: '',
            apiKey: '',
            model: 'samimage-local-text-polish',
            kind: 'text',
            isPrimary: true,
            status: 'connected',
          },
        ],
        prompts: [],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Exports',
          defaultExportFormat: 'svg',
          defaultGenerationSize: 1024,
          defaultBatchSize: 1,
          defaultStyle: '赛博',
          autoSaveHistory: true,
          includePromptMetadata: true,
          theme: 'dark',
        },
      }),
    )
  })

  await page.goto('/workspace?mode=txt2img&prompt=星际观察站')
  await expect(page.getByLabel('文本润色模型')).toHaveValue('local-text-polish')
  await page.getByRole('button', { name: '润色' }).click()
  await expect(page.locator('.prompt-preview')).toContainText('星际观察站')
  await expect(page.locator('.prompt-preview')).toContainText('赛博')
  await expect(page.locator('.prompt-preview')).toContainText('Local Text Polish')
  await expect(page.getByText('已使用 Local Text Polish 润色提示词')).toBeVisible()
})

test('generation defaults from settings initialize a new workspace', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '生成参数' }).click()
  await page.getByLabel('默认尺寸').fill('1536')
  await page.getByLabel('默认数量').selectOption('2')
  await page.getByLabel('默认风格预设').selectOption('赛博')
  await page.getByRole('button', { name: '保存生成参数' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=txt2img&prompt=默认生成参数回归测试')
  await expect(page.getByLabel('宽度')).toHaveValue('1536')
  await expect(page.getByLabel('高度')).toHaveValue('1536')
  await expect(page.getByRole('button', { name: '赛博' })).toHaveClass(/active/)
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('2')

  await page.getByRole('button', { name: '生成新结果' }).click()
  await expect(page.locator('.sample')).toHaveCount(2)
  await page.getByRole('link', { name: /历史/ }).click()
  await page.getByRole('button', { name: /默认生成参数回归测试/ }).first().click()
  await expect(page.getByText('1536 x 1536', { exact: true })).toBeVisible()
})
