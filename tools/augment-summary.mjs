#!/usr/bin/env node
// tools/augment-summary.mjs
// Augments public/data/vaers-summary.json with:
// - deaths_by_year.all from a CSV (year,value)
// - deaths_days_to_onset.{covid|flu}.{exact_0_19,gte_20,unknown} from CSVs
//
// Usage:
// node tools/augment-summary.mjs \
//   --input public/data/vaers-summary.json \
//   --deaths-by-year data/deaths_by_year.csv \
//   --d2o-covid data/d2o_covid.csv \
//   --d2o-flu   data/d2o_flu.csv \
//   --out public/data/vaers-summary.json

import fs from "node:fs";
import path from "node:path";

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log("Wrote", p);
}

function parseCSVPairs(csv) {
  // CSV rows: label,value (comma allowed in value)
  const lines = csv.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*([^,]+)\s*,\s*("?)([\d,\.]+)\2\s*$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = Number(String(m[3]).replace(/[, ]/g, "")) || 0;
    out.push([label, value]);
  }
  return out;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || !v) continue;
    opt[k.replace(/^--/, "")] = v;
  }
  return opt;
}

function splitD2O(pairs) {
  // Accept raw pairs with labels like "0","1",...,"19","20+","Unknown"
  // Return exact_0_19 pairs and tail counts
  const exact = new Map(Array.from({ length: 20 }, (_, i) => [String(i), 0]));
  let gte20 = 0;
  let unknown = 0;

  for (const [label, v] of pairs) {
    const d = Number(String(label).trim());
    if (Number.isInteger(d) && d >= 0 && d <= 19) {
      exact.set(String(d), (exact.get(String(d)) || 0) + v);
    } else if (/unknown/i.test(String(label))) {
      unknown += v;
    } else {
      gte20 += v; // 20, 21, 20+, 19+, etc.
    }
  }
  return {
    exact_0_19: Array.from(exact.entries()),
    gte_20: gte20,
    unknown,
  };
}

function main() {
  const opt = parseArgs();
  const inPath = opt.input || "public/data/vaers-summary.json";
  const outPath = opt.out || inPath;

  const summary = readJSON(inPath);

  if (opt["deaths-by-year"]) {
    const csv = fs.readFileSync(opt["deaths-by-year"], "utf8");
    const pairs = parseCSVPairs(csv).filter(p => /^\d{4}$/.test(p[0]));
    if (!summary.deaths_by_year) summary.deaths_by_year = {};
    summary.deaths_by_year.all = pairs;
    console.log("Injected deaths_by_year.all:", pairs.length, "years");
  } else {
    console.warn("NOTE: --deaths-by-year not provided; deaths_by_year will be unchanged.");
  }

  // Days-to-onset (covid)
  if (opt["d2o-covid"]) {
    const csv = fs.readFileSync(opt["d2o-covid"], "utf8");
    const pairs = parseCSVPairs(csv);
    summary.deaths_days_to_onset = summary.deaths_days_to_onset || {};
    summary.deaths_days_to_onset.covid = splitD2O(pairs);
    console.log("Injected deaths_days_to_onset.covid (exact_0_19 + tail)");
  }

  // Days-to-onset (flu)
  if (opt["d2o-flu"]) {
    const csv = fs.readFileSync(opt["d2o-flu"], "utf8");
    const pairs = parseCSVPairs(csv);
    summary.deaths_days_to_onset = summary.deaths_days_to_onset || {};
    summary.deaths_days_to_onset.flu = splitD2O(pairs);
    console.log("Injected deaths_days_to_onset.flu (exact_0_19 + tail)");
  }

  writeJSON(outPath, summary);
}

main();
