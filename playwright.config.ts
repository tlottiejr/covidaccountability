import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.SITE_BASE_URL || 'http://localhost:8788';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add Firefox/WebKit later if desired
  ],
  // Keep snapshots beside tests (works with your /tests/visual structure)
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}'
});
