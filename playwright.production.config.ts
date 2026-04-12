import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for running smoke tests directly against https://pretty.fish.
 *
 * Usage:
 *   npx playwright test --config playwright.production.config.ts
 *
 * With deployment delay (waits 6 min for Cloudflare propagation):
 *   PRODUCTION_SMOKE=1 npx playwright test --config playwright.production.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e/mcp',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'https://pretty.fish',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'production-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
