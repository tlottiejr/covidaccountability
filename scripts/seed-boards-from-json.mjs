#!/usr/bin/env node
/**
 * Seeds D1 from public/assets/state-links.json
 * Supports BOTH shapes:
 *  - Legacy: { code, name, link, unavailable? }
 *  - New:    { code, name, links:[{ board, url, primary? }] }
 * Verifies counts after seeding (robust JSON parse across wrangler versions).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");
const DB_NAME = "medportal_db"; // must match your D1 name

function esc(v){ return String(v).replace(/'/g,"''"); }

/** Run wrangler and return parsed JSON (throws on failure). */
async function runJSON(argv) {
  const { stdout } = await pexec("npx", argv, {
    shell: false, env: process.env, maxBuffer: 10 * 1024 * 1024
  });
  let payload;
  try { payload = JSON.parse(stdout); }
  catch (e) {
    console.error("Wrangler stdout (unparseable):\n", stdout);
    throw e;
  }
  if (!payload || payload.success === false) {
    console.error("Wrangler JSON indicated failure:\n", stdout);
    throw new Error("wrangler d1 execute failed");
  }
  return payload;
}

async function execSQL(sql) {
  return runJSON([
    "wrangler","d1","execute", DB_NAME,
    "--remote","--json","--command", sql
  ]);
}

/** Extract COUNT(*) AS c from any known wrangler JSON shape. */
function pickCount(payload) {
  const r = payload?.result;
  // Newer: { result: { results:[{c:..}], ... } }
  if (r && Array.isArray(r.results) && r.results[0]?.c != null) return Number(r.results[0].c);
  if (r && typeof r.c !== "undefined") return Number(r.c);

  // Older: { result: [ { results:[{c:..}] } ] }
  if (Array.isArray(r) && r[0]?.results && r[0].results[0]?.c != null) return Number(r[0].results[0].c);
  // Some versions: { result: [ { c: .. } ] }
  if (Array.isArray(r) && r[0]?.c != null) return Number(r[0].c);

  // Fallback: try to find a top-level number somewhere sane
  try {
    const text = JSON.stringify(payload);
    const m = text.match(/"c"\s*:\s*(\d+)/);
    if (m) return Number(m[1]);
  } catch {}
  return 0;
}

function normalizeLinks(state) {
  // New shape
  if (Array.isArray(state.links) && state.links.length) {
    return state.links
      .filter(l => l && l.board && l.url && /^https?:\/\//i.test(l.url))
      .map(l => ({ board: String(l.board), url: String(l.url), primary: !!l.primary }));
  }
  // Legacy fallback
  if (state.link && /^https?:\/\//i.test(state.link) && !state.unavailable) {
    return [{ board: "Official board site", url: String(state.link), primary: true }];
  }
  return [];
}

async function main() {
  const raw  = await fs.readFile(JSON_PATH,"utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("state-links.json must be an array");

  // Clean slate for boards
  await execSQL("DELETE FROM boards;");

  let statesEnsured = 0, boardsInserted = 0;
  const stmts = [];

  for (const s of data) {
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "");
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;

    stmts.push(
      `INSERT INTO states (code,name)
       VALUES ('${esc(code)}','${esc(name)}')
       ON CONFLICT(code) DO UPDATE SET name=excluded.name;`
    );
    statesEnsured++;

    for (const l of normalizeLinks(s)) {
      const p = l.primary ? 1 : 0;
      stmts.push(
        `INSERT INTO boards (state_code,board,url,primary_flag,active)
         VALUES ('${esc(code)}','${esc(l.board)}','${esc(l.url)}',${p},1);`
      );
      boardsInserted++;
    }
  }

  if (stmts.length) await execSQL(stmts.join("\n"));

  // Authoritative counts from D1 (robust parse)
  const sC = pickCount(await execSQL("SELECT COUNT(*) AS c FROM states;"));
  const bC = pickCount(await execSQL("SELECT COUNT(*) AS c FROM boards;"));

  console.log(`Seed planned: states=${statesEnsured}, boards=${boardsInserted}`);
  console.log(`D1 now has:  states=${sC}, boards=${bC}`);

  if (sC < 50) { console.error("Seeding error: states table suspiciously small."); process.exit(1); }
  if (bC === 0) { console.error("Seeding error: no rows in boards after seeding."); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
