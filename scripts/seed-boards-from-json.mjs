#!/usr/bin/env node
/**
 * Seed D1 boards from public/assets/state-links.json
 * - Ensures states exist (code/name) without changing legacy states.link/unavailable columns.
 * - Replaces all rows in 'boards' with normalized links from JSON.
 *
 * Usage:
 *   node scripts/seed-boards-from-json.mjs
 *
 * Requires:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

function sqlQuote(v) { return `'${String(v).replace(/'/g, "''")}'`; }

async function wrangler(sql) {
  const { stdout } = await pexec("npx", ["wrangler", "d1", "execute", "medportal_db", "--remote", "--command", sql], {
    shell: false,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}

async function main() {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const doc = JSON.parse(raw);

  const stmts = [];
  stmts.push("PRAGMA foreign_keys = ON;");
  stmts.push("BEGIN;");
  stmts.push("DELETE FROM boards;");

  for (const s of doc) {
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "");
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;

    // Ensure state row exists (do not touch legacy single-link fields)
    stmts.push(
      `INSERT INTO states (code, name) VALUES (${sqlQuote(code)}, ${sqlQuote(name)})
       ON CONFLICT(code) DO UPDATE SET name=excluded.name;`
    );

    for (const l of (s.links || [])) {
      const board = String(l.board || "").trim();
      const url = String(l.url || "").trim();
      if (!board || !/^https?:\/\//i.test(url)) continue;
      const primary = l.primary ? 1 : 0;

      stmts.push(
        `INSERT INTO boards (state_code, board, url, primary_flag, active)
         VALUES (${sqlQuote(code)}, ${sqlQuote(board)}, ${sqlQuote(url)}, ${primary}, 1);`
      );
    }
  }

  stmts.push("COMMIT;");
  await wrangler(stmts.join("\n"));
  console.log("Seeded boards from JSON.");
}

main().catch((e) => { console.error(e); process.exit(1); });
