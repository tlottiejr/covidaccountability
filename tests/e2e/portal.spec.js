import { test, expect } from '@playwright/test';

/** Wait until the state <select> has at least one non-empty option value. */
async function waitForStates(page, timeout = 15000) {
  const sel = page.locator('#stateSelect');
  await expect(sel).toBeVisible({ timeout });
  await expect.poll(
    async () =>
      await sel.locator('option').evaluateAll(opts => opts.map(o => o.value).filter(Boolean).length),
    { timeout, message: 'state options to populate' }
  ).toBeGreaterThan(0);
  // return first non-empty value
  return await sel.locator('option').evaluateAll(opts => (opts.find(o => o.value)?.value));
}

/** Select the first state after options are present. */
async function selectFirstState(page) {
  const sel = page.locator('#stateSelect');
  const val = await waitForStates(page);
  await sel.selectOption(val);
  return val;
}

/** Choose the first enabled board by clicking its LABEL and firing change. */
async function chooseFirstBoard(page, timeout = 10000) {
  // radios live under #boards; enable either input[type=radio] or [role=radio]
  const radios = page.locator('#boards input[type=radio]:not([disabled])');
  await radios.first().waitFor({ state: 'visible', timeout });

  // Click the label tied to the first radio (more reliable than .check() on CI)
  const firstId = await radios.first().getAttribute('id');
  if (firstId) {
    await page.locator(`label[for="${firstId}"]`).click();
  } else {
    // fall back to clicking the radio directly
    await radios.first().click({ force: true });
  }

  // Make sure any change listeners run
  await page.evaluate(() => {
    const sel = document.querySelector('#boards input[type=radio]:checked');
    if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test.describe('Complaint Portal — live', () => {
  test('Portal: new-tab only, beacon fired, verify non-blocking, cache-bust', async ({ page, context }) => {
    let sawCacheBust = false;
    let beaconPromise;

    page.on('request', req => {
      const url = req.url();
      if (url.includes('/assets/state-links.json') && url.includes('?v=')) {
        sawCacheBust = true;
      }
      if (url.includes('/api/event') && req.method() === 'POST') {
        beaconPromise ||= Promise.resolve(req.postDataJSON?.());
      }
    });

    // 1) Go to the portal
    await page.goto('/complaint-portal.html', { waitUntil: 'domcontentloaded' });

    // 2) Pick a state (robust wait for options)
    await selectFirstState(page);

    // 3) Pick the first board (click label + dispatch change)
    await chooseFirstBoard(page);

    // 4) Wait for Open button to actually enable
    const openBtn = page.locator('#openBtn');
    await expect(openBtn).toBeEnabled({ timeout: 10000 });

    // 5) Click: must open a NEW TAB only
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      openBtn.click()
    ]);
    await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
    expect(popup.url()).toMatch(/^https?:\/\//);
    expect(page.url()).toContain('/complaint-portal');

    // 6) Beacon should have fired (non-blocking)
    const beacon = await beaconPromise;
    expect(beacon?.type).toBe('open_board');
    expect((beacon?.stateCode || '').length).toBe(2);
    expect(typeof beacon?.boardHost).toBe('string');

    // 7) Cache-bust param used at least once
    expect(sawCacheBust).toBeTruthy();
  });
});
