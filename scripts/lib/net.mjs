// scripts/lib/net.mjs
import { setTimeout as sleep } from 'node:timers/promises';
import { URL } from 'node:url';

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

// Add/remove as we observe consistent 403s from public pages.
const PROTECTED_403_HOSTS = new Set([
  'www.fda.gov',
  'www.acpjournals.org',
  'www.ama-assn.org',
  'www.michigan.gov',
  'www.health.ny.gov',
  'www.oregon.gov',
  'atg.sd.gov',
  'crb.ri.gov',
  'www.scc.virginia.gov',
  'ethics.wv.gov',
]);

function normalizeUrl(u) {
  const url = new URL(u);
  // strip common trackers
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(
    (p) => url.searchParams.delete(p),
  );
  return url.toString();
}

async function fetchOnce(url, { method = 'HEAD' } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: BROWSER_HEADERS,
  });
  const finalUrl = normalizeUrl(res.url || url);
  return { res, finalUrl };
}

/**
 * Robust checker:
 * 1) HEAD
 * 2) If 403/404/405 ⇒ GET
 * 3) Follow redirects; retry on transient
 * Returns: { status, ok, final_url, note }
 */
export async function checkUrl(rawUrl, { retries = 2, delayMs = 350 } = {}) {
  const url = normalizeUrl(rawUrl);
  let attempt = 0;
  let lastErr;

  while (attempt <= retries) {
    try {
      // HEAD first
      let { res, finalUrl } = await fetchOnce(url, { method: 'HEAD' });
      let status = res.status;

      // fall back to GET for “HEAD not allowed / protected”
      if (status === 403 || status === 404 || status === 405) {
        const { res: getRes, finalUrl: final2 } = await fetchOnce(url, {
          method: 'GET',
        });
        status = getRes.status;
        finalUrl = final2;

        const host = new URL(finalUrl).host;
        if (status === 403 && PROTECTED_403_HOSTS.has(host)) {
          return {
            status,
            ok: 1,
            final_url: finalUrl,
            note: '403_protected_but_public',
          };
        }
      }

      if (status >= 200 && status < 300) {
        return { status, ok: 1, final_url: finalUrl, note: '' };
      }

      if (status >= 300 && status < 400) {
        return { status, ok: 1, final_url: finalUrl, note: 'redirect' };
      }

      if (status === 403) {
        const host = new URL(finalUrl).host;
        if (PROTECTED_403_HOSTS.has(host)) {
          return {
            status,
            ok: 1,
            final_url: finalUrl,
            note: '403_protected_but_public',
          };
        }
      }

      // non-OK
      return { status, ok: 0, final_url: finalUrl, note: '' };
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await sleep(delayMs * (attempt + 1));
      attempt++;
    }
  }

  return { status: 0, ok: 0, final_url: normalizeUrl(rawUrl), note: 'fetch_failed' };
}
