// Playwright API contract test for /api/states
// Run with: npx playwright test tests/contracts/states.contract.spec.js

import { test, expect, request } from '@playwright/test';

test.describe('GET /api/states contract', () => {
  test('returns canonical shape and x-source header', async ({}, testInfo) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:8788';
    const ctx = await request.newContext({ baseURL });

    const res = await ctx.get('/api/states', { headers: { accept: 'application/json' }});
    expect(res.ok()).toBeTruthy();

    const source = res.headers()['x-source'];
    expect(['static','d1-fallback']).toContain(source);

    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);

    for (const s of body) {
      expect(typeof s.code).toBe('string');
      expect(s.code).toMatch(/^[A-Z]{2}$/);
      expect(typeof s.name).toBe('string');
      expect(Array.isArray(s.links)).toBeTruthy();
      // one primary per state
      const primaries = s.links.filter(l => l.primary === true);
      expect(primaries.length).toBe(1);

      for (const l of s.links) {
        expect(typeof l.board).toBe('string');
        const u = new URL(l.url);
        expect(u.protocol).toBe('https:');
        expect(typeof l.primary).toBe('boolean');
      }
    }
  });
});
