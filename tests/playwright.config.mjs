// tests/playwright.config.mjs  (ESM)
import { devices } from '@playwright/test';

const baseURL = process.env.SITE_BASE_URL || 'https://covidaccountability.pages.dev';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium',  use: { ...devices['Pixel 5'] } }
  ],
  reporter: [['list']]
};

export default config;
