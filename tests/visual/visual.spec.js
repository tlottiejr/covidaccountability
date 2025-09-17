// tests/visual/visual.spec.js
const { test, expect } = require('@playwright/test');

const routes = ['/', '/about.html', '/references.html', '/complaint-portal.html'];

for (const route of routes) {
  test(`visual: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    // Give fonts/layout a moment to settle
    await page.waitForTimeout(300);
    // Snap full page at current project's viewport
    await expect(page).toHaveScreenshot(`${route.replace(/\W+/g, '_')}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100, // small tolerance to avoid flaky 1px diffs
    });
  });
}
