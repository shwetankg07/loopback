import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// Uses the system Chromium when present instead of downloading Playwright's build.
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000,
  expect: { timeout: 120_000 },
  use: { baseURL: 'http://127.0.0.1:5199/', launchOptions: { executablePath } },
  webServer: { command: 'npm run vendor && npx vite --port 5199 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:5199/', reuseExistingServer: true, timeout: 120_000 },
})
