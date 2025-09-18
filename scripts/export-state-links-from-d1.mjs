#!/usr/bin/env node
/**
 * Export from D1 -> public/assets/state-links.json
 * Primary source: boards; Fallback: legacy states.link/unavailable
 * Robustly parses wrangler --json output across versions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const OUT  = path.join(ROOT, "public", "assets", "state-links.json");
const DB_NAME = "medportal_db";

/** call wrangler d1 execute --json and return parsed payload */
async function runJSON(sql) {
  const { stdout } = await pexec(
    "npx",
    ["wrangler","d1","execute", DB_NAME, "--remote","--json","--command", sql],
    { shell:false, env:process.env, maxBuffer: 10*1024*1024 }
  );
  let payload;
  try { payload = JSON.parse(stdout); }
  catch (e) {
    console.error("Wrangler stdout (unparseable):\n", stdout);
    throw e;
  }
  if (!payload || payload.success === false) {
    console.error("Wrangler JSON indicated failure:\n", JSON.stringify(payload,null,2));
    throw new Error("wrangler d1 execute failed");
  }
  return payload;
}

/** extract rows array from any known wrangler JSON shape */
function pickRows(payload) {
  const r = payload?.result;

  // Most recent: { result: { results:[{...},{...}] } }
  if (r && Array.isArray(r.results)) return r.results;

  // Older: { result: [ { results:[{...}] } ] }
  if (Array.isArray(r) && r[0]?.results && Array.isArray(r[0].results)) return r[0].results;

  // Sometimes: { result: [ { success:true, results:[...] } ] }
  if (Array.isArray(r) && r[0]?.success && Array.isArray(r[0].results)) return r[0].results;

  // Very old: { result: [...] } where the rows are directly in result
  if (Array.isArray(r) && r.length && typeof r[0] === "object" && !("results" in r[0])) return r;

  // Give a helpful dump if we can't detect
  console.error("Unknown wrangler JSON shape for rows:\n", JSON.stringify(payload,null,2));
  return [];
}

function primaryObj(flag){ return flag ? { primary:true } : {}; }

async function queryRows(sql) {
  const payload = await runJSON(sql);
  return pickRows(payload);
}

async function main() {
  const states = await queryRows(
    `SELECT code, name, link, unavailable
       FROM states
      ORDER BY code;`
  );

  const boards = await queryRows(
    `SELECT state_code, board, url, primary_flag
       FROM boards
      WHERE active = 1
      ORDER BY state_code, primary_flag DESC, board;`
  );

  console.log(`D1 returned: states=${states.length}, boards=${boards.length}`);

  const by = new Map();
  for (const b of boards) {
    const arr = by.get(b.state_code) || [];
    arr.push({ board: b.board, url: b.url, ...primaryObj(Number(b.primary_flag) === 1) });
    by.set(b.state_code, arr);
  }

  const out = states.map(s => {
    const links = by.get(s.code);
    if (links?.length) return { code: s.code, name: s.name, links };
    // legacy fallback if no normalized links available
    if (s.link && /^https?:\/\//i.test(s.link) && !Number(s.unavailable)) {
      return { code: s.code, name: s.name, links: [{ board: "Official board site", url: s.link, primary: true }] };
    }
    return { code: s.code, name: s.name, links: [] };
  });

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Exported ${out.length} states -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });

