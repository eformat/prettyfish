import { test, expect } from '@playwright/test'

test.describe('MCP resync action', () => {
  test('shows refresh action while connected', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('open-mcp-button').click()
    await page.getByRole('button', { name: /start session|new session/i }).first().click()

    await expect(page.getByText(/^Connected$/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /refresh connection/i })).toBeVisible()
  })
})
