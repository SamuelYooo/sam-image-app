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
  await page.getByRole('button', { name: '开始生成' }).click()

  await expect(page.getByText('已生成')).toBeVisible()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
  await expect(page.getByText('小红书 AI 工具合集封面').first()).toBeVisible()
})

test('history clear persists after reload', async ({ page }) => {
  await page.goto('/workspace?mode=cover')

  await page.getByText('点击打开大编辑器').click()
  await page.getByPlaceholder('输入更完整的正向提示词').fill('清空历史回归测试封面')
  await page.getByRole('button', { name: '应用到工作台' }).click()
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
  await expect(page.getByText('清空历史回归测试封面').first()).toBeVisible()

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: '清空资产库', exact: true }).click()
  await expect(page.getByText('暂无资产')).toBeVisible()

  await page.reload()
  await expect(page.getByText('暂无资产')).toBeVisible()
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

test('workspace prompt library keeps controls stable for long content', async ({ page }) => {
  await page.goto('/workspace?mode=cover')
  await expect(page.locator('.prompt-preview')).toBeVisible()
  await page.locator('.prompt-preview').click()
  await expect(page.locator('.prompt-editor')).toBeVisible()
  const promptEditorBox = await page.locator('.prompt-editor').boundingBox()
  expect(promptEditorBox).toBeTruthy()
  expect(promptEditorBox!.height).toBeGreaterThan(260)
  await page.getByRole('button', { name: '从词库选择' }).click()

  const promptItem = page.locator('.prompt-item').first()
  const actionButton = promptItem.getByRole('button', { name: '使用' })
  const searchInput = page.locator('.library-search')
  const categoryButton = page.locator('.category-button').first()
  const libraryMain = page.locator('.library-main')

  await expect(promptItem).toBeVisible()
  await expect(actionButton).toBeVisible()
  await expect(searchInput).toBeVisible()
  await expect(categoryButton).toBeVisible()
  const libraryCategories = page.locator('.library-categories')
  await expect(libraryCategories.getByRole('button', { name: /图标/ })).toBeVisible()
  await expect(libraryCategories.getByRole('button', { name: /^ICON$/ })).toHaveCount(0)

  await promptItem.locator('p').evaluate((node) => {
    node.textContent = '这是一条用于验证提示词库布局的超长提示词，包含大量修饰语、镜头语言、材质描述、光影层次、构图要求、色彩控制、风格约束与输出细节，重复展开以观察弹层列表在内容过长时是否仍然保持按钮尺寸稳定，不会把右侧使用按钮拉成长条。'.repeat(3)
  })
  await categoryButton.evaluate((node) => {
    node.textContent = 'Use GPT Image2 API'
  })

  const [itemBox, buttonBox, searchBox, mainBox, categoryBox] = await Promise.all([
    promptItem.boundingBox(),
    actionButton.boundingBox(),
    searchInput.boundingBox(),
    libraryMain.boundingBox(),
    categoryButton.boundingBox(),
  ])

  expect(itemBox).toBeTruthy()
  expect(buttonBox).toBeTruthy()
  expect(searchBox).toBeTruthy()
  expect(mainBox).toBeTruthy()
  expect(categoryBox).toBeTruthy()
  expect(itemBox!.height).toBeGreaterThan(buttonBox!.height)
  expect(buttonBox!.height).toBeLessThanOrEqual(36)
  expect(buttonBox!.width).toBeLessThanOrEqual(72)
  expect(searchBox!.width).toBeLessThan(mainBox!.width)
  expect(searchBox!.width).toBeLessThanOrEqual(372)
  expect(categoryBox!.height).toBeLessThanOrEqual(58)
})

test('workspace icon mode uses master size and shows export size presets', async ({ page }) => {
  await page.goto('/workspace?mode=icon')

  const sizeBlock = page.locator('.block').filter({ has: page.getByText('输出尺寸') }).first()

  // ICON 模式固定使用 1024x1024 母图
  await expect(sizeBlock).toContainText('1024 x 1024')
  await expect(page.getByText('ICON 模式固定生成 1024×1024 母图')).toBeVisible()

  // 尺寸预设以信息卡片形式展示
  await expect(page.locator('.icon-size-card').filter({ hasText: '16 x 16' })).toBeVisible()
  await expect(page.locator('.icon-size-card').filter({ hasText: '512 x 512' })).toBeVisible()
})

