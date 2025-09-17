import { test, expect } from '@playwright/test';

const routes = ['/', '/about.html', '/references.html', '/complaint-portal.html'];

for (const route of routes) {
  test(`visual: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot(`${route.replace(/\W+/g, '_')}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100
    });
  });
}
