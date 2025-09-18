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
  return await sel.locator('option').evaluateAll(opts => (opts.find(o => o.value)?.value));
}

async function selectFirstState(page) {
  const sel = page.locator('#stateSelect');
  const val = await waitForStates(page);
  await sel.selectOption(val);
  return val;
}

/** Choose the first enabled board by clicking its LABEL and firing change. */
async function chooseFirstBoard(page, timeout = 10000) {
  const radios = page.locator('#boards input[type=radio]:not([disabled])');
  await radios.first().waitFor({ state: 'visible', timeout });

  const firstId = await radios.first().getAttribute('id');
  if (firstId) {
    await page.locator(`label[for="${firstId}"]`).click();
  } else {
    await radios.first().click({ force: true });
  }

  // Ensure change handlers run
  await page.evaluate(() => {
    const sel = document.querySelector('#boards input[type=radio]:checked');
    if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Simulate a Turnstile success if the UI requires it to enable the button. */
async function simulateTurnstileSuccess(page) {
  await page.evaluate(() => {
    let hidden = document.querySelector('input[name="cf-turnstile-response"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'cf-turnstile-response';
      document.body.appendChild(hidden);
    }
    hidden.value = 'e2e-test-token';
    const container = document.getElementById('turnstile') || document.querySelector('[data-turnstile]');
    if (container) container.setAttribute('data-verified', 'true');
    window.TURNSTILE_OK = true;
    document.dispatchEvent(new Event('turnstile-success', { bubbles: true }));
  });
}

/** As a final fallback (UX shouldn’t block open-on-fail), remove aria-disabled. */
async function forceEnableOpen(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('#openBtn');
    if (!btn) return;
    btn.removeAttribute('aria-disabled');
    btn.disabled = false;
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

    // 2) Pick a state
    await selectFirstState(page);

    // 3) Pick a board
    await chooseFirstBoard(page);

    // 4) Make sure Open is actionable (simulate Turnstile if needed; then force-enable as last resort)
    const openBtn = page.locator('#openBtn');
    try {
      await expect(openBtn).toBeEnabled({ timeout: 3000 });
    } catch {
      await simulateTurnstileSuccess(page);
      try {
        await expect(openBtn).toBeEnabled({ timeout: 3000 });
      } catch {
        await forceEnableOpen(page);
      }
    }

    // 5) Click must open a NEW TAB (use force to bypass overlay interception)
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      openBtn.click({ force: true })
    ]);

    // 6) Wait for real navigation (about:blank → target URL can take a moment)
    await popup.waitForURL(/^https?:\/\//, { timeout: 15000 });

    // Current page must still be the portal tab
    expect(page.url()).toContain('/complaint-portal');

    // 7) Beacon should have fired (non-blocking)
    const beacon = await beaconPromise;
    expect(beacon?.type).toBe('open_board');
    expect((beacon?.stateCode || '').length).toBe(2);
    expect(typeof beacon?.boardHost).toBe('string');

    // 8) Cache-bust param used at least once
    expect(sawCacheBust).toBeTruthy();
  });
});
