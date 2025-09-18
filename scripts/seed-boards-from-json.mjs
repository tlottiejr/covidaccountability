#!/usr/bin/env node
/**
 * Seeds D1 from public/assets/state-links.json
 * - Supports BOTH shapes:
 *   A) Legacy: { code, name, link, unavailable? }
 *   B) New:    { code, name, links: [ { board, url, primary? } ] }
 * - Ensures states(code,name) exist; does NOT touch legacy 'link'/'unavailable'.
 * - Re-creates boards from the JSON contents.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

function sql(v){ return `'${String(v).replace(/'/g,"''")}'`; }

async function execSql(sql) {
  await pexec("npx", [
    "wrangler","d1","execute","medportal_db",
    "--remote","--command", sql
  ], { shell:false, env:process.env, maxBuffer: 10*1024*1024 });
}

function normalizeLinks(state) {
  // If new shape present, use it
  if (Array.isArray(state.links) && state.links.length) {
    return state.links
      .filter(l => l && l.board && l.url && /^https?:\/\//i.test(l.url))
      .map(l => ({ board: String(l.board), url: String(l.url), primary: !!l.primary }));
  }
  // Legacy single-link fallback
  if (state.link && /^https?:\/\//i.test(state.link) && !state.unavailable) {
    return [{ board: "Official board site", url: String(state.link), primary: true }];
  }
  return [];
}

async function main() {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("state-links.json must be an array");

  let statesEnsured = 0, boardsInserted = 0;

  const stmts = [];
  stmts.push("DELETE FROM boards;");

  for (const s of data) {
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "");
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;

    stmts.push(
      `INSERT INTO states (code,name)
       VALUES (${sql(code)},${sql(name)})
       ON CONFLICT(code) DO UPDATE SET name=excluded.name;`
    );
    statesEnsured++;

    const links = normalizeLinks(s);
    for (const l of links) {
      const p = l.primary ? 1 : 0;
      stmts.push(
        `INSERT INTO boards (state_code, board, url, primary_flag, active)
         VALUES (${sql(code)}, ${sql(l.board)}, ${sql(l.url)}, ${p}, 1);`
      );
      boardsInserted++;
    }
  }

  await execSql(stmts.join("\n"));
  console.log(`Seed complete: states ensured=${statesEnsured}, boards inserted=${boardsInserted}`);
}

main().catch(e => { console.error(e); process.exit(1); });
