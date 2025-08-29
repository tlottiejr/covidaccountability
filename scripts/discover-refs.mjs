// scripts/discover-refs.mjs
import { mkdirSync } from "node:fs";
import { readText, writeCsv, parseCsv } from "./lib/csv.mjs";
import { bingSearch } from "./lib/search.mjs";

const CFG = JSON.parse(readText("config/discovery.json"));
const ABOUT = "public/about.html";
const AUDIT = "db/ref-audit.csv";
const OUT = "db/ref-candidates.csv";

function extractLinksWithLabels(html) {
  const out = [];
  const re = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue;
    const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    out.push({ link: href, label: label || href });
  }
  // dedupe by link
  const seen = new Set();
  return out.filter(i => (seen.has(i.link) ? false : seen.add(i.link)));
}
function findDOI(text) {
  const s = String(text || "");
  const m1 = /10\.\d{4,9}\/\S+/i.exec(s);
  if (m1) return m1[0].replace(/[.,)\]]+$/, "");
  const m2 = /https?:\/\/doi\.org\/(10\.\d{4,9}\/\S+)/i.exec(s);
  if (m2) return m2[1].replace(/[.,)\]]+$/, "");
  return "";
}
function trustedBoost(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    const domain = host.split(".").slice(-2).join(".");
    const t = CFG.references.prefer.join("|");
    if (host.includes("doi.org")) return 80;
    if (new RegExp(t.replace(/\./g, "\\."), "i").test(host)) return 60;
    return 10;
  } catch { return 0; }
}
function scoreRefCandidate(item, title) {
  const t = `${item.title} ${item.snippet}`.toLowerCase();
  let s = trustedBoost(item.url);
  if (title) {
    const hits = title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && t.includes(w)).length;
    s += Math.min(30, hits * 3);
  }
  return s;
}

async function searchForRef(title) {
  const q = `${title} (publisher OR journal OR pubmed OR nih OR doi)`;
  let items = [];
  try { items = await bingSearch(q, { count: 12 }); } catch {}
  const scored = items.map(it => ({ ...it, score: scoreRefCandidate(it, title) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, CFG.references.maxCandidatesPerRef || 3);
}

async function main() {
  mkdirSync("db", { recursive: true });

  const html = readText(ABOUT);
  const links = extractLinksWithLabels(html);

  const audit = parseCsv(readText(AUDIT));
  const [h, ...rows] = audit;
  const idx = Object.fromEntries(h.map((k, i) => [k.trim().toLowerCase(), i]));

  const failures = new Set(
    rows.filter(r => Number(r[idx.ok] || 0) === 0).map(r => r[idx.current_link])
  );

  const out = [];
  for (const item of links) {
    if (!failures.has(item.link)) continue;

    const maybeDOI = findDOI(`${item.link} ${item.label}`);
    if (maybeDOI) {
      out.push([item.label, item.link, `https://doi.org/${maybeDOI}`, "doi", 90, "DOI resolver"]);
      // still try search for publisher/PubMed as alternates
    }

    const picks = await searchForRef(item.label);
    for (const p of picks) {
      out.push([item.label, item.link, p.url, "bing", p.score, p.title || ""]);
    }
  }

  writeCsv(OUT,
    ["label_or_title","current_link","candidate_url","source","confidence","notes"],
    out
  );
  console.log(`Wrote ${out.length} reference candidates → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
