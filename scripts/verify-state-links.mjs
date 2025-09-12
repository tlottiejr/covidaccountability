// scripts/verify-state-links.mjs
// Server-side verifier for state-links.json (runs in GitHub Actions).
// - Follows redirects, classifies status codes, tolerates CORS by design.
// - Supports optional allowedFinalHosts per board entry.
// Output: Markdown table appended to reports/link-health.md.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_PATH = resolve("public/assets/state-links.json");

function loadData() {
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("state-links.json is not an array");
    return data;
  } catch (e) {
    throw new Error(`Failed to load ${DATA_PATH}: ${e.message}`);
  }
}

function md(s) {
  if (s == null) return "";
  return String(s).replaceAll("|", "\\|");
}

const registrable = (host) => (host || "").split(".").filter(Boolean).slice(-2).join(".");

async function fetchHeadOrGet(url) {
  // Boards often 405 on HEAD; use GET and follow redirects.
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  return res;
}

function classify(status) {
  if ((status >= 200 && status <= 206) || [300,301,302,303,307,308].includes(status))
    return "OK";
  if ([401,403,429].includes(status)) return "WARN";
  if ([404,410,451].includes(status) || status >= 500) return "FAIL";
  return "WARN";
}

async function verifyEntry(entry) {
  const { code, name, links } = entry;
  const results = [];

  for (const link of (links || [])) {
    const board = link.board;
    const url = link.url;
    const expectedHost = new URL(url).hostname;
    const expectedReg  = registrable(expectedHost);
    const allowHosts = Array.isArray(link.allowedFinalHosts) ? link.allowedFinalHosts : [];

    let status = 0, finalUrl = url, note = "";
    try {
      const res = await fetchHeadOrGet(url);
      status = res.status;
      finalUrl = res.url || url;
    } catch (e) {
      status = 0;
      note = "network/CORS";
    }

    let verdict = classify(status);
    const finalHost = (() => { try { return new URL(finalUrl).hostname; } catch { return expectedHost; } })();
    const finalReg = registrable(finalHost);

    if (verdict === "OK") {
      if (finalReg !== expectedReg && !allowHosts.includes(finalHost)) {
        verdict = "WARN";
        note = `redirect ${finalHost}`;
      }
    }

    results.push({
      state: `${name} (${code})`,
      board, expectedHost, finalHost, status, verdict, note
    });
  }

  return results;
}

async function main() {
  console.log("### State Links Verification\n");
  const rows = [];
  rows.push("| State | Board | Expected Host | Final Host | HTTP | Verdict | Note |");
  rows.push("|------|-------|---------------|-----------|------|---------|------|");

  let fails = 0, warns = 0;
  let entries;

  try {
    entries = loadData();
  } catch (e) {
    console.log(`_${e.message}_\n`);
    process.exitCode = 1;
    return;
  }

  for (const entry of entries) {
    const res = await verifyEntry(entry);
    for (const r of res) {
      if (r.verdict === "FAIL") fails++;
      if (r.verdict === "WARN") warns++;
      rows.push(`| ${md(r.state)} | ${md(r.board)} | ${md(r.expectedHost)} | ${md(r.finalHost)} | ${r.status} | ${r.verdict} | ${md(r.note)} |`);
    }
  }

  console.log(rows.join("\n") + "\n");
  console.log(`**Totals:** ${entries.length} states — WARN: ${warns}, FAIL: ${fails}\n`);

  // report-only by default; flip via STATE_ENFORCE in workflow
  const enforce = (process.env.STATE_ENFORCE || "false").toLowerCase() === "true";
  process.exitCode = enforce && fails > 0 ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });

