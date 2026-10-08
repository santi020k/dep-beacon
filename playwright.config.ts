import { defineConfig, devices } from '@playwright/test'

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
    baseURL: 'http://127.0.0.1:4398',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'pnpm --filter @santi020k/dep-beacon-docs preview --host 127.0.0.1 --port 4398',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:4398'
  },
  workers: 2
})
