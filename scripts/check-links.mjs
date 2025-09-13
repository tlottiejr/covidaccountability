// scripts/check-links.mjs
// Link Health 2.0 — checks all links in public/assets/state-links.json and writes reports.
// Node >= 18 (uses global fetch). No deps.
// Usage: node scripts/check-links.mjs
// Env (optional): MAX_CONCURRENCY=12 TIMEOUT_MS=15000 USER_AGENT="..." FAIL_ON="none|some|any"

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Config ----
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 12);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);
const USER_AGENT = process.env.USER_AGENT || 'CAN-LinkHealth/1.0 (+https://covidaccountabilitynow.com)';
const FAIL_ON = (process.env.FAIL_ON || 'none').toLowerCase(); // none|some|any

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.resolve(ROOT, 'public/assets/state-links.json');
const REPORT_DIR = path.resolve(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'link-health.json');
const REPORT_CSV = path.join(REPORT_DIR, 'link-health.csv');

function nowIso() { return new Date().toISOString(); }

function csvEscape(v = '') {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function readStateLinks() {
  const raw = await fs.readFile(JSON_PATH, 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(data)) throw new Error('state-links.json: top-level must be an array');
  return data;
}

function toTasks(states) {
  const tasks = [];
  for (const s of states) {
    if (!s?.links) continue;
    for (const l of s.links) {
      if (!l?.url) continue;
      tasks.push({
        stateCode: s.code, stateName: s.name,
        board: l.board || 'Official Complaint Link',
        url: l.url
      });
    }
  }
  return tasks;
}

function timeoutFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers = new Headers(opts.headers || {});
  headers.set('user-agent', USER_AGENT);
  return fetch(url, { ...opts, signal: ctrl.signal, headers })
    .finally(() => clearTimeout(t));
}

async function checkOne(url) {
  let finalUrl = '';
  let httpCode = 0;

  // Normalize URL
  let href = '';
  try {
    href = new URL(url).href;
  } catch (e) {
    return { status: 'bad_url', httpCode: 0, finalUrl: '', note: 'Invalid URL' };
  }

  // Try HEAD first (fast), then GET
  try {
    const r = await timeoutFetch(href, { method: 'HEAD', redirect: 'follow' });
    httpCode = r.status;
    finalUrl = r.url || href;
    if (r.ok) {
      return { status: r.redirected ? 'redirect' : 'ok', httpCode, finalUrl };
    }
    // Some servers block HEAD (405/403); fall through to GET
    if (r.status >= 400 && r.status < 600) {
      // fall through
    }
  } catch (e) {
    // fall through to GET
  }

  try {
    const r = await timeoutFetch(href, { method: 'GET', redirect: 'follow' });
    httpCode = r.status;
    finalUrl = r.url || href;
    if (r.ok) return { status: r.redirected ? 'redirect' : 'ok', httpCode, finalUrl };
    if (r.status >= 500) return { status: 'server_error', httpCode, finalUrl };
    if (r.status >= 400) return { status: 'client_error', httpCode, finalUrl };
    return { status: 'unknown', httpCode, finalUrl };
  } catch (e) {
    if (e?.name === 'AbortError') return { status: 'timeout', httpCode: 0, finalUrl: href };
    return { status: 'network_error', httpCode: 0, finalUrl: href, note: e?.message || String(e) };
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
        const tag = (r.status === 'ok' || r.status === 'redirect') ? 'OK' : 'FAIL';
        process.stdout.write(`[${tag}] ${my.stateCode} ${my.board} -> ${my.url} (${r.status}${r.httpCode ? ' ' + r.httpCode : ''})\n`);
      } catch (e) {
        results.push({ ...my, status: 'script_error', httpCode: 0, finalUrl: my.url, note: e?.message || String(e), checkedAt });
        process.stdout.write(`[ERR] ${my.stateCode} ${my.board} -> ${my.url} (script_error)\n`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, Math.max(1, tasks.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const counts = results.reduce((acc, r) => {
    acc.total++;
    acc.byStatus[r.status] = (acc.byStatus[r.status] || 0) + 1;
    const key = r.stateCode;
    if (!acc.byState[key]) acc.byState[key] = { code: r.stateCode, name: r.stateName, total: 0, failures: 0 };
    acc.byState[key].total++;
    if (!['ok', 'redirect'].includes(r.status)) acc.byState[key].failures++;
    return acc;
  }, { total: 0, byStatus: {}, byState: {} });

  const byState = Object.values(counts.byState).sort((a, b) => a.code.localeCompare(b.code));
  return { total: counts.total, byStatus: counts.byStatus, byState };
}

async function writeReports(results) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const summary = summarize(results);
  const payload = { generatedAt: nowIso(), config: { MAX_CONCURRENCY, TIMEOUT_MS }, summary, results };
  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [
    'stateCode,stateName,board,url,status,httpCode,finalUrl,checkedAt'
  ];
  for (const r of results) {
    lines.push([
      csvEscape(r.stateCode),
      csvEscape(r.stateName),
      csvEscape(r.board),
      csvEscape(r.url),
      csvEscape(r.status),
      csvEscape(r.httpCode),
      csvEscape(r.finalUrl),
      csvEscape(r.checkedAt)
    ].join(','));
  }
  await fs.writeFile(REPORT_CSV, lines.join('\n') + '\n', 'utf8');

  console.log('\nSummary:', summary);
  console.log(`\nWrote:\n - ${path.relative(ROOT, REPORT_JSON)}\n - ${path.relative(ROOT, REPORT_CSV)}\n`);
}

function decideExit(results) {
  const failures = results.filter(r => !['ok', 'redirect'].includes(r.status)).length;
  if (FAIL_ON === 'any' && failures > 0) return 1;
  if (FAIL_ON === 'some' && failures > results.length * 0.2) return 1; // >20% failures
  return 0;
}

async function main() {
  console.log(`Link Health 2.0 — ${nowIso()}`);
  const states = await readStateLinks();
  const tasks = toTasks(states);
  console.log(`Checking ${tasks.length} links with concurrency=${MAX_CONCURRENCY}, timeout=${TIMEOUT_MS}ms`);
  const results = await runQueue(tasks);
  await writeReports(results);
  process.exit(decideExit(results));
}

main().catch(err => { console.error(err); process.exit(1); });
