// File: scripts/tools/normalize-states.mjs
// Use: node scripts/tools/normalize-states.mjs
// Requires scripts/lib/csv.mjs already in your repo (from earlier steps).

import { existsSync, writeFileSync } from "node:fs";
import { parseCsv, readText, writeCsv } from "../lib/csv.mjs";

const PATH = "db/states.csv";

function normalizeRow(r, idx) {
  const out = { code:"", name:"", link:"", unavailable:"0" };
  const i = idx;

  out.code = String(r[i.code] ?? "").trim().toUpperCase();
  out.name = String(r[i.name] ?? "").trim();
  out.link = String(r[i.link] ?? "").trim();
  const unav = String(r[i.unavailable] ?? "").trim();
  out.unavailable = /^(1|true|yes)$/i.test(unav) ? "1" : "0";

  return out;
}

function index(rows) {
  const [h, ...data] = rows;
  const i = Object.fromEntries(h.map((k, n) => [k.trim().toLowerCase(), n]));
  return { header: h, data, i };
}

if (!existsSync(PATH)) {
  console.error(`Missing ${PATH}. Run the clipboard script first.`);
  process.exit(1);
}

const rows = parseCsv(readText(PATH));
if (rows.length === 0) {
  console.error(`${PATH} is empty.`);
  process.exit(1);
}

const { header, data, i } = index(rows);
for (const need of ["code","name","link","unavailable"]) {
  if (!(need in i)) {
    console.error(`Missing column '${need}' in ${PATH}. Header was: ${header.join(",")}`);
    process.exit(1);
  }
}

const seen = new Set();
const out = [];

for (const r of data) {
  const n = normalizeRow(r, i);
  if (!n.code) continue;
  const key = n.code;
  if (seen.has(key)) continue; // drop dupes by code
  seen.add(key);
  out.push([n.code, n.name, n.link, n.unavailable]);
}

writeCsv(PATH, ["code","name","link","unavailable"], out);
writeFileSync(PATH, readText(PATH).replace(/\r?\n/g, "\r\n"), "utf8"); // ensure CRLF on Windows

console.log(`Normalized ${out.length} rows in ${PATH}`);
