// scripts/audit-refs.mjs
// Audits external links referenced in About page and writes db/ref-audit.csv

import { readText, writeCsv } from "./lib/csv.mjs";
import pLimit from "p-limit";
import { checkUrl } from "./lib/net.mjs";

const getEnvInt = (k, def) => {
  const v = process.env[k];
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : def;
};

const CONCURRENCY = getEnvInt("DISCOVERY_CONCURRENCY", 6);
const SRC = "public/about.html";
const OUT = "db/ref-audit.csv";

function nowMs() {
  return Date.now();
}

// scrape <a ... href="...">label</a>
function extractLinksWithLabels(html) {
  const out = [];
  // a) keep it exactly like your screenshot's regex, which found real anchors
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
  return out.filter((l) => (seen.has(l.link) ? false : seen.add(l.link)));
}

async function main() {
  const html = await readText(SRC);
  const links = extractLinksWithLabels(html);

  // ensure db/ exists (in case workflow runs in a clean container)
  const { mkdirSync } = await import("node:fs");
  mkdirSync("db", { recursive: true });

  const limit = pLimit(CONCURRENCY);

  const tasks = links.map((item) =>
    limit(async () => {
      const { status, ok, final_url, note } = await checkUrl(item.link);
      return [
        item.label,
        item.link,
        status,
        ok ? 1 : 0,
        final_url || "",
        nowMs(),
        note || "",
      ];
    })
  );

  const results = await Promise.all(tasks);

  await writeCsv(
    OUT,
    [
      "label_or_title",
      "current_link",
      "status",
      "ok",
      "final_url",
      "checked_at_ms",
      "notes",
    ],
    results
  );

  const broken = results.filter((r) => Number(r[3]) === 0);
  console.log(
    `Audited ${results.length} reference links. Broken/failed: ${broken.length}.`
  );
  console.log(`Report: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
