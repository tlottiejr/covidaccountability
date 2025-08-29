// scripts/auto-approve-refs.mjs
// Auto-pick safe reference candidates from db/ref-candidates.csv and rewrite public/about.html.
// Heuristics: prefer DOI, PubMed, PMC, original journals; skip aggregators/blogs.

import fs from "node:fs";
import path from "node:path";

const CSV = path.resolve("db/ref-candidates.csv");
const ABOUT = path.resolve("public/about.html");

const TRUSTED = [
  "doi.org",
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "nejm.org",
  "jamanetwork.com",
  "thelancet.com",
  "bmj.com",
  "nature.com",
  "sciencedirect.com",
  "researchsquare.com", // use with caution, but many legit preprints
];

const SKIP = [
  "slideshare", "scribd", "medium.com", "blogspot", "wordpress", "substack",
  "linkedin", "facebook", "x.com", "twitter.com", "youtube.com"
];

function host(u) {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; }
}

function score(row) {
  // columns: label_or_title,current_link,candidate_url,source,confidence,notes
  const u = row.candidate_url?.trim();
  if (!u || SKIP.some(s => u.includes(s))) return -1;
  const h = host(u);

  let s = 0;
  if (row.source === "doi") s += 50;
  if (row.source === "bing") s += Math.min(40, parseInt(row.confidence || "0", 10) || 0);

  if (TRUSTED.some(t => h.endsWith(t))) s += 40;
  if (h.includes("doi.org")) s += 20;
  if (h.includes("pubmed.ncbi.nlm.nih.gov") || h.includes("pmc.ncbi.nlm.nih.gov")) s += 20;

  // prefer https + no query junk
  try {
    const url = new URL(u);
    if (url.protocol === "https:") s += 5;
    if (!url.search) s += 5;
  } catch {}
  return s;
}

function parseCSV(text) {
  const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
  const cols = header.split(",").map(s=>s.trim());
  return rows.map(r => {
    // naive CSV (quotes already normalized by our generator)
    const parts = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g).map(s=>s.replace(/^"|"$/g,""));
    const o = {};
    cols.forEach((c,i)=> o[c]=parts[i]);
    return o;
  });
}

function groupBest(rows) {
  // pick best candidate per label_or_title
  const best = new Map();
  for (const r of rows) {
    const key = r.label_or_title;
    const sc = score(r);
    if (sc < 60) continue; // threshold; tweak if you want stricter/looser
    const prev = best.get(key);
    if (!prev || sc > prev._score) best.set(key, { ...r, _score: sc });
  }
  return best;
}

function rewriteAbout(html, winners) {
  // anchors have data-label (we added previously); fall back to href text contains DOI if needed
  return html.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*)>(.*?)<\/a>/gsi,
    (m, pre, href, post, text) => {
      // try to find a label from data-label or title text
      const labelMatch = (pre + post).match(/data-label="([^"]+)"/);
      const label = labelMatch?.[1] || text.replace(/\s+/g," ").trim();
      const win = winners.get(label);
      if (!win) return m;
      const final = win.candidate_url;
      return `<a ${pre}href="${final}"${post}>${text}</a>`;
    }
  );
}

(async () => {
  const csv = fs.readFileSync(CSV, "utf8");
  const rows = parseCSV(csv);
  const winners = groupBest(rows);
  if (!winners.size) {
    console.log("No auto-approvals met the threshold.");
    process.exit(0);
  }
  const about = fs.readFileSync(ABOUT, "utf8");
  const out = rewriteAbout(about, winners);
  fs.writeFileSync(ABOUT + ".bak", about);
  fs.writeFileSync(ABOUT, out);
  console.log(`Applied ${winners.size} reference updates. Backup => public/about.html.bak`);
})();
