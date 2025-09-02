// scripts/audit-states.mjs
// Audits state complaint links from db/states.csv → db/state-link-audit.csv

import { readCsv, writeCsv } from "./lib/csv.mjs";
import pLimit from "p-limit";
import { checkUrl } from "./lib/net.mjs";

const getEnvInt = (k, def) => {
  const v = process.env[k];
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : def;
};

const CONCURRENCY = getEnvInt("DISCOVERY_CONCURRENCY", 6);
const SRC = "db/states.csv";
const OUT = "db/state-link-audit.csv";

async function main() {
  const states = await readCsv(SRC); // expect objects: { code, name, link, unavailable? }
  const { mkdirSync } = await import("node:fs");
  mkdirSync("db", { recursive: true });

  const limit = pLimit(CONCURRENCY);

  const tasks = states.map((row) =>
    limit(async () => {
      const current_link = (row.link || "").trim();
      if (!current_link) {
        return [
          row.code,
          row.name,
          "missing",
          "",
          "",
          "no_link",
        ];
      }

      const { status, ok, final_url, note } = await checkUrl(current_link);

      return [
        row.code,
        row.name,
        ok ? "ok" : "broken",
        current_link,
        final_url || "",
        note || "",
      ];
    })
  );

  const results = await Promise.all(tasks);

  await writeCsv(
    OUT,
    ["code", "name", "status", "current_link", "final_url", "notes"],
    results
  );

  const broken = results.filter((r) => r[2] !== "ok");
  console.log(
    `Audited ${results.length} states → ${OUT}\nok=${results.length - broken.length}, broken=${broken.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
