import { expect, test } from '@playwright/test'
import { createApp } from '../support/pretty-fish-app'

test.describe('Mobile shell', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await createApp(page).openFresh()
  })

  test('keeps the mobile editor collapsed by default after selecting a diagram', async ({ page }) => {
    const app = createApp(page)

    await app.startFlowchartDiagram()

    await expect(app.editor.root).toBeVisible()
    await expect(page.getByRole('button', { name: 'Expand editor panel' })).toBeVisible()
    await app.mobile.shouldKeepCanvasClear()
  })

  test('opens the editor when a diagram is tapped on mobile', async ({ page }) => {
    const app = createApp(page)

    await app.startFlowchartDiagram()
    // After creating a diagram the editor is open
    await expect(app.editor.root).toBeVisible()

    // Close the editor by toggling the sidebar
    await page.getByTestId('toggle-sidebar-button').click()
    await app.mobile.shouldKeepCanvasClear()

    // Tapping a diagram should re-open the editor
    await app.canvas.selectDiagram(1)
    await expect(app.editor.root).toBeVisible()
  })

  test('shows the important compact controls on mobile', async ({ page }) => {
    const app = createApp(page)

    await app.mobile.shouldShowPrimaryControls()
  })

  test('lets the reader add a new diagram from the mobile floating action button', async ({ page }) => {
    const app = createApp(page)

    await app.createFlowchartDiagram()
    await app.canvas.createDiagramOnMobile()
    await app.canvas.shouldShowDiagramCount(2)
  })
})
