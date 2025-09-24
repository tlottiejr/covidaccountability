// scripts/vaers-compute-deaths-by-year.mjs
// Computes deaths_by_year from official VAERS CSV directories and merges it
// into public/data/vaers-summary.json without touching other fields.
//
// Required env vars (same as your main builder):
//   VAERS_DATA_DIR   -> path to _vaers/domestic
//   VAERS_NONDOM_DIR -> path to _vaers/non_domestic
//
// Usage (from repo root, after you've run your existing builder):
//   $env:VAERS_DATA_DIR=_vaers\domestic
//   $env:VAERS_NONDOM_DIR=_vaers\non_domestic
//   node scripts/vaers-compute-deaths-by-year.mjs

import fs from "fs";
import path from "path";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// --- tiny CSV parser (handles quotes/double-quotes) ---
function parseCSVLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCSVHeader(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const [head] = text.split(/\r?\n/, 1);
  if (!head) return null;
  return parseCSVLine(head).map(h => (h || "").trim().toUpperCase());
}

function eachCSVRow(filePath, fn) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return;
  const headers = parseCSVLine(lines[0]).map(h => (h || "").trim().toUpperCase());
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const cols = parseCSVLine(l);
    fn(headers, cols);
  }
}

// --- compute deaths_by_year ---
function computeDeathsByYearFromDirs(domesticDir, nonDomesticDir) {
  /** @type {Map<string, number>} deathYearById */
  const deathYearById = new Map();

  const ingestDATA = (dir) => {
    if (!dir || !fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => /DATA\.csv$/i.test(f));
    for (const f of files) {
      const p = path.join(dir, f);
      eachCSVRow(p, (headers, cols) => {
        const IDX = {
          VAERS_ID: headers.indexOf("VAERS_ID"),
          RECVDATE: headers.indexOf("RECVDATE"),
          DIED: headers.indexOf("DIED"),
        };
        const died = (cols[IDX.DIED] || "").trim().toUpperCase();
        if (died !== "Y") return;
        const id = (cols[IDX.VAERS_ID] || "").trim();
        if (!id) return;
        const recv = (cols[IDX.RECVDATE] || "").trim(); // e.g., 01/02/2021
        const y = recv && /\d{4}$/.test(recv) ? Number(recv.slice(-4)) : NaN;
        if (!Number.isFinite(y)) return;
        if (!deathYearById.has(id)) deathYearById.set(id, y);
      });
    }
  };

  /** @type {Set<string>} covidDeathIds */
  const covidDeathIds = new Set();

  const ingestVAX = (dir) => {
    if (!dir || !fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => /VAX\.csv$/i.test(f));
    for (const f of files) {
      const p = path.join(dir, f);
      eachCSVRow(p, (headers, cols) => {
        const IDX = {
          VAERS_ID: headers.indexOf("VAERS_ID"),
          VAX_TYPE: headers.indexOf("VAX_TYPE"),
        };
        const id = (cols[IDX.VAERS_ID] || "").trim();
        if (!id || !deathYearById.has(id)) return; // only care about death IDs
        const vtype = (cols[IDX.VAX_TYPE] || "").trim().toUpperCase();
        if (vtype === "COVID19") covidDeathIds.add(id);
      });
    }
  };

  ingestDATA(domesticDir);
  ingestDATA(nonDomesticDir);
  ingestVAX(domesticDir);
  ingestVAX(nonDomesticDir);

  /** @type {Map<number, {all:number, covid:number}>} */
  const agg = new Map();
  for (const [id, y] of deathYearById.entries()) {
    if (!agg.has(y)) agg.set(y, { all: 0, covid: 0 });
    const row = agg.get(y);
    row.all += 1;
    if (covidDeathIds.has(id)) row.covid += 1;
  }

  const out = Array.from(agg.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, all: v.all, non_covid: v.all - v.covid }));

  return out;
}

// --- main ---
const domesticDir = process.env.VAERS_DATA_DIR || "";
const nonDomDir   = process.env.VAERS_NONDOM_DIR || "";
if (!domesticDir || !nonDomDir) {
  die("Set VAERS_DATA_DIR and VAERS_NONDOM_DIR env vars to point at the extracted CSV folders.");
}

const deathsByYear = computeDeathsByYearFromDirs(domesticDir, nonDomDir);

// merge into public/data/vaers-summary.json
const jsonPath = path.join("public", "data", "vaers-summary.json");
if (!fs.existsSync(jsonPath)) die(`Cannot find ${jsonPath}. Run your main builder first.`);
let summary;
try {
  summary = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
} catch (e) {
  die(`Failed to parse ${jsonPath}: ${e.message}`);
}

summary.deaths_by_year = deathsByYear;

// keep existing as_of if present; otherwise stamp today (optional)
if (!summary.as_of) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  summary.as_of = `${yyyy}-${mm}-${dd}`;
}

fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
console.log(`Injected deaths_by_year (${deathsByYear.length} years) into ${jsonPath}`);
