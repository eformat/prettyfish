import { test, expect } from '@playwright/test'
import { ACTIVE_THEME_IDS } from '../../../src/lib/themePresets'

test('all active themes appear in the theme dropdown', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Open theme dropdown
  await page.click('[data-testid="theme-dropdown-trigger"]')

  // Verify every active theme ID has a corresponding option
  for (const themeId of ACTIVE_THEME_IDS) {
    const option = page.locator(`[data-theme-value="${themeId}"]`)
    await expect(option, `Theme "${themeId}" should appear in dropdown`).toBeVisible()
  }
})

test('clicking a theme in the dropdown applies it', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Open dropdown and click Brutalist
  await page.click('[data-testid="theme-dropdown-trigger"]')
  await page.click('[data-theme-value="brutalist"]')

  // Dropdown should close and trigger should show the new theme label
  await expect(page.locator('[data-testid="theme-dropdown-trigger"]')).toContainText('Brutalist')
})
