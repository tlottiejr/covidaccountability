// scripts/audit-states.mjs
import { mkdirSync } from "node:fs";
import { readText, parseCsv, writeCsv } from "./lib/csv.mjs";
import { pLimit, checkUrl, getEnvInt } from "./lib/net.mjs";

const CONCURRENCY = getEnvInt("DISCOVERY_CONCURRENCY", 6);
const TIMEOUT_MS = getEnvInt("DISCOVERY_TIMEOUT_MS", 12000);

const SRC = "db/states.csv";
const OUT = "db/state-link-audit.csv";

function nowMs() { return Date.now(); }

function normalizeUrl(u) {
  if (!u) return "";
  return u.trim().replace(/\s+/g, "");
}

function loadStates() {
  const text = readText(SRC);
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const [h, ...data] = rows;
  const idx = Object.fromEntries(h.map((k, i) => [k.trim().toLowerCase(), i]));
  return data
    .filter(r => r.length)
    .map(r => ({
      code: r[idx.code] ?? "",
      name: r[idx.name] ?? "",
      link: normalizeUrl(r[idx.link] ?? ""),
      unavailable: (r[idx.unavailable] ?? "").trim()
    }))
    .filter(s => s.code);
}

async function main() {
  const states = loadStates();
  mkdirSync("db", { recursive: true });

  const limit = pLimit(CONCURRENCY);
  const tasks = states.map(s => limit(async () => {
    if (!s.link) {
      return [s.code, s.name, 0, 0, "", nowMs(), "missing link"];
    }
    const r = await checkUrl(s.link, { timeoutMs: TIMEOUT_MS });
    const ok = r.ok ? 1 : 0;
    return [s.code, s.name, r.status, ok, r.final || "", nowMs(), r.error ? `error:${r.error}` : ""];
  }));

  const results = await Promise.all(tasks);
  writeCsv(OUT,
    ["code","name","status","ok","final_url","checked_at_ms","notes"],
    results
  );
  const broken = results.filter(r => Number(r[3]) === 0);
  console.log(`Audited ${results.length} states. Broken/failed: ${broken.length}.`);
  console.log(`Report: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
