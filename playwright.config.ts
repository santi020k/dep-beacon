import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.DEP_BEACON_DOCS_TEST_PORT ?? 4398)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DEP_BEACON_DOCS_TEST_PORT must be an integer between 1 and 65535.')
}

const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  reporter: 'list',
  retries: 0,
  testDir: './tests/docs',
  timeout: 60_000,
  use: {
    baseURL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `pnpm --filter @santi020k/dep-beacon-docs preview --host 127.0.0.1 --port ${port} --ignore-lock`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL
  },
  workers: 2
})
