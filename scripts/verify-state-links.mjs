// scripts/verify-state-links.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, "..", "public", "assets", "state-links.json");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = "CovidAccountability StateLinkVerify/1.1 (+https://stage.covidaccountabilitynow.com)";

function registrable(host) {
  const parts = (host || "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}
function md(s) { return (s || "").replace(/\|/g, "\\|"); }

async function headOrLightGet(url) {
  const common = { redirect: "follow", headers: { "User-Agent": UA } };
  try { return await fetch(url, { method: "HEAD", ...common }); }
  catch {}
  return await fetch(url, { method: "GET", ...common, headers: { ...common.headers, Range: "bytes=0-0" } });
}
async function check(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try { return await headOrLightGet(url); }
    catch (e) { lastErr = e; await sleep(1000 * (i + 1)); }
  }
  throw lastErr || new Error("Network error");
}

function matchesAny(reg, list = []) {
  return list.some(h => registrable(h) === reg);
}

async function verify(state, link) {
  const { name: stateName } = state;
  const board = link.board || "—";
  const url = link.url;
  if (!url) return { state: stateName, board, verdict: "WARN", status: 0, note: "Missing URL", expectedHost: "-", finalHost: "-" };

  const declaredHost = link.host || ""; // optional in your JSON
  const allow = Array.isArray(link.allowedFinalHosts) ? link.allowedFinalHosts : [];

  try {
    const res = await check(url);
    const finalUrl = res.url || url;
    const status = res.status;
    const expectedHost = new URL(url).hostname;
    const finalHost = new URL(finalUrl).hostname;

    const expectedReg = registrable(expectedHost);
    const declaredReg = registrable(declaredHost);
    const finalReg = registrable(finalHost);

    let verdict = "OK";
    let note = "";

    if (status >= 500) { verdict = "FAIL"; note = `HTTP ${status}`; }
    else if ([404,410,451].includes(status)) { verdict = "FAIL"; note = `HTTP ${status}`; }
    else if ([401,403,429].includes(status)) { verdict = "WARN"; note = `HTTP ${status}`; }

    const domainOk =
      finalReg === expectedReg ||
      (declaredReg && finalReg === declaredReg) ||
      matchesAny(finalReg, allow);

    if (verdict !== "FAIL" && !domainOk) {
      verdict = "FAIL";
      const allowStr = [declaredReg, ...allow].filter(Boolean).map(registrable).join(", ");
      note = `Host mismatch (final ${finalReg}; allowed: ${allowStr || "none"})`;
    } else if (verdict === "OK" && expectedHost !== finalHost) {
      note = `Redirected to ${finalHost}`;
    }

    return { state: stateName, board, verdict, status, note, expectedHost, finalHost };
  } catch {
    return { state: stateName, board, verdict: "FAIL", status: 0, note: "Network error", expectedHost: declaredHost || new URL(url).hostname, finalHost: "-" };
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
