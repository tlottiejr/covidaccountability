// scripts/check-reference-links.mjs
// Audits links used by the References page (data/references.sources.json).
// Node >= 18. No deps. WAF-aware ("blocked" status) like S2.
//
// Usage: node scripts/check-reference-links.mjs
// Env (optional): MAX_CONCURRENCY=8 TIMEOUT_MS=12000 FAIL_ON=none|some|any USER_AGENT="..."

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SOURCES_JSON = path.join(ROOT, 'data/references.sources.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'reference-link-health.json');
const REPORT_CSV  = path.join(REPORT_DIR, 'reference-link-health.csv');

const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 8);
const TIMEOUT_MS      = Number(process.env.TIMEOUT_MS || 12000);
const USER_AGENT      = process.env.USER_AGENT || 'CAN-RefsLinkHealth/1.1 (+https://covidaccountabilitynow.com)';
const FAIL_ON         = (process.env.FAIL_ON || 'none').toLowerCase();

const nowIso = () => new Date().toISOString();
const csvEscape = (v='') => {
  const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
};
const stripBom = (s) => s.replace(/^\uFEFF/, '');

async function loadSources() {
  const raw = await fs.readFile(SOURCES_JSON, 'utf8').catch(() => '{}');
  const data = JSON.parse(stripBom(raw || '{}'));
  const items = [];
  for (const cat of (data.categories || [])) {
    for (const it of (cat.items || [])) {
      if (it?.url && typeof it.url === 'string' && it.url.trim()) {
        items.push({
          category: cat.name || 'References',
          title: it.title || it.url,
          url: it.url.trim()
        });
      }
    }
  }
  // de-duplicate by URL
  const seen = new Set();
  return items.filter(i => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

function timeoutFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers = new Headers(opts.headers || {});
  headers.set('user-agent', USER_AGENT);
  headers.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  return fetch(url, { ...opts, signal: ctrl.signal, headers }).finally(() => clearTimeout(t));
}

function isWafStatus(code) { return [401,403,405,406,409,429].includes(code); }
function looksLikeWaf(text='') {
  const s = text.toLowerCase();
  return s.includes('cloudflare') || s.includes('captcha') || s.includes('access denied') || s.includes('are you a human');
}

async function checkOne(url) {
  let href = '';
  try { href = new URL(url).href; }
  catch { return { status:'bad_url', httpCode:0, finalUrl:'', note:'Invalid URL' }; }

  try {
    const r = await timeoutFetch(href, { method: 'HEAD', redirect: 'follow' });
    if (r.ok) return { status: r.redirected ? 'redirect' : 'ok', httpCode: r.status, finalUrl: r.url || href };
    // fall through to GET for WAF/HEAD quirks
  } catch {}

  try {
    const r = await timeoutFetch(href, { method: 'GET', redirect: 'follow' });
    const finalUrl = r.url || href;
    const code = r.status;
    if (r.ok) return { status: r.redirected ? 'redirect' : 'ok', httpCode: code, finalUrl };
    let bodySnippet = '';
    try { bodySnippet = (await r.text()).slice(0, 2048); } catch {}
    if (isWafStatus(code) || looksLikeWaf(bodySnippet)) return { status:'blocked', httpCode:code, finalUrl };
    if (code >= 500) return { status:'server_error', httpCode:code, finalUrl };
    if (code >= 400) return { status:'client_error', httpCode:code, finalUrl };
    return { status:'unknown', httpCode:code, finalUrl };
  } catch (e) {
    if (e?.name === 'AbortError') return { status:'timeout', httpCode:0, finalUrl:href };
    return { status:'network_error', httpCode:0, finalUrl:href, note:e?.message || String(e) };
  }
}

async function runQueue(items) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const my = items[idx++];
      const checkedAt = nowIso();
      try {
        const r = await checkOne(my.url);
        results.push({ ...my, ...r, checkedAt });
        const okish = ['ok','redirect','blocked'].includes(r.status);
        process.stdout.write(`[${okish ? 'OK' : 'FAIL'}] ${my.title} -> ${my.url} (${r.status}${r.httpCode ? ' '+r.httpCode : ''})\n`);
        await new Promise(res => setTimeout(res, 50 + Math.random()*100));
      } catch (e) {
        results.push({ ...my, status:'script_error', httpCode:0, finalUrl:my.url, note:e?.message || String(e), checkedAt });
        process.stdout.write(`[ERR] ${my.title} -> ${my.url} (script_error)\n`);
      }
    }
  }
  const n = Math.min(MAX_CONCURRENCY, Math.max(1, items.length));
  await Promise.all(Array.from({length:n}, worker));
  return results;
}

function summarize(results) {
  const byStatus = {};
  let total = 0, failures = 0;
  for (const r of results) {
    total++;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (!['ok','redirect','blocked'].includes(r.status)) failures++;
  }
  return { total, byStatus, failures };
}

async function writeReports(results) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const summary = summarize(results);
  const payload = { generatedAt: nowIso(), config: { MAX_CONCURRENCY, TIMEOUT_MS }, summary, results };
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = ['category,title,url,status,httpCode,finalUrl,checkedAt'];
  for (const r of results) {
    lines.push([
      csvEscape(r.category), csvEscape(r.title), csvEscape(r.url),
      csvEscape(r.status), csvEscape(r.httpCode), csvEscape(r.finalUrl), csvEscape(r.checkedAt)
    ].join(','));
  }
  await fs.writeFile(REPORT_CSV, lines.join('\n') + '\n', 'utf8');

  console.log('\nSummary:', summary);
  console.log(`\nWrote:\n - ${path.relative(ROOT, REPORT_JSON)}\n - ${path.relative(ROOT, REPORT_CSV)}\n`);
}

function decideExit(results) {
  const failures = results.filter(r => !['ok','redirect','blocked'].includes(r.status)).length;
  if (FAIL_ON === 'any' && failures > 0) return 1;
  if (FAIL_ON === 'some' && failures > results.length * 0.2) return 1;
  return 0;
}

async function main() {
  console.log(`Refs Link Health — ${nowIso()}`);
  const items = await loadSources();
  console.log(`Checking ${items.length} reference link(s) (concurrency=${MAX_CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`);
  const results = await runQueue(items);
  await writeReports(results);
  process.exit(decideExit(results));
}
main().catch(err => { console.error(err); process.exit(1); });
