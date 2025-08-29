// scripts/audit-states.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const CSV_IN  = "db/states.csv";
const CSV_OUT = "db/state-link-audit.csv";
const TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

const strip = s => {
  if (s == null) return "";
  s = String(s).trim();
  // remove surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
};

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map(h => strip(h).toLowerCase());
  return lines.map(l => {
    const cols = l.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = strip(cols[i] ?? ""));
    return obj;
  });
}
function toCsv(rows) {
  const headers = ["code","name","status","current_link","final_url","notes"];
  return [headers.join(",")].concat(rows.map(r => 
    headers.map(h => String(r[h] ?? "").replaceAll("\n"," ").replaceAll(","," ")).join(",")
  )).join("\r\n");
}

async function httpCheck(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect:"follow", signal: ctrl.signal });
    const finalUrl = res.url || url;
    if (res.status >= 200 && res.status < 400) return { status:"ok", finalUrl, note:String(res.status) };
    return { status:"broken", finalUrl, note:String(res.status) };
  } catch (e) {
    return { status:"broken", finalUrl:"", note: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(t); }
}

async function main() {
  let csv;
  try { csv = readFileSync(CSV_IN, "utf8"); }
  catch { console.error(`Missing ${CSV_IN}. Run: node scripts/export-states.mjs`); process.exit(1); }

  const rows = parseCsv(csv);
  if (!rows.length) { console.error(`${CSV_IN} has 0 rows`); process.exit(1); }

  const queue = [...rows];
  const out = [];
  const workers = Math.min(CONCURRENCY, rows.length);

  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      const code = strip(r.code).toUpperCase();
      const name = strip(r.name);
      const url  = strip(r.link);

      if (!url) {
        out.push({ code,name,status:"missing", current_link:"", final_url:"", notes:"" });
        continue;
      }
      const { status, finalUrl, note } = await httpCheck(url);
      out.push({ code,name,status, current_link:url, final_url:finalUrl, notes:note });
    }
  }

  await Promise.all(Array.from({length:workers}, worker));

  mkdirSync("db", { recursive:true });
  writeFileSync(CSV_OUT, toCsv(out), "utf8");

  const ok = out.filter(x=>x.status==="ok").length;
  const missing = out.filter(x=>x.status==="missing").length;
  const broken = out.filter(x=>x.status==="broken").length;
  console.log(`Audited ${out.length} states → ${CSV_OUT}`);
  console.log(`ok=${ok}, missing=${missing}, broken=${broken}`);
}

main().catch(e => { console.error(e); process.exit(1); });
