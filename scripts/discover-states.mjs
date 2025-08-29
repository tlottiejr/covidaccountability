// scripts/discover-states.mjs
import { existsSync, mkdirSync } from "node:fs";
import { readText, parseCsv, writeCsv } from "./lib/csv.mjs";
import { bingSearch, getEnv } from "./lib/search.mjs";

const CFG = JSON.parse(readText("config/discovery.json"));
const OUT = "db/state-link-candidates.csv";
const STATES = "db/states.csv";
const AUDIT = "db/state-link-audit.csv";

const TRUST_GOV = 60, TRUST_STATE = 35, TRUST_OTHER = 10;
const KW_HIT = 12, KW_NEG = -16, PATH_COMPLAINT = 18;

function rows(path) {
  return existsSync(path) ? parseCsv(readText(path)) : [];
}
function indexByHeader(rows) {
  if (!rows.length) return { header: [], data: [], idx: {} };
  const [h, ...data] = rows;
  const idx = Object.fromEntries(h.map((k, i) => [k.trim().toLowerCase(), i]));
  return { header: h, data, idx };
}
function govTrust(url) {
  let host = "";
  try { host = new URL(url).host.toLowerCase(); } catch { return TRUST_OTHER; }
  if (host.endsWith(".gov")) return TRUST_GOV;
  if (host.includes(".state.") || /\.state\.[a-z]{2}\./.test(host) || /\.us$/.test(host)) return TRUST_STATE;
  return TRUST_OTHER;
}
function scoreResult(r, keywords, neg) {
  const url = r.url.toLowerCase();
  const title = `${r.title} ${r.snippet}`.toLowerCase();
  let s = govTrust(r.url);
  if (url.includes("complaint")) s += PATH_COMPLAINT;
  for (const k of keywords) if (url.includes(k) || title.includes(k)) s += KW_HIT;
  for (const k of neg) if (url.includes(k) || title.includes(k)) s += KW_NEG;
  return s;
}
function uniqueByUrl(list) {
  const seen = new Set();
  return list.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}

async function discoverForState(name) {
  const queries = [
    `${name} medical board complaint`,
    `${name} board of medicine complaint`,
    `${name} file a complaint site:.gov`
  ];
  let results = [];
  for (const q of queries) {
    try {
      const items = await bingSearch(q, { count: 12 });
      results = results.concat(items);
    } catch { /* skip */ }
  }
  const dedup = uniqueByUrl(results);
  const scored = dedup.map(r => ({
    ...r,
    score: scoreResult(r, CFG.states.keywords, CFG.states.negativeKeywords)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, CFG.states.maxCandidatesPerState || 3);
}

async function main() {
  mkdirSync("db", { recursive: true });

  const s = indexByHeader(rows(STATES));
  const a = indexByHeader(rows(AUDIT));

  const auditByCode = new Map(
    a.data.map(r => [r[a.idx.code], { status: Number(r[a.idx.status] || 0), ok: Number(r[a.idx.ok] || 0) }])
  );

  const outRows = [];
  for (const r of s.data) {
    const code = r[s.idx.code], name = r[s.idx.name], link = (r[s.idx.link] || "").trim();
    const audit = auditByCode.get(code);
    const needs = !link || !audit || audit.ok === 0 || audit.status >= 400 || audit.status === -1;
    if (!needs) continue;

    const picks = await discoverForState(name);
    for (const p of picks) {
      outRows.push([code, name, p.url, "bing", p.score, p.title, "auto"]);
    }
  }

  writeCsv(OUT,
    ["code","name","candidate_url","source","confidence","page_title","notes"],
    outRows
  );
  console.log(`Wrote ${outRows.length} candidate rows → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
