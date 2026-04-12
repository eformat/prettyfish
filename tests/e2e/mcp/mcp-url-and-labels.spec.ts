import { test, expect } from '@playwright/test'

test.describe('MCP labels', () => {
  test('shows human copy labels for MCP snippets', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('open-mcp-button').click()
    await page.getByRole('button', { name: /start session|new session/i }).first().click()
    await expect(page.getByText(/^Connected$/)).toBeVisible({ timeout: 10000 })

    // Install tab
    await expect(page.getByText(/npx add-mcp /)).toBeVisible()
    await expect(page.getByRole('button', { name: /copy command/i })).toBeVisible()

    // Config tab
    await page.getByRole('button', { name: /mcp config/i }).click()
    await expect(page.getByRole('button', { name: /copy config/i })).toBeVisible()

    // Prompt tab
    await page.getByRole('button', { name: /^copy prompt$/i }).first().click()
    await expect(page.getByTitle('Copy')).toBeVisible() 
  })
})
 