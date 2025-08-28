// scripts/lib/csv.mjs
import { readFileSync, writeFileSync } from "node:fs";

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function writeText(path, text) {
  writeFileSync(path, text);
}

export function parseCsv(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\r") { /* ignore */ }
      else if (c === "\n") { pushField(); pushRow(); }
      else field += c;
    }
    i++;
  }
  // last field/row if file doesn't end with newline
  if (field || row.length) { pushField(); pushRow(); }
  return rows;
}

export function toCsvValue(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export function writeCsv(path, header, rows) {
  const out = [header.join(",")].concat(
    rows.map(r => r.map(toCsvValue).join(","))
  ).join("\n");
  writeText(path, out);
}
