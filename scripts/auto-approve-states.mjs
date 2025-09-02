// scripts/auto-approve-states.mjs
// ESM-safe, Node 20+. Picks best candidate per state with strong heuristics,
// writes approved=1 to db/state-link-candidates.csv,
// then runs scripts/apply-states.mjs to update db/states.csv.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const CANDIDATES_CSV = path.resolve('db/state-link-candidates.csv');
const APPROVAL_THRESHOLD = 65;
const TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 6;

// ---- CSV helpers (same as refs) ----
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
async function readCsv(file) {
  const raw = await fs.readFile(file, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = splitCsvLine(l);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ''));
    return obj;
  });
  return { headers, rows };
}
async function writeCsv(file, headers, rows) {
  const lines = [];
  lines.push(headers.map(h => `"${(h ?? '').replace(/"/g, '""')}"`).join(','));
  for (const r of rows) {
    lines.push(headers.map(h => {
      const v = r[h] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','));
  }
  await fs.writeFile(file, lines.join('\n') + '\n', 'utf8');
}

// ---- utils ----
function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); }
  catch { return ''; }
}
function normalize(s) {
  return (s || '').toLowerCase();
}
function hasComplaintWords(s) {
  const t = normalize(s);
  return /(complaint|file a complaint|report|submit|consumer)/.test(t);
}
function hasAntiWords(s) {
  const t = normalize(s);
  return /(faq|discipline|board members|meetings|minutes|news)/.test(t);
}
function isGovOrState(host) {
  if (!host) return false;
  if (host.endsWith('.gov')) return true;
  if (/\.state\.\w{2}\.us$/.test(host)) return true;
  if (/\.([a-z]{2})\.gov$/.test(host)) return true;
  return false;
}
function isMedicalBoardHost(host) {
  const t = host || '';
  return /(medical|osteopathic|physician|licens|board)/.test(t);
}

// SAFE head check
async function headCheck(url) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, { method:'HEAD', redirect:'follow', signal:controller.signal });
    if (res.status === 405 || !res.headers?.get('content-type')) {
      res = await fetch(url, { method:'GET', redirect:'follow', signal:controller.signal });
    }
    const contentType = res.headers?.get('content-type') || '';
    const len = Number(res.headers?.get('content-length') || 0);
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, contentType, length: len };
  } catch (e) {
    return { ok:false, status:0, finalUrl:url, contentType:'', length:0, err:String(e) };
  } finally {
    clearTimeout(to);
  }
}

function scoreCandidate(row) {
  const url = row.candidate_url || row.url || '';
  const title = row.page_title || row.title || '';
  const notes = row.notes || '';
  const host = hostOf(url);

  let score = 0;
  score += Number(row.confidence || 0);

  // prefer .gov and state domains
  if (isGovOrState(host)) score += 30;
  if (isMedicalBoardHost(host)) score += 10;

  const pathLower = (new URL(url, 'https://x').pathname || '').toLowerCase();
  if (hasComplaintWords(title) || hasComplaintWords(pathLower) || hasComplaintWords(notes)) score += 25;
  if (hasAntiWords(title) || hasAntiWords(pathLower) || hasAntiWords(notes)) score -= 12;

  // HTTP gating
  if (row._check) {
    if (!row._check.ok || row._check.status < 200 || row._check.status >= 400) score -= 100;
    const u = row._check.finalUrl.toLowerCase();
    if (/login|signin|account|javascript:/.test(u)) score -= 40;
    if (row._check.length && row._check.length < 400) score -= 6;
  } else {
    score -= 5;
  }

  return score;
}

async function main() {
  if (!existsSync(CANDIDATES_CSV)) {
    console.error(`Missing ${CANDIDATES_CSV}. Run discovery first.`);
    process.exit(1);
  }

  const { headers, rows } = await readCsv(CANDIDATES_CSV);
  if (!headers.includes('approved')) headers.push('approved');

  // HEAD checks
  let i = 0;
  while (i < rows.length) {
    await Promise.all(rows.slice(i, i+FETCH_CONCURRENCY).map(async r => {
      const u = r.candidate_url || r.url || '';
      if (!u) return;
      r._check = await headCheck(u);
    }));
    i += FETCH_CONCURRENCY;
  }

  // group by state code (code or state_code or name fallback)
  const byCode = new Map();
  for (const r of rows) {
    const k = (r.code || r.state_code || r.name || '').trim();
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k).push(r);
    r.approved = ''; // reset
  }

  let approvals = 0;
  for (const [code, list] of byCode) {
    if (!code) continue;
    list.forEach(r => (r._score = scoreCandidate(r)));
    list.sort((a,b) => (b._score||0) - (a._score||0));
    const top = list[0];
    if (top && (top._score||-999) >= APPROVAL_THRESHOLD) {
      top.approved = '1';
      approvals++;
    }
  }

  await writeCsv(CANDIDATES_CSV, headers, rows);
  console.log(`Auto-approver (states): approved ${approvals} of ${byCode.size} states.`);

  // Apply to db/states.csv if script exists
  const applyPath = path.resolve('scripts/apply-states.mjs');
  if (existsSync(applyPath)) {
    const res = spawnSync(process.execPath, [applyPath], { stdio: 'inherit' });
    if (res.status !== 0) console.warn('apply-states.mjs exited non-zero.');
  } else {
    console.warn('No scripts/apply-states.mjs found; skipping states update.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
