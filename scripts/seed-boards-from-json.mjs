#!/usr/bin/env node
/**
 * Seeds D1 'boards' from public/assets/state-links.json.
 * Ensures states(code,name) exist; does NOT touch legacy 'link'/'unavailable'.
 *
 * Requires env (local or GitHub Actions):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }

async function run(sql) {
  const { stdout } = await pexec(
    "npx",
    ["wrangler", "d1", "execute", "medportal_db", "--remote", "--command", sql],
    { shell: false, env: process.env, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

async function main() {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  const stmts = [];
  stmts.push("DELETE FROM boards;");

  for (const s of data) {
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "");
    if (!/^[A-Z]{2}$/.test(code) || !name) continue;

    // Ensure state exists; do not modify legacy 'link'/'unavailable'
    stmts.push(
      `INSERT INTO states (code, name)
       VALUES (${q(code)}, ${q(name)})
       ON CONFLICT(code) DO UPDATE SET name=excluded.name;`
    );

    for (const l of (s.links || [])) {
      const board = String(l.board || "").trim();
      const url = String(l.url || "").trim();
      if (!board || !/^https?:\/\//i.test(url)) continue;

      const primary = l.primary ? 1 : 0;
      stmts.push(
        `INSERT INTO boards (state_code, board, url, primary_flag, active)
         VALUES (${q(code)}, ${q(board)}, ${q(url)}, ${primary}, 1);`
      );
    }
  }

  await run(stmts.join("\n"));
  console.log("Seeded boards from JSON.");
}

main().catch(e => { console.error(e); process.exit(1); });
