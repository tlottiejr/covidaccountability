// scripts/auto-approve-refs.mjs
// ESM-safe; no top-level await import. Node 20+.
// Auto-approve best reference candidate per label with solid heuristics,
// then rewrite About via scripts/apply-refs.mjs if available.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

// ---------- Config ----------

// If label looks like DOI, prefer doi.org or publisher that confirms DOI.
const DOI_HOSTS = new Set(['doi.org', 'dx.doi.org']);

// Prefer authoritative publishers/government/medical sources
const DOMAIN_ALLOWLIST = new Set([
  // publishers
  'nejm.org', 'jamanetwork.com', 'thelancet.com', 'bmj.com', 'springer.com',
  'nature.com', 'science.org', 'cell.com', 'frontiersin.org', 'tandfonline.com',
  'oup.com', 'academic.oup.com', 'cambridge.org', 'karger.com',
  // indexes / repos
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov',
  'arxiv.org', 'ssrn.com',
  // gov / intl orgs
  'who.int', 'cdc.gov', 'fda.gov', 'nih.gov', 'hhs.gov',
  // ethics/orgs cited
  'ama-assn.org', 'ama-assn.org', 'abms.org', 'abms.org',
  'federalregister.gov', 'uspto.gov',
]);

const TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 6;
const APPROVAL_THRESHOLD = 70; // overall score to auto-approve

const CANDIDATES_CSV = path.resolve('db/ref-candidates.csv');

// ---------- CSV helpers (minimal, robust enough for our files) ----------

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

// ---------- Utilities ----------

function isLikelyDoiLabel(label) {
  // bare DOI label, or starts with 10.xxx/
  const t = label.trim();
  return /^10\.\d{4,9}\/\S+$/i.test(t);
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// simple token overlap similarity (fast, deterministic)
function similarity(a, b) {
  const aa = new Set(normalize(a).split(' ').filter(Boolean));
  const bb = new Set(normalize(b).split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const t of aa) if (bb.has(t)) overlap++;
  return overlap / ((aa.size + bb.size) / 2);
}

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); }
  catch { return ''; }
}

// SAFE fetch with timeout + HEAD/GET fallback
async function headCheck(url) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 405 || res.status === 404 || !res.headers?.get('content-type')) {
      // fallback GET (some servers don't allow HEAD)
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    const contentType = res.headers?.get('content-type') || '';
    const len = Number(res.headers?.get('content-length') || 0);
    const finalUrl = res.url || url;
    return { ok: res.ok, status: res.status, contentType, length: len, finalUrl };
  } catch (e) {
    return { ok: false, status: 0, contentType: '', length: 0, finalUrl: url, err: String(e) };
  } finally {
    clearTimeout(to);
  }
}

function isPdf(contentType, url) {
  return /application\/pdf/i.test(contentType) || /\.pdf(\?|#|$)/i.test(url);
}

function domainWeight(host) {
  if (!host) return 0;
  if (DOI_HOSTS.has(host)) return 30;
  if (DOMAIN_ALLOWLIST.has(host)) return 20;
  if (/\.(gov|edu)$/i.test(host)) return 15;
  return 0;
}

function penaltyForSuspicious(url, contentType) {
  const u = url.toLowerCase();
  if (/login|signin|account|subscribe/.test(u)) return -35;
  if (/youtube|facebook|twitter|tiktok|instagram/.test(u)) return -50;
  if (!/^(text\/html|application\/pdf)/i.test(contentType)) return -10;
  return 0;
}

// ---------- Scoring ----------

function scoreCandidate(row, ctx) {
  // row: candidate row; ctx: { labelTitle }
  const label = (row.label_or_title || row.label || '').trim();
  const labelLooksDoi = isLikelyDoiLabel(label);
  const url = row.candidate_url || row.url || row.final_url || row.current_link || '';
  const title = row.page_title || row.title || '';

  const host = hostOf(url);
  let score = 0;

  // Base confidence if provided
  const base = Number(row.confidence || 0);
  score += base;

  // Domain weights
  score += domainWeight(host);

  // PDF alignment: if label mentions PDF and this is pdf, boost
  if ((/pdf/i.test(label) || /pdf/i.test(row.notes || '')) && isPdf('', url)) score += 8;

  // Title similarity
  if (title && label) {
    const sim = similarity(label, title);
    score += Math.round(sim * 40); // up to +40 from title match
    if (sim < 0.4) score -= 10; // weak title
  }

  // DOI strictness
  if (labelLooksDoi) {
    if (DOI_HOSTS.has(host)) score += 40;
    else score -= 25; // not DOI host; we might still accept if strong overall
  }

  // Notes & source nudges
  const src = (row.source || '').toLowerCase();
  if (src.includes('doi')) score += 10;
  if (src.includes('bing')) score += 3;

  // HTTP HEAD/GET validation cached on row._check
  if (row._check) {
    if (!row._check.ok || row._check.status < 200 || row._check.status >= 400) score -= 100;
    score += penaltyForSuspicious(row._check.finalUrl, row._check.contentType);
    // Non-empty & plausible type
    if (row._check.length && row._check.length < 400) score -= 8;
  } else {
    score -= 5; // unknown check
  }

  return score;
}

// ---------- Main ----------

async function main() {
  if (!existsSync(CANDIDATES_CSV)) {
    console.error(`Missing ${CANDIDATES_CSV}. Run discovery first.`);
    process.exit(1);
  }

  const { headers, rows } = await readCsv(CANDIDATES_CSV);
  const hdrs = new Set(headers);
  if (!hdrs.has('approved')) headers.push('approved');

  // Group by label
  const groups = new Map();
  for (const r of rows) {
    const key = (r.label_or_title || r.label || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // HEAD/GET checks in small batches
  const all = rows.slice();
  let i = 0;
  while (i < all.length) {
    await Promise.all(
      all.slice(i, i + FETCH_CONCURRENCY).map(async (r) => {
        const u = r.candidate_url || r.url || r.final_url || r.current_link || '';
        if (!u) return;
        r._check = await headCheck(u);
      })
    );
    i += FETCH_CONCURRENCY;
  }

  // Score & approve per label
  let approvals = 0;
  for (const [label, list] of groups) {
    if (!label) continue;
    // Score each
    for (const r of list) {
      r._score = scoreCandidate(r, { labelTitle: label });
      r.approved = ''; // default
    }
    list.sort((a, b) => (b._score || 0) - (a._score || 0));
    const top = list[0];
    if (top && (top._score || -999) >= APPROVAL_THRESHOLD) {
      top.approved = '1';
      approvals++;
    }
  }

  await writeCsv(CANDIDATES_CSV, headers, rows);
  console.log(`Auto-approver: approved ${approvals} winners out of ${groups.size} labels.`);

  // Try to apply About rewrite if the script exists
  const applyPath = path.resolve('scripts/apply-refs.mjs');
  if (existsSync(applyPath)) {
    const res = spawnSync(process.execPath, [applyPath], { stdio: 'inherit' });
    if (res.status !== 0) {
      console.warn('apply-refs.mjs exited non-zero; About not rewritten.');
    }
  } else {
    console.warn('No scripts/apply-refs.mjs found; skipping About rewrite.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
