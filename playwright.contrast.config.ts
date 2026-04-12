/**
 * Playwright config for the rendered contrast audit.
 * Runs WITHOUT a web server — the test renders Mermaid diagrams directly
 * via page.setContent(), no app server needed.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e/app',
  testMatch: 'contrast-rendered.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  workers: 1,
  reporter: [['list']],
  use: {
    // No baseURL needed — tests use page.setContent() directly
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — tests are self-contained
})
