/* References Link Health — artifact-only, non-failing
 * Reads references JSON, checks each URL (HEAD→GET fallback), classifies results,
 * and writes JSON + CSV under /reports without failing the workflow.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);
const UA = process.env.USER_AGENT || 'Mozilla/5.0 (compatible; CAN-LinkHealth/1.0)';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const candidates = [
  path.resolve(repoRoot, 'public/assets/references.json'),
  path.resolve(repoRoot, 'assets/references.json'),
  path.resolve(repoRoot, 'public/references.json'),
];

const outDir = path.resolve(repoRoot, 'reports');
await fs.mkdir(outDir, { recursive: true });

const sourceFile = await (async () => {
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error(`Could not find references.json. Tried:\n${candidates.join('\n')}`);
})();

const raw = await fs.readFile(sourceFile, 'utf-8');
let items = [];
try {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) items = parsed;
  else throw new Error('references.json is not an array');
} catch (e) {
  throw new Error(`Invalid JSON in ${sourceFile}: ${e.message}`);
}

const dateStamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`;
};

const classify = (status, serverHint, snippet='') => {
  if (status >= 200 && status < 300) return 'OK';
  if (status >= 300 && status < 400) return 'Redirect';
  if (status === 401) return 'AuthRequired';
  if (status === 404) return 'NotFound';
  if (status === 403 || status === 429 || status === 503) {
    const s = `${serverHint} ${snippet}`.toLowerCase();
    if (s.includes('cloudflare') || s.includes('akamai') || s.includes('incapsula') ||
        s.includes('sucuri') || s.includes('captcha') || s.includes('access denied')) {
      return 'Blocked';
    }
    return 'Blocked';
  }
  if (status >= 500) return 'ServerError';
  if (status >= 400) return 'ClientError';
  return 'Unknown';
};

const fetchWithTimeout = async (url, opts={}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'manual',
      headers: { 'user-agent': UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
};

const checkOne = async (idx, url) => {
  let httpStatus = 0, status = 'Network', finalUrl = url, server = '', note = '';
  try {
    // HEAD first (many sites are fine; some reject HEAD)
    let res = await fetchWithTimeout(url, { method: 'HEAD' });
    httpStatus = res.status; server = res.headers.get('server') || '';
    if (httpStatus === 405 || httpStatus === 501 || httpStatus === 400) {
      // Fallback to GET if HEAD not allowed
      res = await fetchWithTimeout(url, { method: 'GET' });
      httpStatus = res.status; server = res.headers.get('server') || server;
    }

    if (httpStatus >= 300 && httpStatus < 400) {
      // Follow one redirect to record final
      const loc = res.headers.get('location');
      if (loc) {
        const nextUrl = new URL(loc, url).href;
        finalUrl = nextUrl;
        const res2 = await fetchWithTimeout(nextUrl, { method: 'GET' });
        const bodySnippet = (await res2.text()).slice(0, 512);
        status = classify(res2.status, res2.headers.get('server') || server, bodySnippet);
        httpStatus = res2.status;
        server = res2.headers.get('server') || server;
        if (status === 'OK') note = 'Redirected once';
        return { httpStatus, status, finalUrl, server, note };
      }
    }

    // Read a small snippet for WAF detection on 4xx/5xx
    let snippet = '';
    if (httpStatus >= 400) {
      try { const t = await res.text(); snippet = t.slice(0, 512); } catch {}
    }
    status = classify(httpStatus, server, snippet);
  } catch (e) {
    if (e.name === 'AbortError') { status = 'Timeout'; note = `>${TIMEOUT_MS}ms`; }
    else { status = 'Network'; note = e.message; }
  }
  return { httpStatus, status, finalUrl, server, note };
};

// Simple concurrency limiter
const pLimit = (n) => {
  let active = 0; const queue = [];
  const next = () => { active--; if (queue.length) queue.shift()(); };
  return (fn) => (...args) => new Promise((resolve, reject) => {
    const run = () => {
      active++;
      Promise.resolve(fn(...args)).then(resolve, reject).finally(next);
    };
    active < n ? run() : queue.push(run);
  });
};

const limit = pLimit(MAX_CONCURRENCY);
const results = [];
await Promise.all(items.map((item, i) => limit(async () => {
  const url = (item && item.url) ? String(item.url) : '';
  const title = (item && item.title) ? String(item.title) : '';
  if (!url) {
    results[i] = { index: i, title, url, httpStatus: 0, status: 'InvalidURL', finalUrl: '', server: '', note: 'missing url' };
    return;
  }
  const r = await checkOne(i, url);
  results[i] = { index: i, title, url, ...r };
})));

const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
const summary = {
  generatedAt: new Date().toISOString(),
  source: path.relative(repoRoot, sourceFile),
  total: results.length,
  byStatus: counts
};

const stem = `references-link-health-${dateStamp()}`;
const outJson = path.join(outDir, `${stem}.json`);
const outCsv  = path.join(outDir, `${stem}.csv`);

await fs.writeFile(outJson, JSON.stringify({ summary, results }, null, 2), 'utf-8');

// CSV
const q = (s='') => `"${String(s).replace(/"/g, '""')}"`;
const headers = ['index','title','url','httpStatus','status','finalUrl','server','note'];
const csv = [
  headers.join(','),
  ...results.map(r => headers.map(h => q(r[h] ?? '')).join(','))
].join('\n');
await fs.writeFile(outCsv, csv, 'utf-8');

// Ensure README exists
const readme = path.join(outDir, 'README.md');
await fs.writeFile(readme, `# Link Health Reports

Artifacts generated by the **References Link Health** workflow.

## Files
- \`${stem}.json\` — full results + summary
- \`${stem}.csv\` — spreadsheet-friendly export

## Status taxonomy
- **OK** — 2xx success
- **Redirect** — resolved after a redirect (note: one hop followed)
- **Blocked** — WAF/CAPTCHA/Access Denied (e.g., 403/503)
- **AuthRequired** — 401
- **NotFound** — 404
- **ClientError** — other 4xx
- **ServerError** — 5xx
- **Timeout** — no response within ${TIMEOUT_MS}ms
- **Network** — DNS/socket errors
- **InvalidURL** — missing or malformed URL
`, 'utf-8');

// Never fail the workflow (artifact-only)
console.log(`Wrote: ${path.relative(repoRoot, outJson)} & ${path.relative(repoRoot, outCsv)}`);
process.exit(0);
