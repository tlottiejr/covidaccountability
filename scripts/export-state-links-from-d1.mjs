#!/usr/bin/env node
/**
 * Export from D1 -> public/assets/state-links.json
 * - Primary: boards table
 * - Fallback: legacy states.link/unavailable
 * Output shape: [{ code, name, links:[{ board, url, primary? }] }]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "assets", "state-links.json");

async function q(sql) {
  const { stdout } = await pexec("npx",
    ["wrangler","d1","execute","medportal_db","--remote","--json","--command",sql],
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
  const states = await q(`SELECT code, name, link, unavailable FROM states ORDER BY code;`);
  const boards  = await q(`SELECT state_code, board, url, primary_flag FROM boards WHERE active=1 ORDER BY state_code, primary_flag DESC, board;`);

  console.log(`D1 returned: states=${states.length}, boards=${boards.length}`);

  const grouped = new Map();
  for (const b of boards) {
    const arr = grouped.get(b.state_code) || [];
    arr.push({ board: b.board, url: b.url, ...primaryObj(Number(b.primary_flag) === 1) });
    grouped.set(b.state_code, arr);
  }

  const out = states.map(s => {
    const links = grouped.get(s.code);
    if (links && links.length) {
      return { code: s.code, name: s.name, links };
    }
    // legacy fallback
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