test('workspace icon mode can export a multi-size ico zip bundle', async ({ page }) => {
  await page.goto('/workspace?mode=icon&prompt=ICO 多尺寸导出测试图标')

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  // ICON 模式默认就是 ICO 格式
  await expect(page.getByLabel('格式')).toHaveValue('ico')
  await expect(page.getByLabel('倍率')).toHaveCount(0)
  // 项目名称默认是时间戳格式
  const projectName = await page.getByLabel('项目名称').inputValue()
  expect(projectName).toMatch(/^icon-\d{8}-\d{6}$/)
  await expect(page.getByLabel('导出尺寸 16 x 16')).toBeChecked()
  await expect(page.getByLabel('导出尺寸 64 x 64')).toBeChecked()
  await page.getByLabel('导出尺寸 32 x 32').uncheck()
  await page.getByLabel('导出尺寸 48 x 48').uncheck()
  await page.getByLabel('导出尺寸 128 x 128').uncheck()
  await page.getByLabel('导出尺寸 256 x 256').uncheck()
  await page.getByLabel('导出尺寸 512 x 512').uncheck()

  // 浏览器模式：每个尺寸独立 ICO 文件 → 打包为一个 ZIP 下载
  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出 ICO' }).click(), 1)
  const zipDownload = downloads[0]
  expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/)
  const zipPath = await zipDownload.path()
  expect(zipPath).toBeTruthy()
})

test('tool catalog opens workspace with a focused generation intent', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: /ICON 图标/ }).click()

  await expect(page).toHaveURL(/\/workspace\?/)
  await expect(page.locator('.prompt-preview')).toContainText('本地 AI 图像工具 App Icon')
  await expect(page.locator('.tool-pick-card').filter({ hasText: 'ICON 图标' })).toHaveClass(/active/)

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
  await expect(page.getByText('本地 AI 图像工具 App Icon').first()).toBeVisible()
})

test('workspace explains the active generation mode data flow', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img')

  await expect(page.getByText('文生图读取提示词与画面参数，从零生成全新图像，无需上传任何参考图。')).toBeVisible()

  await page.locator('.tool-pick-card').filter({ hasText: '图生图' }).click()
  await expect(page.getByText('图生图读取参考图与重绘幅度，在保留原结构的基础上生成新的风格变体。')).toBeVisible()

  await page.locator('.tool-pick-card').filter({ hasText: 'GIF 动图' }).click()
  await expect(page.getByText('上游返回静态主图，前端按帧率/时长/循环方式合成真动图')).toBeVisible()
})

test('workspace adapts content when switching tools within the same mode', async ({ page }) => {
  await page.goto('/workspace?tool=remove-background')

  await expect(page.locator('.tool-banner-title')).toHaveText('去背景')
  await expect(page.getByLabel('边缘羽化')).toBeVisible()
  await expect(page.getByLabel('输出形式')).toBeVisible()
  await expect(page.locator('.tool-tips')).toContainText('发丝、毛绒等复杂边缘建议提高边缘羽化。')
  await expect(page.getByText('去背景读取参考图与边缘羽化强度，分离主体并清理背景，输出可直接合成的透明 PNG。')).toBeVisible()

  await page.locator('.tool-pick-card').filter({ hasText: 'AI 证件照' }).click()

  await expect(page.locator('.tool-banner-title')).toHaveText('AI 证件照')
  const idPhotoControls = page.locator('.tool-controls-block')
  await expect(idPhotoControls.getByText('底色')).toBeVisible()
  await expect(idPhotoControls.getByRole('button', { name: '白底' })).toBeVisible()
  await expect(page.getByLabel('规格')).toBeVisible()
  await expect(page.getByLabel('边缘羽化')).toHaveCount(0)
  await expect(page.locator('.tool-tips')).toContainText('底色与规格按目标用途选择，常见证件用白底一寸。')
  await expect(page.locator('.prompt-preview')).toContainText('标准证件照效果，白色或浅色背景，正面人像')
  await expect(page.getByText('已切换到工具：AI 证件照')).toBeVisible()
})

test('workspace 3d mode offers visual style references and applies one', async ({ page }) => {
  await page.goto('/workspace?mode=3d')

  await expect(page.getByRole('button', { name: '查看精细石雕' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看科幻装甲' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看蒸汽朋克' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看白瓷镂刻' })).toBeVisible()
  await expect(page.getByRole('button', { name: '查看潮流手办' })).toBeVisible()

  await page.getByRole('button', { name: '查看精细石雕' }).click()
  const modal = page.locator('.three-d-preview-modal')
  await expect(modal.getByRole('heading', { name: '精细石雕' })).toBeVisible()
  await expect(modal.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/)
  await modal.getByRole('button', { name: '应用此风格' }).click()

  await expect(page.locator('.prompt-preview')).toContainText('精细石雕风格的 3D 主体')
  await expect(page.locator('.tool-banner-title')).toHaveText('3D 图生成')
  await expect(page.getByLabel('立体感')).toHaveValue('88')
  await expect(page.getByText('已应用 3D 风格：精细石雕')).toBeVisible()

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
  await expect(page.locator('.sample').first()).toContainText('3D 图 1')
})

test('workspace export requires a selected generated result', async ({ page }) => {
  await page.goto('/workspace?mode=cover')

  await page.getByRole('button', { name: '导出', exact: true }).click()

  await expect(page.getByText('请先生成或选择结果')).toBeVisible()
  await expect(page.getByRole('heading', { name: '导出结果' })).toHaveCount(0)
})

test('default export format from settings is used by workspace export', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByLabel('默认导出格式').selectOption('webp')
  await page.getByRole('button', { name: '保存系统设置' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=默认导出格式测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
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

test('workspace can export the visible recent result after reload', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=可见最近结果导出回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.reload()
  await expect(page.locator('.sample').first()).toBeVisible()
  await expect(page.getByText('尚未选择结果')).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.getByRole('heading', { name: '导出结果' })).toBeVisible()

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  expect(findDownload(downloads, '.svg').suggestedFilename()).toMatch(/\.svg$/)
  expect(findDownload(downloads, '.metadata.json').suggestedFilename()).toMatch(/\.metadata\.json$/)
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

test('settings directory picker persists without a separate save click', async ({ page }) => {
  await page.addInitScript(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\PickedNoSave'
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()

  await expect(page.getByLabel('默认输出目录')).toHaveValue('D:\\SamImage\\PickedNoSave')

  await page.reload()
  await page.getByRole('button', { name: '系统设置' }).click()
  await expect(page.getByLabel('默认输出目录')).toHaveValue('D:\\SamImage\\PickedNoSave')
})

test('settings reset demo data requires confirmation before clearing user data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'reset-guard-prompt',
            title: '恢复保护提示词',
            prompt: '取消恢复时必须保留的提示词',
            source: 'custom',
            sourceId: 'reset-guard',
            category: '封面',
            subCategory: '',
            author: 'User',
            tags: ['保护'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-07T00:00:00.000Z',
          },
        ],
        tasks: [],
        coverPresets: [],
        settings: {
          defaultOutputDir: 'D:\\SamImage\\Custom',
          defaultExportFormat: 'webp',
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
  await page.getByRole('button', { name: '系统设置' }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('恢复初始数据')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '恢复初始数据' }).click()

  await expect(page.getByLabel('默认输出目录')).toHaveValue('D:\\SamImage\\Custom')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()
  await expect(page.getByText('恢复保护提示词')).toBeVisible()
})

test('export dialogs can pick output directories from all result surfaces', async ({ page }) => {
  await page.addInitScript(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\WorkspacePicked'
  })

  await page.goto('/workspace?mode=cover&prompt=导出目录选择回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\WorkspacePicked')
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.settings?.defaultOutputDir
  })).toBe('D:\\SamImage\\WorkspacePicked')
  await page.getByRole('button', { name: '×' }).last().click()

  await page.evaluate(() => {
    window.samimageE2eDirectory = 'D:\\SamImage\\HistoryPicked'
  })
  await page.getByRole('link', { name: /资产库/ }).click()
  await page.getByRole('button', { name: /导出目录选择回归测试封面/ }).first().click()
  await page.getByRole('button', { name: '导出到本地' }).click()
  await page.getByRole('button', { name: '重新选择目录' }).click()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\HistoryPicked')
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.settings?.defaultOutputDir
  })).toBe('D:\\SamImage\\HistoryPicked')
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
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.settings?.defaultOutputDir
  })).toBe('D:\\SamImage\\HomePicked')
})

test('workspace export scale produces a larger png download', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=导出倍率回归测试封面')
  await page.getByLabel('宽度').fill('320')
  await page.getByLabel('高度').fill('240')
  await page.getByRole('button', { name: '开始生成' }).click()
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
  await page.getByRole('button', { name: '开始生成' }).click()
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

test('workspace export metadata includes mode-specific parameters', async ({ page }) => {
  await page.goto('/workspace?mode=img2img&prompt=图生图模式参数回归测试')
  await page.getByLabel('图片强度').fill('68')
  await page.getByLabel('Resize Mode').selectOption('crop-resize')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('格式').selectOption('png')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  const metadataDownload = findDownload(downloads, '.metadata.json')
  const metadataPath = await metadataDownload.path()
  expect(metadataPath).toBeTruthy()
  const metadata = JSON.parse(await readFile(metadataPath!, 'utf8'))

  expect(metadata.modeOptions).toEqual({
    imageStrength: 68,
    resizeMode: 'crop-resize',
  })
})

test('workspace export omits prompt metadata when disabled', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '生成参数' }).click()
  await page.getByLabel('导出时包含提示词元数据').uncheck()
  await page.getByRole('button', { name: '保存生成参数' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=关闭元数据导出回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('格式').selectOption('png')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 1)
  expect(downloads).toHaveLength(1)
  expect(downloads[0].suggestedFilename()).toMatch(/\.png$/)
})

