import { test, expect } from '@playwright/test';

async function selectFirstState(page) {
  const sel = page.locator('#stateSelect');
  await expect(sel).toBeVisible();
  const count = await sel.locator('option').count();
  for (let i = 0; i < count; i++) {
    const val = await sel.locator('option').nth(i).getAttribute('value');
    if (val && val.trim()) { await sel.selectOption(val); return val; }
  }
  throw new Error('No state options populated.');
}

test('Portal: new-tab only, beacon fired, verify non-blocking, cache-bust', async ({ page, context }) => {
  let sawCacheBust = false;
  let beaconPromise;
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/assets/state-links.json') && url.includes('?v=')) sawCacheBust = true;
    if (url.includes('/api/event') && req.method() === 'POST') beaconPromise ||= Promise.resolve(req.postDataJSON?.());
  });

  await page.goto('/complaint-portal.html', { waitUntil: 'domcontentloaded' });
  await selectFirstState(page);

  const firstRadio = page.locator('#boards input[type=radio]:not([disabled])').first();
  await firstRadio.waitFor({ state: 'visible' });
  await firstRadio.check();

  const openBtn = page.locator('#openBtn');
  await expect(openBtn).toBeEnabled();

  const [popup] = await Promise.all([ context.waitForEvent('page'), openBtn.click() ]);
  await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });

  expect(popup.url()).toMatch(/^https?:\/\//);
  expect(page.url()).toContain('/complaint-portal');

  const beacon = await beaconPromise;
  expect(beacon?.type).toBe('open_board');
  expect((beacon?.stateCode || '').length).toBe(2);
  expect(typeof beacon?.boardHost).toBe('string');
  expect(sawCacheBust).toBeTruthy();
});
