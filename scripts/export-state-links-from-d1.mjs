#!/usr/bin/env node
/**
 * Export authoritative data from D1 → public/assets/state-links.json
 * Shape: [{ code, name, links:[{ board, url, primary? }] }]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "assets", "state-links.json");

async function query(sql) {
  const { stdout } = await pexec(
    "npx",
    ["wrangler", "d1", "execute", "medportal_db", "--remote", "--command", sql],
    { shell: false, env: process.env, maxBuffer: 10 * 1024 * 1024 }
  );
  const res = JSON.parse(stdout);
  return res?.result || [];
}

function primaryObj(flag) { return flag ? { primary: true } : {}; }

async function main() {
  const states = await query(
    `SELECT code, name FROM states WHERE COALESCE(name,'') <> '' ORDER BY code;`
  );

  const boards = await query(
    `SELECT state_code, board, url, primary_flag
       FROM boards
      WHERE active = 1
      ORDER BY state_code, primary_flag DESC, board;`
  );

  const by = new Map();
  for (const b of boards) {
    const arr = by.get(b.state_code) || [];
    arr.push({ board: b.board, url: b.url, ...primaryObj(b.primary_flag === 1) });
    by.set(b.state_code, arr);
  }

  const out = states.map(s => ({
    code: s.code,
    name: s.name,
    links: by.get(s.code) || []
  }));

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Exported ${out.length} states -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
