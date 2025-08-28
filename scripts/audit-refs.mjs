// scripts/audit-refs.mjs
import { mkdirSync } from "node:fs";
import { readText, writeCsv } from "./lib/csv.mjs";
import { pLimit, checkUrl, getEnvInt } from "./lib/net.mjs";

const CONCURRENCY = getEnvInt("DISCOVERY_CONCURRENCY", 6);
const TIMEOUT_MS = getEnvInt("DISCOVERY_TIMEOUT_MS", 12000);

const SRC = "public/about.html";
const OUT = "db/ref-audit.csv";

function nowMs() { return Date.now(); }

function extractLinksWithLabels(html) {
  const out = [];
  // <a ... href="http...">label</a>
  const re = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue; // external only
    const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    out.push({ link: href, label: label || href });
  }
  // dedupe by link
  const seen = new Set();
  return out.filter(i => (seen.has(i.link) ? false : seen.add(i.link)));
}

async function main() {
  const html = readText(SRC);
  const links = extractLinksWithLabels(html);
  mkdirSync("db", { recursive: true });

  const limit = pLimit(CONCURRENCY);
  const tasks = links.map(item => limit(async () => {
    const r = await checkUrl(item.link, { timeoutMs: TIMEOUT_MS });
    const ok = r.ok ? 1 : 0;
    return [item.label, item.link, r.status, ok, r.final || "", nowMs(), r.error ? `error:${r.error}` : ""];
  }));

  const results = await Promise.all(tasks);
  writeCsv(OUT,
    ["label_or_title","current_link","status","ok","final_url","checked_at_ms","notes"],
    results
  );
  const broken = results.filter(r => Number(r[3]) === 0);
  console.log(`Audited ${results.length} reference links. Broken/failed: ${broken.length}.`);
  console.log(`Report: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
