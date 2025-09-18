#!/usr/bin/env node
/**
 * Export from D1 -> public/assets/state-links.json
 * Primary source: boards; Fallback: legacy states.link/unavailable
 * Pins to the DB by UUID to avoid name/account mismatches.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const OUT  = path.join(ROOT, "public", "assets", "state-links.json");

const DB_NAME = "medportal_db";
const DB_ID   = process.env.D1_DATABASE_ID || "84a3b4f0-70fe-4d09-8006-c35576e4e109"; // <— YOUR UUID

async function query(sql) {
  const { stdout } = await pexec("npx",
    ["wrangler","d1","execute", DB_NAME, "--database-id", DB_ID, "--remote","--json","--command", sql],
    { shell:false, env:process.env, maxBuffer: 10*1024*1024 }
  );
  const payload = JSON.parse(stdout);
  if (!payload || payload.success === false) throw new Error(stdout);
  if (Array.isArray(payload.result)) return payload.result;
  if (payload.result && Array.isArray(payload.result.results)) return payload.result.results;
  return [];
}

function primaryObj(flag){ return flag ? { primary:true } : {}; }

async function main() {
  const states = await query(`SELECT code,name,link,unavailable FROM states ORDER BY code;`);
  const boards  = await query(`SELECT state_code,board,url,primary_flag FROM boards WHERE active=1 ORDER BY state_code,primary_flag DESC,board;`);

  console.log(`D1 returned: states=${states.length}, boards=${boards.length}`);

  const by = new Map();
  for (const b of boards) {
    const arr = by.get(b.state_code) || [];
    arr.push({ board:b.board, url:b.url, ...primaryObj(Number(b.primary_flag)===1) });
    by.set(b.state_code, arr);
  }

  const out = states.map(s => {
    const links = by.get(s.code);
    if (links?.length) return { code:s.code, name:s.name, links };
    if (s.link && /^https?:\/\//i.test(s.link) && !Number(s.unavailable)) {
      return { code:s.code, name:s.name, links:[{ board:"Official board site", url:s.link, primary:true }] };
    }
    return { code:s.code, name:s.name, links:[] };
  });

  await fs.mkdir(path.dirname(OUT), { recursive:true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Exported ${out.length} states -> ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