test('gif workspace exports a gif asset when gif format is selected', async ({ page }) => {
  await page.goto('/workspace?mode=gif&prompt=GIF 导出回归测试动图')
  await page.getByText('批量').locator('..').getByRole('slider').fill('1')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
  await expect(page.locator('.sample').first()).toContainText('GIF 动图 1')

  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByLabel('格式').selectOption('gif')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出图片' }).click(), 2)
  const download = findDownload(downloads, '.gif')
  expect(download.suggestedFilename()).toMatch(/\.gif$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const content = await readFile(path!)
  expect(content.subarray(0, 6).toString('ascii')).toBe('GIF89a')
})

test('history detail export confirms format before browser download', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=历史导出弹窗回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
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
  await page.getByRole('button', { name: '清空资产库', exact: true }).click()
  await expect(page.getByText('暂无资产')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=历史批量导出 A')
  await page.getByText('批量').locator('..').getByRole('slider').fill('1')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.goto('/workspace?mode=icon&prompt=历史批量导出 B')
  await page.getByText('批量').locator('..').getByRole('slider').fill('1')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
  await page.getByRole('button', { name: '导出全部' }).click()

  await expect(page.getByRole('heading', { name: '导出全部' })).toBeVisible()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\Exports')
  await page.getByLabel('格式').selectOption('webp')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '确认导出全部' }).click(), 4)
  expect(downloads.filter((download) => download.suggestedFilename().endsWith('.webp'))).toHaveLength(2)
  expect(downloads.filter((download) => download.suggestedFilename().endsWith('.metadata.json'))).toHaveLength(2)
})

test('history reuse restores generation parameters in workspace', async ({ page }) => {
  await page.goto('/workspace?mode=img2img&prompt=历史复用参数回归测试')
  await page.getByRole('button', { name: '赛博' }).click()
  await page.getByLabel('宽度').fill('1536')
  await page.getByLabel('高度').fill('1024')
  await page.getByText('批量').locator('..').getByRole('slider').fill('2')
  await page.getByText('步数').locator('..').getByRole('slider').fill('44')
  await page.getByText('Seed').locator('..').getByRole('spinbutton').fill('987654')
  await page.getByLabel('图片强度').fill('68')
  await page.getByLabel('Resize Mode').selectOption('crop-resize')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample')).toHaveCount(2)

  await page.getByRole('link', { name: /资产库/ }).click()
  await page.getByRole('button', { name: /历史复用参数回归测试/ }).first().click()
  await page.getByRole('button', { name: '复用提示词' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.locator('.prompt-preview')).toContainText('历史复用参数回归测试')
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByRole('button', { name: '赛博' })).toHaveClass(/active/)
  await expect(page.getByLabel('宽度')).toHaveValue('1536')
  await expect(page.getByLabel('高度')).toHaveValue('1024')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('2')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('44')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('987654')
  await expect(page.getByLabel('图片强度')).toHaveValue('68')
  await expect(page.getByLabel('Resize Mode')).toHaveValue('crop-resize')
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
            modeOptions: {
              imageStrength: 72,
              resizeMode: 'resize-fill',
            },
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
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByLabel('宽度')).toHaveValue('896')
  await expect(page.getByLabel('高度')).toHaveValue('1152')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('2')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('37')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('7654321')
  await expect(page.getByLabel('图片强度')).toHaveValue('72')
  await expect(page.getByLabel('Resize Mode')).toHaveValue('resize-fill')
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

test('history cards and detail dialog stay stable with long prompts', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#57a6ff"/></svg>')
    const longPrompt = `历史长提示词布局回归测试-${'UltraLongPromptWithoutSpaces'.repeat(18)}`
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks: [
          {
            id: 'history-long-task',
            mode: 'cover',
            prompt: longPrompt,
            negativePrompt: '',
            modelId: `model-${'very-long-id'.repeat(12)}`,
            width: 512,
            height: 512,
            batchSize: 1,
            steps: 24,
            seed: 7,
            style: '自然',
            status: 'completed',
            assets: [
              {
                id: 'history-long-asset',
                taskId: 'history-long-task',
                title: 'history-long-asset',
                width: 512,
                height: 512,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
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
  const card = page.locator('.history-card').filter({ hasText: '历史长提示词布局回归测试' })
  const cardTitle = card.locator('.image-info strong')
  const favoriteButton = card.getByRole('button', { name: '收藏' })
  await expect(card).toBeVisible()
  const [cardBox, titleBox, favoriteBox] = await Promise.all([
    card.boundingBox(),
    cardTitle.boundingBox(),
    favoriteButton.boundingBox(),
  ])
  expect(cardBox).toBeTruthy()
  expect(titleBox).toBeTruthy()
  expect(favoriteBox).toBeTruthy()
  expect(titleBox!.height).toBeLessThanOrEqual(44)
  expect(favoriteBox!.width).toBeLessThanOrEqual(34)

  await card.locator('.image-card').click()
  const modal = page.locator('.modal').filter({ hasText: '生成详情' })
  await expect(modal).toBeVisible()
  const [modalBox, promptBox] = await Promise.all([
    modal.boundingBox(),
    modal.locator('.prompt-box').boundingBox(),
  ])
  expect(modalBox).toBeTruthy()
  expect(promptBox).toBeTruthy()
  expect(modalBox!.width).toBeLessThanOrEqual(720)
  expect(promptBox!.width).toBeLessThanOrEqual(modalBox!.width - 260)
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

test('home recent detail export confirms format before browser download', async ({ page }) => {
  await page.addInitScript(() => {
    const assetSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#57a6ff"/></svg>')
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks: [
          {
            id: 'home-export-task',
            mode: 'cover',
            prompt: '首页最近导出回归测试封面',
            negativePrompt: '低清晰度',
            modelId: 'local-preview',
            width: 640,
            height: 360,
            batchSize: 1,
            steps: 32,
            seed: 24680,
            style: '赛博',
            status: 'completed',
            assets: [
              {
                id: 'home-export-asset',
                taskId: 'home-export-task',
                title: '首页最近导出资源',
                width: 640,
                height: 360,
                format: 'svg',
                dataUrl: `data:image/svg+xml;charset=utf-8,${assetSvg}`,
                createdAt: '2026-01-11T00:00:00.000Z',
              },
            ],
            createdAt: '2026-01-11T00:00:00.000Z',
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
  await page.getByRole('button', { name: /首页最近导出回归测试封面/ }).click()
  await page.getByRole('button', { name: '导出到本地' }).click()

  await expect(page.getByRole('heading', { name: '导出到本地' })).toBeVisible()
  await expect(page.getByLabel('导出目录')).toHaveValue('D:\\SamImage\\Exports')
  await page.getByLabel('格式').selectOption('webp')

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '确认导出' }).click(), 2)
  const imageDownload = findDownload(downloads, '.webp')
  const metadataDownload = findDownload(downloads, '.metadata.json')
  expect(imageDownload.suggestedFilename()).toMatch(/\.webp$/)
  expect(metadataDownload.suggestedFilename()).toMatch(/\.metadata\.json$/)
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
            modeOptions: {
              imageStrength: 74,
              resizeMode: 'crop-resize',
            },
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
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByLabel('宽度')).toHaveValue('720')
  await expect(page.getByLabel('高度')).toHaveValue('1280')
  await expect(page.getByText('批量').locator('..').getByRole('slider')).toHaveValue('3')
  await expect(page.getByText('步数').locator('..').getByRole('slider')).toHaveValue('41')
  await expect(page.getByText('Seed').locator('..').getByRole('spinbutton')).toHaveValue('424242')
  await expect(page.getByLabel('图片强度')).toHaveValue('74')
  await expect(page.getByLabel('Resize Mode')).toHaveValue('crop-resize')
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

test('workspace shortcut toggles between text and image reference modes', async ({ page }) => {
  await page.goto('/workspace?mode=txt2img&prompt=模式切换快捷键回归测试')

  await page.keyboard.press('Control+Tab')
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByText('图生图读取参考图与重绘幅度，在保留原结构的基础上生成新的风格变体。')).toBeVisible()

  await page.keyboard.press('Control+Tab')
  await expect(page.locator('.tool-banner-title')).toHaveText('文生图')
  await expect(page.getByText('文生图读取提示词与画面参数，从零生成全新图像，无需上传任何参考图。')).toBeVisible()
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
  await page.getByRole('button', { name: '开始生成' }).click()
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
  await page.getByRole('button', { name: '开始生成' }).click()
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
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByAltText('参考图预览')).toBeVisible()

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toContainText('图生图 1')
})

test('workspace can reuse a generated result as an image reference', async ({ page }) => {
  await page.goto('/workspace?mode=cover&prompt=结果作为参考图回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('button', { name: '作为参考图', exact: true }).click()

  await expect(page.getByText('已将结果作为参考图')).toBeVisible()
  await expect(page.locator('.tool-banner-title')).toHaveText('图生图')
  await expect(page.getByText('参考图已载入，点击替换')).toBeVisible()
  await expect(page.getByAltText('参考图预览')).toBeVisible()
  await page.getByRole('button', { name: '开始生成' }).click()
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
  await page.getByLabel('自动保存到资产库').uncheck()
  await page.getByRole('button', { name: '保存生成参数' }).click()
  await expect(page.getByText('设置已保存')).toBeVisible()

  await page.goto('/workspace?mode=cover&prompt=不保存历史回归测试封面')
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
  await expect(page.getByText('暂无资产')).toBeVisible()
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

test('prompt market can delete imported prompts', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'delete-prompts.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ title: '待删除提示词', prompt: '这是待删除的导入提示词', category: '删除' }])),
    },
  ])

  await expect(page.getByText('待删除提示词')).toBeVisible()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除提示词')
    expect(dialog.message()).toContain('待删除提示词')
    await dialog.accept()
  })
  await page.locator('.prompt-card').filter({ hasText: '待删除提示词' }).getByRole('button', { name: '删除' }).click()

  await expect(page.getByText('已删除提示词：待删除提示词')).toBeVisible()
  await expect(page.getByText('待删除提示词')).toHaveCount(0)
})

test('prompt market shows an empty state when no prompts are available', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
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
      }),
    )
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()

  await expect(page.getByText('暂无 Prompts')).toBeVisible()
  await expect(page.getByText('请从上方拖拽或点击导入文件')).toBeVisible()
  await expect(page.locator('.prompt-card')).toHaveCount(0)
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

test('prompt market keeps search and actions stable with long imported prompts', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'prompt-layout-builtin',
            title: '内置长标题提示词'.repeat(6),
            prompt: '内置提示词内容'.repeat(24),
            source: 'builtin',
            sourceId: 'builtin-layout',
            category: 'Use GPT Image2 API',
            subCategory: '',
            author: 'SamImage',
            tags: ['内置'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'prompt-layout-custom',
            title: '导入超长提示词布局回归测试'.repeat(5),
            prompt: '这是一条导入的超长提示词，包含主体、构图、镜头、光影、材质、色彩和用途描述，用来验证 Prompts 市场列表不会把搜索框或按钮拉伸变形。'.repeat(5),
            source: 'custom',
            sourceId: 'custom-layout',
            category: 'E-commerceCaes',
            subCategory: '',
            author: 'User',
            tags: ['导入', '布局'],
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

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prompts 市场' }).click()
  await page.getByLabel('搜索提示词').fill('导入超长')
  await expect(page.getByText('导入超长提示词布局回归测试')).toBeVisible()
  await expect(page.getByText('内置长标题提示词')).toHaveCount(0)
  const promptCard = page.locator('.prompt-card').filter({ hasText: '导入超长提示词布局回归测试' })
  await expect(promptCard.getByText('电商案例')).toBeVisible()
  await expect(promptCard.getByText('E-commerceCaes')).toHaveCount(0)
  await page.getByLabel('提示词类型').selectOption('imported')

  const searchInput = page.getByLabel('搜索提示词')
  const deleteButton = promptCard.getByRole('button', { name: '删除' })
  const [cardBox, searchBox, deleteBox] = await Promise.all([
    promptCard.boundingBox(),
    searchInput.boundingBox(),
    deleteButton.boundingBox(),
  ])

  expect(cardBox).toBeTruthy()
  expect(searchBox).toBeTruthy()
  expect(deleteBox).toBeTruthy()
  expect(searchBox!.width).toBeLessThanOrEqual(430)
  expect(deleteBox!.height).toBeLessThanOrEqual(34)
  expect(deleteBox!.width).toBeLessThanOrEqual(86)
  await expect(deleteButton).toBeVisible()
})

test('prompt market use action opens workspace with the selected prompt', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'prompt-use-custom',
            title: '使用提示词回归测试',
            prompt: '从 Prompts 市场进入工作台的完整提示词内容',
            source: 'custom',
            sourceId: 'use-custom',
            category: '封面',
            subCategory: '',
            author: 'User',
            tags: ['封面'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-06T00:00:00.000Z',
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
  await page.locator('.prompt-card').filter({ hasText: '使用提示词回归测试' }).getByRole('button', { name: '使用' }).click()

  await expect(page).toHaveURL(/\/workspace/)
  await expect(page.locator('.prompt-preview')).toContainText('从 Prompts 市场进入工作台的完整提示词内容')
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

test('prompt market exports prompts as reusable json', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [
          {
            id: 'prompt-export-custom',
            title: '导出提示词回归测试',
            prompt: '导出后可重新导入的提示词内容',
            source: 'custom',
            sourceId: 'export-custom',
            category: '封面',
            subCategory: '',
            author: 'User',
            tags: ['封面', '导出'],
            preview: '',
            refImages: [],
            createdAt: '2026-01-05T00:00:00.000Z',
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

  const downloads = await collectDownloads(page, () => page.getByRole('button', { name: '导出 JSON' }).click(), 1)
  const download = findDownload(downloads, '.json')
  expect(download.suggestedFilename()).toBe('samimage-v3-prompts.json')
  const path = await download.path()
  expect(path).toBeTruthy()
  const exportedPrompts = JSON.parse(await readFile(path!, 'utf8'))
  expect(exportedPrompts).toEqual([
    expect.objectContaining({
      title: '导出提示词回归测试',
      prompt: '导出后可重新导入的提示词内容',
      source: 'custom',
      category: '封面',
    }),
  ])
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
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('恢复默认封面预设')
    await dialog.accept()
  })
  await page.getByRole('button', { name: '恢复默认封面预设' }).click()
  await expect(page.getByText('4 个启用')).toBeVisible()

  await page.goto('/tools')
  await expect(page.getByRole('button', { name: /小红书封面/ })).toBeVisible()
})

test('settings reset cover presets requires confirmation before removing custom presets', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'samimage.v3.state',
      JSON.stringify({
        models: [],
        prompts: [],
        tasks: [],
        coverPresets: [
          {
            id: 'xiaohongshu',
            name: '小红书封面',
            width: 1242,
            height: 1660,
            enabled: false,
            custom: false,
          },
          {
            id: 'reset-guard-cover',
            name: '恢复保护封面',
            width: 1000,
            height: 1500,
            enabled: true,
            custom: true,
          },
        ],
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
  await page.getByRole('button', { name: '系统设置' }).click()

  await expect(page.locator('.cover-row').filter({ hasText: '恢复保护封面' })).toBeVisible()
  await expect(page.getByLabel('启用 小红书封面')).not.toBeChecked()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('恢复默认封面预设')
    expect(dialog.message()).toContain('自定义封面预设')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '恢复默认封面预设' }).click()

  await expect(page.locator('.cover-row').filter({ hasText: '恢复保护封面' })).toBeVisible()
  await expect(page.getByLabel('启用 小红书封面')).not.toBeChecked()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return {
      customStillExists: state.coverPresets?.some((preset: { id: string }) => preset.id === 'reset-guard-cover'),
      builtinStillDisabled: state.coverPresets?.find((preset: { id: string }) => preset.id === 'xiaohongshu')?.enabled,
    }
  })).toEqual({
    customStillExists: true,
    builtinStillDisabled: false,
  })
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

