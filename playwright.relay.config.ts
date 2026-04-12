/**
 * Playwright config for relay API integration tests.
 *
 * Starts `wrangler dev` as a local Cloudflare Worker server on port 8787,
 * then runs tests that hit the HTTP relay endpoints directly.
 *
 * Usage:
 *   npm run test:relay
 *   npx playwright test --config playwright.relay.config.ts
 *
 * Prerequisites:
 *   - wrangler CLI installed (in devDependencies)
 *   - wrangler.jsonc configured with RELAY_SESSIONS DO binding
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e/mcp',
  testMatch: /relay-api\.spec\.ts/,
  fullyParallel: false, // relay tests share session state
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx wrangler dev --port 8787 --local',
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      RELAY_URL: 'http://localhost:8787',
    },
  },
})
