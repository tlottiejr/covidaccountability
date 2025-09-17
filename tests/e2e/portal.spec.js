// tests/e2e/portal.spec.js
const { test, expect } = require('@playwright/test');

// Helper: pick first real state option
async function selectFirstState(page) {
  const sel = page.locator('#stateSelect');
  await expect(sel).toBeVisible();
  const count = await sel.locator('option').count();
  for (let i = 0; i < count; i++) {
    const val = await sel.locator('option').nth(i).getAttribute('value');
    if (val && val.trim()) {
      await sel.selectOption(val);
      return val;
    }
  }
  throw new Error('No state options populated.');
}

test.describe('Complaint Portal — live', () => {
  test('New-tab only open, beacon fired, verify non-blocking, cache-bust present', async ({ page, context, baseURL }) => {
    // Watch network for cache-bust on state-links and for /api/event beacon
    let sawCacheBust = false;
    let beaconPromise;
    page.on('request', req => {
      const url = req.url();
      if (url.includes('/assets/state-links.json') && url.includes('?v=')) {
        sawCacheBust = true;
      }
      if (url.includes('/api/event') && req.method() === 'POST') {
        // capture first beacon post
        beaconPromise ||= Promise.resolve(req.postDataJSON?.());
      }
    });

    // Go to portal
    await page.goto('/complaint-portal.html', { waitUntil: 'domcontentloaded' });

    // States should load; pick the first valid state (data-driven, no hardcoded state code)
    const chosen = await selectFirstState(page);

    // Boards should render; pick first enabled radio
    const firstRadio = page.locator('#boards input[type=radio]:not([disabled])').first();
    await firstRadio.waitFor({ state: 'visible' });
    await firstRadio.check();

    // Open should become enabled
    const openBtn = page.locator('#openBtn');
    await expect(openBtn).toBeEnabled();

    // Clicking Open must open a NEW TAB (popup) and NOT navigate the current page
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      openBtn.click()
    ]);

    // Popup should navigate to an http(s) URL (we don't assume which)
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
    const popupUrl = popup.url();
    expect(popupUrl).toMatch(/^https?:\/\//);

    // Current page must still be the portal
    expect(page.url()).toContain('/complaint-portal');

    // Verify that beacon fired (non-blocking)
    const beacon = await beaconPromise;
    expect(beacon).toBeTruthy();
    expect(beacon.type).toBe('open_board');
    expect(typeof beacon.boardHost).toBe('string');
    expect((beacon.stateCode || '').length).toBe(2);

    // Cache-bust param must have been requested at least once
    expect(sawCacheBust).toBeTruthy();
  });
});