test('settings can save a custom cover preset disabled before publishing to tools', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()

  await page.getByRole('button', { name: '新增预设' }).click()
  await page.getByLabel('名称').fill('设置页停用封面')
  await page.getByLabel('宽度').fill('1600')
  await page.getByLabel('高度').fill('900')
  await page.getByLabel('启用新预设').uncheck()
  await page.getByRole('button', { name: '添加预设' }).click()

  const presetRow = page.locator('.cover-row').filter({ hasText: '设置页停用封面' })
  await expect(presetRow).toContainText('1600 x 900')
  await expect(page.getByText('4 个启用')).toBeVisible()
  await expect(page.getByLabel('启用 设置页停用封面')).not.toBeChecked()

  await page.goto('/tools')
  await expect(page.locator('.cover-preset').filter({ hasText: '设置页停用封面' })).toHaveCount(0)

  await page.goto('/settings')
  await page.getByRole('button', { name: '系统设置' }).click()
  await page.getByLabel('启用 设置页停用封面').check()
  await expect(page.getByText('5 个启用')).toBeVisible()

  await page.goto('/tools')
  await expect(page.locator('.cover-preset').filter({ hasText: '设置页停用封面' })).toBeVisible()
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
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除封面预设')
    expect(dialog.message()).toContain('竖版课程封面')
    await dialog.accept()
  })
  await page.locator('.custom-preset-row').filter({ hasText: '竖版课程封面' }).getByRole('button', { name: '删除竖版课程封面' }).click()

  await expect(page.getByText('封面预设已删除')).toBeVisible()
  await expect(page.getByText('竖版课程封面')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.coverPresets?.some((preset: { name: string }) => preset.name === '竖版课程封面')
  })).toBe(false)
})

test('tools custom cover preset deletion requires confirmation', async ({ page }) => {
  await page.goto('/tools')

  await page.getByRole('button', { name: '自定义尺寸' }).click()
  await page.getByLabel('名称').fill('删除保护封面')
  await page.getByLabel('宽度').fill('1080')
  await page.getByLabel('高度').fill('1440')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('封面预设已添加')).toBeVisible()
  const customPreset = page.locator('.custom-preset-row').filter({ hasText: '删除保护封面' })
  await expect(customPreset).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除封面预设')
    expect(dialog.message()).toContain('删除保护封面')
    await dialog.dismiss()
  })
  await customPreset.getByRole('button', { name: '删除删除保护封面' }).click()

  await expect(customPreset).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.coverPresets?.some((preset: { name: string }) => preset.name === '删除保护封面')
  })).toBe(true)
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
  await expect(page.getByRole('heading', { name: '自定义封面预设' })).toBeVisible()
  await expect(page.getByLabel('名称')).toHaveValue('非法尺寸封面')
  await expect(page.getByLabel('宽度')).toHaveValue('0')
  await expect(page.getByLabel('高度')).toHaveValue('5000')
  await expect(page.locator('.custom-preset-row').filter({ hasText: '非法尺寸封面' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return Boolean(state.coverPresets?.some((preset: { name: string }) => preset.name === '非法尺寸封面'))
  })).toBe(false)

  await page.getByLabel('宽度').fill('1080')
  await page.getByLabel('高度').fill('1440')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('封面预设已添加')).toBeVisible()
  await expect(page.locator('.custom-preset-row').filter({ hasText: '非法尺寸封面' })).toBeVisible()
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
  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()

  await page.getByRole('link', { name: /资产库/ }).click()
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
  await page.getByRole('button', { name: '开始生成' }).click()
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

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample').first()).toBeVisible()
  await page.getByRole('link', { name: /资产库/ }).click()
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

