#!/usr/bin/env node
/**
 * Seeds D1 from public/assets/state-links.json
 * Supports BOTH shapes:
 *  A) Legacy: { code, name, link, unavailable? }
 *  B) New:    { code, name, links: [ { board, url, primary? } ] }
 * Writes rows one-by-one using --json so failures surface.
 * Verifies counts from D1 at the end and exits non-zero if boards stayed 0.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

function esc(v){ return String(v).replace(/'/g,"''"); }

async function runJSON(args) {
  const { stdout } = await pexec("npx", args, {
    shell: false, env: process.env, maxBuffer: 10 * 1024 * 1024
  });
  const payload = JSON.parse(stdout);
  if (!payload || payload.success === false) {
    throw new Error(`wrangler failed: ${stdout}`);
  }
  return payload;
}

async function execSQL(sql) {
  return runJSON([
    "wrangler","d1","execute","medportal_db",
    "--remote","--json","--command", sql
  ]);
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
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("state-links.json must be an array");

  // Start with a clean 'boards' table
  await execSQL("DELETE FROM boards;");

  let statesEnsured = 0, boardsInserted = 0;

  // Upsert states (code, name)
  for (const s of data) {
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "");
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;

    await execSQL(
      `INSERT INTO states (code,name)
       VALUES ('${esc(code)}','${esc(name)}')
       ON CONFLICT(code) DO UPDATE SET name=excluded.name;`
    );
    statesEnsured++;

    const links = normalizeLinks(s);
    for (const l of links) {
      const p = l.primary ? 1 : 0;
      await execSQL(
        `INSERT INTO boards (state_code,board,url,primary_flag,active)
         VALUES ('${esc(code)}','${esc(l.board)}','${esc(l.url)}',${p},1);`
      );
      boardsInserted++;
    }
  }

  // Verify by querying D1 (authoritative)
  const statesCount = await execSQL("SELECT COUNT(*) AS c FROM states;");
  const boardsCount = await execSQL("SELECT COUNT(*) AS c FROM boards;");
  const sC = (statesCount.result?.[0]?.c ?? statesCount.result?.results?.[0]?.c) ?? 0;
  const bC = (boardsCount.result?.[0]?.c ?? boardsCount.result?.results?.[0]?.c) ?? 0;

  console.log(`Seed planned: states=${statesEnsured}, boards=${boardsInserted}`);
  console.log(`D1 now has:  states=${sC}, boards=${bC}`);

  if (sC < 50) {
    console.error("Seeding error: states table suspiciously small.");
    process.exit(1);
  }
  if (bC === 0) {
    console.error("Seeding error: no rows in boards after seeding.");
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
