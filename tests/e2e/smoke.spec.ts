import { expect, test } from '@playwright/test'

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
