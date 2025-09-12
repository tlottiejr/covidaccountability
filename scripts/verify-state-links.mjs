// scripts/verify-state-links.mjs
// Verifies each board URL resolves to an allowed final host.
// Supports either /public/assets/state-links.json (rich) OR /public/assets/states.json (simple).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_STATE_LINKS = path.join(__dirname, "..", "public", "assets", "state-links.json");
const FILE_STATES      = path.join(__dirname, "..", "public", "assets", "states.json");

const UA = "CovidAccountability StateLinkVerify/1.2 (+https://stage.covidaccountabilitynow.com)";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function registrable(host) {
  const parts = (host || "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}
function md(s) { return (s || "").replace(/\|/g, "\\|"); }

function fileExists(p) { try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; } }

function loadFromStateLinks() {
  const raw = fs.readFileSync(FILE_STATE_LINKS, "utf8");
  const arr = JSON.parse(raw);
  // [{code, name, links:[{board,url,host?,allowedFinalHosts?}]}]
  return arr.flatMap((s) =>
    (s.links || []).map((l) => ({
      state: s.name || s.code,
      board: l.board || "—",
      url: l.url,
      declaredHost: l.host || "",
      allowedFinalHosts: Array.isArray(l.allowedFinalHosts) ? l.allowedFinalHosts : []
    }))
  );
}

function loadFromStatesJson() {
  const raw = fs.readFileSync(FILE_STATES, "utf8");
  const arr = JSON.parse(raw);
  // [{code, name, link, unavailable}]
  return arr
    .filter((s) => s.link)
    .map((s) => {
      const u = new URL(s.link);
      return {
        state: s.name || s.code,
        board: `${s.name} Board of Medicine`,
        url: s.link,
        declaredHost: u.hostname,        // use URL host as the declared host
        allowedFinalHosts: []            // can extend per-link later if needed
      };
    });
}

function loadData() {
  if (fileExists(FILE_STATE_LINKS)) return loadFromStateLinks();
  if (fileExists(FILE_STATES))      return loadFromStatesJson();
  throw new Error("No states data found. Expected public/assets/state-links.json or public/assets/states.json");
}

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

function anyMatch(reg, hosts = []) {
  return hosts.some((h) => registrable(h) === reg);
}

async function verify(entry) {
  const { state, board, url, declaredHost = "", allowedFinalHosts = [] } = entry;
  if (!url) return { state, board, verdict: "WARN", status: 0, note: "Missing URL", expectedHost: "-", finalHost: "-" };

  try {
    const res = await check(url);
    const finalUrl  = res.url || url;
    const status    = res.status;
    const expected  = new URL(url).hostname;
    const finalHost = new URL(finalUrl).hostname;

    const expectedReg = registrable(expected);
    const declaredReg = registrable(declaredHost);
    const finalReg    = registrable(finalHost);

    let verdict = "OK";
    let note = "";

    if (status >= 500 || [404,410,451].includes(status)) { verdict = "FAIL"; note = `HTTP ${status}`; }
    else if ([401,403,429].includes(status))             { verdict = "WARN"; note = `HTTP ${status}`; }

    const domainOk =
      finalReg === expectedReg ||
      (!!declaredReg && finalReg === declaredReg) ||
      anyMatch(finalReg, allowedFinalHosts);

    if (verdict !== "FAIL" && !domainOk) {
      verdict = "FAIL";
      const allowStr = [declaredHost, ...allowedFinalHosts].filter(Boolean).map(registrable).join(", ");
      note = `Host mismatch (final ${finalReg}; allowed: ${allowStr || "none"})`;
    } else if (verdict === "OK" && expected !== finalHost) {
      note = `Redirected to ${finalHost}`;
    }

    return { state, board, verdict, status, note, expectedHost: expected, finalHost };
  } catch {
    return { state, board, verdict: "FAIL", status: 0, note: "Network error", expectedHost: declaredHost || (url ? new URL(url).hostname : "-"), finalHost: "-" };
  }
}

async function main() {
  let entries;
  try {
    entries = loadData();
  } catch (e) {
    console.log("### State Links Verification\n");
    console.log("_" + e.message + "_\n");
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let fails = 0, warns = 0;

  rows.push("### State Links Verification\n");
  rows.push("| State | Board | Expected Host | Final Host | HTTP | Verdict | Note |");
  rows.push("|------|-------|---------------|-----------|------|---------|------|");

  for (const entry of entries) {
    const r = await verify(entry);
    if (r.verdict === "FAIL") fails++;
    if (r.verdict === "WARN") warns++;
    rows.push(`| ${md(r.state)} | ${md(r.board)} | ${md(r.expectedHost)} | ${md(r.finalHost)} | ${r.status} | ${r.verdict} | ${md(r.note)} |`);
  }
  console.log(rows.join("\n") + "\n");
  if (fails > 0) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });

