/**
 * MCP Panel UI tests.
 *
 * Tests the "Connect AI Agent" panel UI states without requiring
 * an actual relay server — we test the UI interactions locally.
 */
import { expect, test } from '@playwright/test'
import { createApp } from '../support/pretty-fish-app'

test.describe('MCP Panel', () => {
  test('Connect AI Agent button is visible in the header', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await expect(page.getByTestId('open-mcp-button')).toBeVisible()
  })

  test('button shows "Connect AI Agent" text on desktop', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    const btn = page.getByTestId('open-mcp-button')
    // Text is hidden below lg breakpoint but visible at 1440px
    await expect(btn).toContainText('Connect AI Agent')
  })

  test('clicking the button opens the MCP panel', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await app.header.openMcpPanel()
    await expect(page.getByTestId('mcp-panel')).toBeVisible()
  })

  test('MCP panel shows "How it works" instructions', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await app.header.openMcpPanel()

    const panel = page.getByTestId('mcp-panel')
    await expect(panel).toContainText('How it works')
    await expect(panel).toContainText('Start a session')
  })

  test('MCP panel has a Start session button', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await app.header.openMcpPanel()

    const panel = page.getByTestId('mcp-panel')
    await expect(panel.getByRole('button', { name: /start session/i })).toBeVisible()
  })

  test('closing the panel works', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await app.header.openMcpPanel()

    // Panel is open
    await expect(page.getByTestId('mcp-panel')).toBeVisible()

    // Click outside to close or use Escape
    await page.keyboard.press('Escape')
    // Panel should close or be hidden
    await expect(page.getByTestId('mcp-panel')).not.toBeVisible({ timeout: 2_000 })
  })

  test('triple-clicking the button shows sponsor nudge', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()

    // Clear any stored sponsor nudge state
    await page.evaluate(() => {
      localStorage.removeItem('prettyfish:sponsor-nudge')
    })

    const btn = page.getByTestId('open-mcp-button')

    // Triple-click rapidly
    await btn.click({ clickCount: 3, delay: 50 })

    // Sponsor nudge should appear
    await expect(page.getByTestId('sponsor-nudge')).toBeVisible({ timeout: 2_000 })
  })

  test('sponsor nudge can be dismissed', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()

    await page.evaluate(() => {
      localStorage.removeItem('prettyfish:sponsor-nudge')
    })

    const btn = page.getByTestId('open-mcp-button')
    await btn.click({ clickCount: 3, delay: 50 })

    const nudge = page.getByTestId('sponsor-nudge')
    await expect(nudge).toBeVisible({ timeout: 2_000 })

    // Dismiss it
    await nudge.getByRole('button', { name: /dismiss|close|×/i }).click()
    await expect(nudge).not.toBeVisible({ timeout: 2_000 })
  })
})

test.describe('MCP Panel — theme dropdown', () => {
  test('theme dropdown shows all registered themes', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()

    // Open theme dropdown
    const themeBtn = page.getByTestId('theme-dropdown-trigger')
    await themeBtn.click()

    const dropdown = page.getByTestId('theme-dropdown-list')
    await expect(dropdown).toBeVisible()

    // Check for key themes
    await expect(dropdown).toContainText('Blueprint')
    await expect(dropdown).toContainText('Wireframe')
    await expect(dropdown).toContainText('Rosé Pine')
    await expect(dropdown).toContainText('Brutalist')
  })

  test('selecting a theme updates the diagram', async ({ page }) => {
    const app = createApp(page)
    await app.openFresh()
    await app.startFlowchartDiagram()

    // Switch to Blueprint theme
    await app.header.chooseTheme('blueprint')

    // Canvas should still show diagram
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 5_000 })
  })
})
