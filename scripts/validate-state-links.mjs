#!/usr/bin/env node
/**
 * Validates public/assets/state-links.json shape
 * Minimal validation to catch obvious issues without adding dependencies.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "public", "assets", "state-links.json");

function isHttpUrl(s) { return /^https?:\/\//i.test(s); }

async function main() {
  const data = JSON.parse(await fs.readFile(JSON_PATH, "utf8"));

  if (!Array.isArray(data)) throw new Error("Top-level must be an array.");

  for (const s of data) {
    if (typeof s.code !== "string" || s.code.length !== 2) throw new Error("Invalid state code.");
    if (typeof s.name !== "string" || !s.name) throw new Error(`Invalid state name for ${s.code}.`);
    if (!Array.isArray(s.links)) throw new Error(`links must be array for ${s.code}.`);
    for (const l of s.links) {
      if (typeof l.board !== "string" || !l.board) throw new Error(`Invalid board in ${s.code}.`);
      if (typeof l.url !== "string" || !isHttpUrl(l.url)) throw new Error(`Invalid url in ${s.code}.`);
      if ("primary" in l && typeof l.primary !== "boolean") throw new Error(`primary must be boolean in ${s.code}.`);
    }
  }

  console.log("state-links.json is valid.");
}

main().catch(e => { console.error(e); process.exit(1); });
