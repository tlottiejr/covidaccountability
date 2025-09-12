// scripts/verify-state-links.mjs
// Node 18/20+ (uses global fetch)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, "..", "public", "assets", "state-links.json");

// Helpers
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function registrable(host) {
  // Simple approximation: last two labels. Works for *.gov, *.org, *.com.
  // Good enough for US state board sites (e.g., mbc.ca.gov -> ca.gov).
  const parts = (host || "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

function fmt(s) { return (s || "").replace(/\|/g, "\\|"); } // escape for md table

async function headOrLightGet(url, userAgent) {
  // Try HEAD first; many sites block HEAD, so fall back to GET with small Range.
  const common = { redirect: "follow", headers: { "User-Agent": userAgent } };
  try {
    const res = await fetch(url, { method: "HEAD", ...common });
    return res;
  } catch {
    // fall through
  }
  try {
    const res = await fetch(url, { method: "GET", ...common, headers: { ...common.headers, Range: "bytes=0-0" } });
    return res;
  } catch (e) {
    throw e;
  }
}

async function verifyLink(stateCode, stateName, board, url) {
  const UA = "CovidAccountability StateLinkVerify/1.0 (+https://stage.covidaccountabilitynow.com)";
  let attempts = 0;
  const maxAttempts = 3;
  let lastErr = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await headOrLightGet(url, UA);
      const finalUrl = res.url || url;
      const status = res.status;
      const expectedHost = new URL(url).hostname;
      const finalHost = new URL(finalUrl).hostname;

      const expectedReg = registrable(expectedHost);
      const finalReg = registrable(finalHost);

      // Verdict logic:
      // - Hard fail: HTTP 4xx/5xx (except 429 -> warn), or registrable domains mismatch
      // - Warn: 429 (rate limit) or unusual redirect chains but same registrable
      let verdict = "OK";
      let note = "";

      if (status >= 400 && status !== 429) {
        verdict = "FAIL";
        note = `HTTP ${status}`;
      } else if (expectedReg !== finalReg) {
        verdict = "FAIL";
        note = `Host mismatch (expected ${expectedReg}, got ${finalReg})`;
      } else if (status === 429) {
        verdict = "WARN";
        note = "Rate limited (429)";
      } else if (expectedHost !== finalHost) {
        verdict = "OK";
        note = `Redirected to ${finalHost}`;
      }

      return { verdict, status, expectedHost, finalHost, note, finalUrl };
    } catch (e) {
      lastErr = e;
      await sleep(1000 * attempts); // simple backoff
    }
  }

  return { verdict: "FAIL", status: 0, expectedHost: new URL(url).hostname, finalHost: "-", note: `Network error: ${lastErr}` };
}

function loadStates() {
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const data = loadStates(); // array of { code, name, links:[{board,url,...}] }
  const rows = [];
  let fails = 0;
  let warns = 0;

  rows.push("### State Links Verification");
  rows.push("");
  rows.push("| State | Board | Expected Host | Final Host | HTTP | Verdict | Note |");
  rows.push("|------|-------|---------------|-----------|------|---------|------|");

  for (const s of data) {
    for (const link of (s.links || [])) {
      const board = link.board || "—";
      const url = link.url || "";
      if (!url) continue;

      const r = await verifyLink(s.code, s.name, board, url);
      if (r.verdict === "FAIL") fails++;
      if (r.verdict === "WARN") warns++;

      rows.push(`| ${fmt(s.name)} | ${fmt(board)} | ${fmt(r.expectedHost)} | ${fmt(r.finalHost)} | ${r.status} | ${r.verdict} | ${fmt(r.note)} |`);
    }
  }

  const out = rows.join("\n") + "\n";
  process.stdout.write("\n" + out + "\n");

  if (fails > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
