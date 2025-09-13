// scripts/check-links.mjs
// Link Health 2.1 — WAF-aware checker with 'blocked' status.
// Node >= 18. No deps.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Config (tunable with env) ----
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 8);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);
const USER_AGENT = process.env.USER_AGENT || 'CAN-LinkHealth/1.1 (+https://covidaccountabilitynow.com)';
const FAIL_ON = (process.env.FAIL_ON || 'none').toLowerCase(); // none|some|any
const READ_BODY_SNIPPET = 2048; // bytes to read for WAF detection (only on GET non-2xx)

// ---- Paths ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.resolve(ROOT, 'public/assets/state-links.json');
const REPORT_DIR = path.resolve(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'link-health.json');
const REPORT_CSV = path.join(REPORT_DIR, 'link-health.csv');

const nowIso = () => new Date().toISOString();
const csvEscape = (v='') => {
  const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
};

async function readStateLinks() {
  const raw = await fs.readFile(JSON_PATH, 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(data)) throw new Error('state-links.json: top-level must be an array');
  return data;
}

function toTasks(states) {
  const tasks = [];
  for (const s of states) {
    for (const l of (s.links || [])) {
      if (!l?.url) continue;
      tasks.push({ stateCode: s.code, stateName: s.name, board: l.board || 'Official Complaint Link', url: l.url });
    }
  }
  return tasks;
}

function timeoutFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers = new Headers(opts.headers || {});
  headers.set('user-agent', USER_AGENT);
  headers.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  return fetch(url, { ...opts, signal: ctrl.signal, headers }).finally(() => clearTimeout(t));
}

function isWafStatus(code) {
  return [401, 403, 405, 406, 409, 429].includes(code); // common bot blocks
}
function looksLikeWaf(text='') {
  const s = text.toLowerCase();
  return s.includes('cloudflare') || s.includes('captcha') || s.includes('access denied') || s.includes('are you a human');
}

async function checkOne(url) {
  // Validate URL
  let href = '';
  try { href = new URL(url).href; }
  catch { return { status:'bad_url', httpCode:0, finalUrl:'', note:'Invalid URL' }; }

  // HEAD (fast)
  try {
    const r = await timeoutFetch(href, { method: 'HEAD', redirect: 'follow' });
    if (r.ok) return { status: r.redirected ? 'redirect' : 'ok', httpCode: r.status, finalUrl: r.url || href };
    if (isWafStatus(r.status)) {
      // Some sites block HEAD only; fall through to GET to confirm
    } else if (r.status >= 500) {
      return { status:'server_error', httpCode:r.status, finalUrl:r.url || href };
    } else if (r.status >= 400) {
      // 404 etc → still try GET once in case of HEAD-only bad behavior
    }
  } catch { /* fall through to GET */ }

  // GET (follow redirects) — inspect small body when non-2xx to catch WAF
  try {
    const r = await timeoutFetch(href, { method: 'GET', redirect: 'follow' });
    const finalUrl = r.url || href;
    const code = r.status;
    if (r.ok) return { status: r.redirected ? 'redirect' : 'ok', httpCode: code, finalUrl };
    let sniff = '';
    try {
      const body = await r.text();
      sniff = body.slice(0, READ_BODY_SNIPPET);
    } catch {}
    if (isWafStatus(code) || looksLikeWaf(sniff)) return { status: 'blocked', httpCode: code, finalUrl };
    if (code >= 500) return { status:'server_error', httpCode:code, finalUrl };
    if (code >= 400) return { status:'client_error', httpCode:code, finalUrl };
    return { status:'unknown', httpCode:code, finalUrl };
  } catch (e) {
    if (e?.name === 'AbortError') return { status:'timeout', httpCode:0, finalUrl:href };
    return { status:'network_error', httpCode:0, finalUrl:href, note:e?.message || String(e) };
  }
}

async function runQueue(tasks) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const my = tasks[idx++];
      const checkedAt = nowIso();
      try {
        const r = await checkOne(my.url);
        results.push({ ...my, ...r, checkedAt });
        const okish = ['ok','redirect','blocked'].includes(r.status);
        process.stdout.write(`[${okish ? 'OK' : 'FAIL'}] ${my.stateCode} ${my.board} -> ${my.url} (${r.status}${r.httpCode ? ' '+r.httpCode : ''})\n`);
        // small jitter to be polite
        await new Promise(res => setTimeout(res, 50 + Math.random()*100));
      } catch (e) {
        results.push({ ...my, status:'script_error', httpCode:0, finalUrl:my.url, note:e?.message || String(e), checkedAt });
        process.stdout.write(`[ERR] ${my.stateCode} ${my.board} -> ${my.url} (script_error)\n`);
      }
    }
  }
  const n = Math.min(MAX_CONCURRENCY, Math.max(1, tasks.length));
  await Promise.all(Array.from({length:n}, worker));
  return results;
}

function summarize(results) {
  const counts = results.reduce((acc, r) => {
    acc.total++;
    acc.byStatus[r.status] = (acc.byStatus[r.status] || 0) + 1;
    const k = r.stateCode;
    if (!acc.byState[k]) acc.byState[k] = { code:r.stateCode, name:r.stateName, total:0, failures:0, blocked:0 };
    acc.byState[k].total++;
    if (r.status === 'blocked') acc.byState[k].blocked++;
    if (!['ok','redirect','blocked'].includes(r.status)) acc.byState[k].failures++;
    return acc;
  }, { total:0, byStatus:{}, byState:{} });
  const byState = Object.values(counts.byState).sort((a,b) => a.code.localeCompare(b.code));
  return { total:counts.total, byStatus:counts.byStatus, byState };
}

async function writeReports(results) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const summary = summarize(results);
  const payload = { generatedAt: nowIso(), config:{ MAX_CONCURRENCY, TIMEOUT_MS }, summary, results };
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = ['stateCode,stateName,board,url,status,httpCode,finalUrl,checkedAt'];
  for (const r of results) {
    lines.push([
      csvEscape(r.stateCode), csvEscape(r.stateName), csvEscape(r.board), csvEscape(r.url),
      csvEscape(r.status), csvEscape(r.httpCode), csvEscape(r.finalUrl), csvEscape(r.checkedAt)
    ].join(','));
  }
  await fs.writeFile(REPORT_CSV, lines.join('\n')+'\n', 'utf8');

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
  console.log(`Link Health 2.1 — ${nowIso()}`);
  const states = await readStateLinks();
  const tasks = toTasks(states);
  console.log(`Checking ${tasks.length} links (concurrency=${MAX_CONCURRENCY}, timeout=${TIMEOUT_MS}ms)`);
  const results = await runQueue(tasks);
  await writeReports(results);
  process.exit(decideExit(results));
}
main().catch(e => { console.error(e); process.exit(1); });
