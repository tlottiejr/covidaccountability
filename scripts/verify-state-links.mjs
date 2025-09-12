// scripts/verify-state-links.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, "..", "public", "assets", "state-links.json");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = "CovidAccountability StateLinkVerify/1.0 (+https://stage.covidaccountabilitynow.com)";

function registrable(host) {
  const parts = (host || "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}
function md(s) { return (s || "").replace(/\|/g, "\\|"); }

async function headOrLightGet(url) {
  const common = { redirect: "follow", headers: { "User-Agent": UA } };
  try {
    return await fetch(url, { method: "HEAD", ...common });
  } catch {}
  return await fetch(url, { method: "GET", ...common, headers: { ...common.headers, Range: "bytes=0-0" } });
}

async function check(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await headOrLightGet(url);
      return res;
    } catch (e) {
      lastErr = e; await sleep(1000 * (i + 1));
    }
  }
  throw lastErr || new Error("Network error");
}

async function verify(state, link) {
  const { code, name } = state;
  const board = link.board || "—";
  const url = link.url;
  if (!url) return { state: name, board, verdict: "WARN", status: 0, note: "Missing URL", expectedHost: "-", finalHost: "-" };

  try {
    const res = await check(url);
    const finalUrl = res.url || url;
    const status = res.status;
    const expectedHost = new URL(url).hostname;
    const finalHost = new URL(finalUrl).hostname;
    const expectedReg = registrable(expectedHost);
    const finalReg = registrable(finalHost);

    // verdicts
    let verdict = "OK";
    let note = "";

    if (status >= 500) { verdict = "FAIL"; note = `HTTP ${status}`; }
    else if (status === 404 || status === 410 || status === 451) { verdict = "FAIL"; note = `HTTP ${status}`; }
    else if (status === 401 || status === 403 || status === 429) { verdict = "WARN"; note = `HTTP ${status}`; }

    if (verdict !== "FAIL" && expectedReg !== finalReg) {
      verdict = "FAIL"; note = `Host mismatch (expected ${expectedReg}, got ${finalReg})`;
    } else if (verdict === "OK" && expectedHost !== finalHost) {
      note = `Redirected to ${finalHost}`;
    }

    return { state: name, board, verdict, status, note, expectedHost, finalHost };
  } catch (e) {
    return { state: name, board, verdict: "FAIL", status: 0, note: `Network error`, expectedHost: new URL(url).hostname, finalHost: "-" };
  }
}

function loadStates() {
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const data = loadStates();
  const rows = [];
  let fails = 0, warns = 0;

  rows.push("### State Links Verification\n");
  rows.push("| State | Board | Expected Host | Final Host | HTTP | Verdict | Note |");
  rows.push("|------|-------|---------------|-----------|------|---------|------|");

  for (const s of data) {
    for (const link of (s.links || [])) {
      if (!link?.url) continue;
      const r = await verify(s, link);
      if (r.verdict === "FAIL") fails++;
      if (r.verdict === "WARN") warns++;
      rows.push(`| ${md(r.state)} | ${md(r.board)} | ${md(r.expectedHost)} | ${md(r.finalHost)} | ${r.status} | ${r.verdict} | ${md(r.note)} |`);
    }
  }

  process.stdout.write(rows.join("\n") + "\n");
  if (fails > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });

