#!/usr/bin/env node
/**
 * Seeds D1 from public/assets/state-links.json
 * Supports BOTH shapes:
 *  - Legacy: { code, name, link, unavailable? }
 *  - New:    { code, name, links:[{ board, url, primary? }] }
 * Pins to the DB by UUID to avoid account/name mismatches.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

const DB_NAME = "medportal_db";
const DB_ID   = process.env.D1_DATABASE_ID || "84a3b4f0-70fe-4d09-8006-c35576e4e109"; // <— YOUR UUID

function esc(v){ return String(v).replace(/'/g,"''"); }

async function runJSON(argv) {
  const { stdout } = await pexec("npx", argv, {
    shell: false, env: process.env, maxBuffer: 10 * 1024 * 1024
  });
  const payload = JSON.parse(stdout);
  if (!payload || payload.success === false) throw new Error(stdout);
  return payload;
}

async function execSQL(sql) {
  return runJSON([
    "wrangler","d1","execute", DB_NAME,
    "--database-id", DB_ID,
    "--remote","--json","--command", sql
  ]);
}

function normalizeLinks(state) {
  if (Array.isArray(state.links) && state.links.length) {
    return state.links
      .filter(l => l && l.board && l.url && /^https?:\/\//i.test(l.url))
      .map(l => ({ board: String(l.board), url: String(l.url), primary: !!l.primary }));
  }
  if (state.link && /^https?:\/\//i.test(state.link) && !state.unavailable) {
    return [{ board: "Official board site", url: String(state.link), primary: true }];
  }
  return [];
}

async function main() {
  const raw  = await fs.readFile(JSON_PATH,"utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("state-links.json must be an array");

  await execSQL("DELETE FROM boards;");

  let statesEnsured = 0, boardsInserted = 0;

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

    for (const l of normalizeLinks(s)) {
      const p = l.primary ? 1 : 0;
      await execSQL(
        `INSERT INTO boards (state_code,board,url,primary_flag,active)
         VALUES ('${esc(code)}','${esc(l.board)}','${esc(l.url)}',${p},1);`
      );
      boardsInserted++;
    }
  }

  // verify authoritative counts from this DB (by UUID)
  const sC = await execSQL("SELECT COUNT(*) AS c FROM states;");
  const bC = await execSQL("SELECT COUNT(*) AS c FROM boards;");
  const states = (sC.result?.[0]?.c ?? sC.result?.results?.[0]?.c) ?? 0;
  const boards = (bC.result?.[0]?.c ?? bC.result?.results?.[0]?.c) ?? 0;

  console.log(`Seed planned: states=${statesEnsured}, boards=${boardsInserted}`);
  console.log(`D1 now has:  states=${states}, boards=${boards}`);

  if (states < 50) { console.error("Seeding error: states table suspiciously small."); process.exit(1); }
  if (boards === 0) { console.error("Seeding error: no rows in boards after seeding."); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
