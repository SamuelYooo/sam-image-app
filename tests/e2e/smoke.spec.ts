import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

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

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出图片' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.webp$/)
  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const content = await readFile(downloadedPath!)
  expect(content.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(content.subarray(8, 12).toString('ascii')).toBe('WEBP')
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
