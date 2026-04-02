import { test, expect, Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')

async function screenshot(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: false,
  })
  console.log(`  📸 ${name}.png`)
}

async function waitForApp(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Wait for mermaid SVG to appear in the canvas
  await page.waitForSelector('svg', { timeout: 10000 })
  await page.waitForTimeout(800)
}

test.describe('Pretty Fish — Visual Tests', () => {

  test('01 — initial load (light mode)', async ({ page }) => {
    await waitForApp(page)
    await screenshot(page, '01-initial-light')
    // Header logo pill visible
    await expect(page.locator('[data-testid="header-logo-pill"]')).toBeVisible()
    // Pages dropdown trigger visible
    await expect(page.locator('[data-testid="pages-dropdown-trigger"]')).toBeVisible()
    // SVG diagram rendered
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('02 — dark mode', async ({ page }) => {
    await waitForApp(page)
    // Click moon/sun icon — it's the button with aria or SVG in the toolbar
    // Find the dark mode toggle button in the right toolbar pill
    const toolbar = page.locator('[class*="pointer-events-auto"]').filter({ hasText: /Export|Share/ }).first()
    // Moon icon button
    const moonBtn = toolbar.locator('button').nth(3) // Theme / dark / present / share / export / help
    await moonBtn.click()
    await page.waitForTimeout(500)
    await screenshot(page, '02-dark-mode')
  })

  test('03 — pages dropdown open + hover states', async ({ page }) => {
    await waitForApp(page)
    await page.locator('[data-testid="pages-dropdown-trigger"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="pages-dropdown-list"]')).toBeVisible()
    await screenshot(page, '03-pages-dropdown-open')
    // Close it
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })

  test('04 — create new page → template gallery', async ({ page }) => {
    await waitForApp(page)
    await page.locator('[data-testid="pages-dropdown-trigger"]').click()
    await page.waitForTimeout(200)
    // Find and click the New diagram button
    await page.locator('[data-testid="pages-new-diagram"]').click()
    await page.waitForTimeout(400)
    await screenshot(page, '04-template-gallery')
    // Template gallery heading visible
    await expect(page.getByText('Cast your net')).toBeVisible()
  })

  test('05 — template selection → renders diagram', async ({ page }) => {
    await waitForApp(page)
    // Open new page
    await page.locator('[data-testid="pages-dropdown-trigger"]').click()
    await page.locator('[data-testid="pages-dropdown-list"]').getByText('New diagram').click()
    await page.waitForTimeout(300)
    // Click Git Graph template
    await page.getByText('Git Graph').click()
    await page.waitForTimeout(2000)
    await screenshot(page, '05-git-graph-template')
    // SVG should render
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('06 — editor typing updates diagram', async ({ page }) => {
    await waitForApp(page)
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.waitForTimeout(100)
    await page.keyboard.type('flowchart LR\n  Start --> End')
    await page.waitForTimeout(2000)
    await screenshot(page, '06-editor-updates-diagram')
  })

  test('07 — settings tab', async ({ page }) => {
    await waitForApp(page)
    // Settings tab is the gear icon — it's the 2nd icon button in the sidebar toolbar
    const sidebarPanel = page.locator('[data-sidebar-panel]')
    const gearBtn = sidebarPanel.locator('button').nth(1) // 0=code, 1=settings
    await gearBtn.click()
    await page.waitForTimeout(300)
    await screenshot(page, '07-settings-tab')
  })

  test('08 — theme selector dropdown', async ({ page }) => {
    await waitForApp(page)
    // Theme button is in the right toolbar
    const themeBtn = page.locator('button').filter({ has: page.locator('text=Default') }).first()
    await themeBtn.click()
    await page.waitForTimeout(200)
    await screenshot(page, '08-theme-dropdown')
    // Switch to Amethyst
    await page.getByText('Amethyst').click()
    await page.waitForTimeout(1200)
    await screenshot(page, '08b-amethyst-theme')
  })

  test('09 — export popover', async ({ page }) => {
    await waitForApp(page)
    await page.waitForTimeout(1500)
    // Export button
    const exportBtn = page.locator('button').filter({ has: page.locator('text=Export') }).first()
    await exportBtn.click()
    await page.waitForTimeout(300)
    await screenshot(page, '09-export-popover')
  })

  test('10 — reference docs panel', async ({ page }) => {
    await waitForApp(page)
    // Books icon button in the right toolbar
    const toolbar = page.locator('[class*="pointer-events-auto"]').filter({ hasText: /Export|Share/ }).first()
    const lastBtn = toolbar.locator('button').last()
    await lastBtn.click()
    await page.waitForTimeout(500)
    await screenshot(page, '10-reference-docs')
  })

  test('11 — folder creation', async ({ page }) => {
    await waitForApp(page)
    await page.locator('[data-testid="pages-dropdown-trigger"]').click()
    await page.waitForTimeout(200)
    // Find "New Folder" button
    const folderBtn = page.locator('[data-testid="pages-dropdown-list"]').locator('button').filter({ hasText: /folder/i }).first()
    if (await folderBtn.count() > 0) {
      await folderBtn.click()
      await page.waitForTimeout(300)
      await screenshot(page, '11-new-folder')
    } else {
      await screenshot(page, '11-dropdown-no-folder-btn')
    }
  })

  test('12 — error state in editor', async ({ page }) => {
    await waitForApp(page)
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('flowchart TD\n  BROKEN @@@ SYNTAX ###')
    await page.waitForTimeout(3000)
    await screenshot(page, '12-error-state')
  })

  test('13 — sidebar resize', async ({ page }) => {
    await waitForApp(page)
    const sidebarPanel = page.locator('[data-sidebar-panel]')
    const box = await sidebarPanel.boundingBox()
    if (box) {
      const handleX = box.x + box.width + 3
      const handleY = box.y + box.height / 2
      await page.mouse.move(handleX, handleY)
      await page.mouse.down()
      await page.mouse.move(handleX + 120, handleY, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
    await screenshot(page, '13-sidebar-wider')
  })

  test('14 — mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await waitForApp(page)
    await screenshot(page, '14-mobile')
  })

  test('15 — full overview, all panels side by side', async ({ page }) => {
    await waitForApp(page)
    await page.waitForTimeout(2000)
    // Also open reference docs
    const toolbar = page.locator('[class*="pointer-events-auto"]').filter({ hasText: /Export|Share/ }).first()
    await toolbar.locator('button').last().click()
    await page.waitForTimeout(500)
    await screenshot(page, '15-full-overview-with-docs')
  })

})
