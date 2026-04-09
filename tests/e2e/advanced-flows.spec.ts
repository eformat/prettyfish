import { expect, test } from '@playwright/test'
import { createApp } from './pretty-fish-app'

test.describe('Advanced flows', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await createApp(page).openFresh()
  })

  test('keeps the workspace unchanged when reset is canceled', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()
    await app.header.createPage()
    await app.startFlowchartDiagram()

    await app.header.resetButton.click()
    await expect(page.getByRole('dialog')).toContainText('Reset workspace?')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await app.header.openPagesMenu()
    await expect(page.getByTestId('page-item-active')).toContainText('Page 2')
    await expect(page.getByTestId('page-item')).toHaveCount(1)
  })

  test('duplicates the selected diagram from the context menu', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()
    await app.canvas.openDiagramContextMenu()
    await app.canvas.duplicateFromContextMenu()

    await app.canvas.shouldShowDiagramCount(2)
  })

  test('copies a share link from the diagram context menu', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()
    await app.canvas.openDiagramContextMenu()
    await page.getByRole('button', { name: 'Share link' }).click()
    await page.waitForTimeout(300)

    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toContain('#/d/')
  })

  test('persists diagram name and description edits across reloads', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()

    const nameInput = page.getByTestId('diagram-name-input').first()
    await nameInput.fill('Checkout Flow')
    await nameInput.press('Enter')

    const descInput = page.getByTestId('diagram-description-input').first()
    await descInput.fill('Primary user purchase path')
    await descInput.press('Enter')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('diagram-name-input').first()).toHaveValue('Checkout Flow')
    await expect(page.getByTestId('diagram-description-input').first()).toHaveValue('Primary user purchase path')
  })

  test('lets the reader collapse and expand the editor panel', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()

    const toggle = page.getByRole('button', { name: 'Collapse editor panel' })
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Expand editor panel' })).toBeVisible()

    await page.getByRole('button', { name: 'Expand editor panel' }).click()
    await expect(page.getByRole('button', { name: 'Collapse editor panel' })).toBeVisible()
  })
})
