// scripts/auto-approve-refs.mjs
// Auto-approves obvious, trustworthy reference links only.
// Writes `approved=1` to db/ref-candidates.csv rows that pass the threshold.
// Leaves everything else unapproved for manual review.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const CANDIDATES = "db/ref-candidates.csv";
const OUTPUT = CANDIDATES; // in-place update
const MIN_CONF = Number(process.env.MIN_CONF || 88);

// Very conservative allow/block lists
const ALLOW = [
  "doi.org", "ncb.nlm.nih.gov", "nih.gov", "nejm.org", "nejm.org", "jama",
  "ncbi.nlm.nih.gov", "who.int", "cdc.gov", "fda.gov", "supremecourt.gov",
  "jamanetwork.com", "aacn.org", "aacrjournals.org", "thelancet.com",
  "nature.com", "science.org", "bmj.com", "oxfordacademic.com", "elsevier.com",
  "springer.com", "sciencedirect.com", "wiley.com", "cambridge.org"
];
const BLOCK = [
  "researchgate.net", "docplayer.net", "scribd.com", "pinterest",
  "medium.com", "blogspot.", "facebook.com", "twitter.com", "academia.edu",
  "mendeley.com", "archive.ph", "archive.is"
];

const PDF_HINTS = ["pdf", "download", ".pdf"];

// Simple helpers
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const hdr = lines[0].split(",");
  return {
    header: hdr,
    rows: lines.slice(1).map(l => {
      // tolerate quoted commas
      const cells = [];
      let cur = "", q = false;
      for (let i=0;i<l.length;i++){
        const c=l[i];
        if (c === '"' && l[i+1] === '"'){ cur += '"'; i++; continue; }
        if (c === '"'){ q=!q; continue; }
        if (c === "," && !q){ cells.push(cur); cur=""; continue;}
        cur += c;
      }
      cells.push(cur);
      const obj = {};
      hdr.forEach((h,idx)=>obj[h]=cells[idx] ?? "");
      return obj;
    })
  };
};
const toCSV = (header, rows) => {
  const esc = v => {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const head = header.join(",");
  const body = rows.map(r => header.map(h => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body + "\n";
};

const getHost = (u) => {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ""; }
};
const isAllowed = (host) => ALLOW.some(a => host.includes(a));
const isBlocked = (host) => BLOCK.some(b => host.includes(b));
const isHttps = (u) => u.startsWith("https://");

const looksLikeDOI = (label) =>
  /(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)|\bdoi\b/i.test(label);

const stripTracking = (u) => {
  try {
    const url = new URL(u);
    [...url.searchParams.keys()].forEach(k => {
      if (/^utm_|^fbclid$/i.test(k)) url.searchParams.delete(k);
    });
    return url.toString();
  } catch { return u; }
};

const fuzzyScore = (label, pageTitle) => {
  if (!label || !pageTitle) return 0;
  const want = label.toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(Boolean);
  const got  = pageTitle.toLowerCase();
  const hit = want.filter(t => got.includes(t)).length;
  const cov = hit / Math.max(1, want.length);
  return Math.round(100 * cov);
};

// Scoring policy
const scoreCandidate = (row) => {
  let s = 0;
  const host = getHost(row.candidate_url || "");
  const status = Number(row.status || 0);
  const title = row.page_title || "";
  const label = row.label_or_title || row.label || "";

  if (!isHttps(row.candidate_url)) s -= 50;
  if (status !== 200) s -= 40; else s += 10;

  if (isAllowed(host)) s += 40;
  if (isBlocked(host)) s -= 60;

  if (looksLikeDOI(label) && (host.includes("doi.org") || host.includes("ncbi.nlm.nih.gov"))) s += 30;

  if (PDF_HINTS.some(h => label.toLowerCase().includes(h))) {
    // reward likely-PDF targets
    if (/pdf/i.test(row.content_type || "") || /\.pdf($|\?)/i.test(row.candidate_url)) s += 15;
    else s -= 10;
  }

  s += Math.min(25, Math.floor(fuzzyScore(label, title) / 4)); // up to +25

  // penalize very long or quirky URLs
  if ((row.candidate_url || "").length > 180) s -= 5;
  if (/\b(login|signin|captcha|terms)\b/i.test(row.candidate_url || "")) s -= 30;

  return s;
};

function pickAutoApprove(groupRows) {
  // groupRows share same label/identifier
  // choose the highest-scoring candidate >= MIN_CONF
  let best = null, bestScore = -999;
  for (const r of groupRows) {
    const sc = scoreCandidate(r);
    r._score = sc;
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  if (bestScore >= MIN_CONF && isAllowed(getHost(best.candidate_url))) {
    return best;
  }
  return null;
}

const run = async () => {
  if (!fs.existsSync(CANDIDATES)) {
    console.error(`Missing ${CANDIDATES}`);
    process.exit(1);
  }
  const txt = fs.readFileSync(CANDIDATES, "utf8");
  const { header, rows } = parseCSV(txt);

  // ensure columns
  const required = ["label_or_title","candidate_url","source","page_title","status","content_type","approved"];
  for (const c of required) if (!header.includes(c)) header.push(c);

  // group by label_or_title
  const byLabel = new Map();
  for (const r of rows) {
    const k = r.label_or_title || r.label || r.id || r.current_link || "unknown";
    if (!byLabel.has(k)) byLabel.set(k, []);
    byLabel.get(k).push(r);
  }

  for (const [label, group] of byLabel.entries()) {
    const winner = pickAutoApprove(group);
    if (!winner) continue;
    for (const r of group) {
      if (r === winner) {
        r.approved = "1";
        r.candidate_url = stripTracking(r.candidate_url);
      }
    }
  }

  fs.writeFileSync(OUTPUT, toCSV(header, rows), "utf8");
  console.log(`Auto-approval pass complete. Threshold: ${MIN_CONF}`);
};

run().catch(e => { console.error(e); process.exit(1); });