test('settings model deletion requires confirmation before removing user models', async ({ page }) => {
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
            id: 'delete-guard-image',
            name: 'Delete Guard Image',
            provider: 'openai-compatible',
            endpoint: 'https://api.example.com/v1/images/generations',
            apiKey: 'sk-delete-guard',
            model: 'delete-guard-model',
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
  const modelCard = page.locator('.model-card').filter({ hasText: 'Delete Guard Image' })
  await expect(modelCard).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除模型')
    expect(dialog.message()).toContain('Delete Guard Image')
    await dialog.dismiss()
  })
  await modelCard.getByRole('button', { name: '删除' }).click()

  await expect(modelCard).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    return state.models?.some((model: { id: string }) => model.id === 'delete-guard-image')
  })).toBe(true)
})

test('settings model editor can fetch a model from the local catalog', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '新增图像模型' }).click()
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

test('settings model catalog supports text polish models', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '新增文本模型' }).click()
  await page.getByRole('button', { name: '获取模型' }).click()
  await expect(page.getByRole('heading', { name: '获取模型' })).toBeVisible()

  await page.getByPlaceholder('搜索模型…').fill('gpt-4o')
  await expect(page.getByRole('button', { name: 'gpt-4o-mini gpt-4o-mini' })).toBeVisible()
  await expect(page.getByText('flux-1-dev', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /gpt-4o-mini/ }).click()
  await page.getByRole('button', { name: '确认选择' }).click()

  await expect(page.getByText('已选择模型：gpt-4o-mini')).toBeVisible()
  await expect(page.getByLabel('模型名称')).toHaveValue('gpt-4o-mini')
  await expect(page.getByLabel('模型 ID')).toHaveValue('gpt-4o-mini')
  await expect(page.getByLabel('API 地址')).toHaveValue('https://api.openai.com/v1/chat/completions')
  await expect(page.getByLabel('类型')).toHaveValue('text')
})

test('settings can set the primary text model used by prompt polish', async ({ page }) => {
  await page.goto('/settings')

  await page.getByRole('button', { name: '新增文本模型' }).click()
  await page.getByLabel('模型名称').fill('Local Text Refiner')
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

  await page.getByRole('button', { name: '开始生成' }).click()
  await expect(page.locator('.sample')).toHaveCount(2)
  await page.getByRole('link', { name: /资产库/ }).click()
  await page.getByRole('button', { name: /默认生成参数回归测试/ }).first().click()
  await expect(page.getByText('1536 x 1536', { exact: true })).toBeVisible()
})
