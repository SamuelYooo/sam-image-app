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

  await expect(page.getByRole('heading', { name: '生成结果预览' })).toBeVisible()
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
