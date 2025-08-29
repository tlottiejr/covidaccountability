// scripts/apply-refs.mjs
import { existsSync, copyFileSync, writeFileSync } from "node:fs";
import { parseCsv, readText } from "./lib/csv.mjs";

const AUDIT = "db/ref-audit.csv";
const CAND = "db/ref-candidates.csv";
const HTML = "public/about.html";
const BACKUP = "public/about.html.bak";

function idx(rows) {
  if (!rows.length) return { header: [], data: [], i: {} };
  const [h, ...data] = rows;
  const i = Object.fromEntries(h.map((k, n) => [k.trim().toLowerCase(), n]));
  return { header: h, data, i };
}
function booly(v) { return /^(1|y|yes|true)$/i.test(String(v || "").trim()); }
function escReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function loadCsv(path) {
  if (!existsSync(path)) return { header: [], data: [], i: {} };
  const rows = parseCsv(readText(path));
  return idx(rows);
}

function chooseRefPicks(cand, audit) {
  const bad = new Set(
    audit.data.filter(r => Number(r[audit.i.ok] || 0) === 0)
              .map(r => r[audit.i.current_link])
  );

  const hasApproved = cand.header.some(h => /^approved$/i.test(h));

  // group by current_link
  const byLink = new Map();
  for (const r of cand.data) {
    const cur = r[cand.i.current_link];
    if (!cur || !bad.has(cur)) continue; // only broken ones
    if (!byLink.has(cur)) byLink.set(cur, []);
    byLink.get(cur).push(r);
  }

  const picks = [];
  for (const [cur, rows] of byLink) {
    let row;
    if (hasApproved) row = rows.find(r => booly(r[cand.i.approved]));
    if (!row) row = rows[0];
    if (!row) continue;
    picks.push({
      current: cur,
      next: row[cand.i.candidate_url],
      label: row[cand.i.label_or_title] || "",
      source: row[cand.i.source] || "",
      confidence: Number(row[cand.i.confidence] || 0)
    });
  }
  return picks;
}

async function main() {
  if (!existsSync(CAND) || !existsSync(AUDIT)) {
    console.error("ref-candidates.csv or ref-audit.csv missing.");
    process.exit(1);
  }
  if (!existsSync(HTML)) {
    console.error("public/about.html not found.");
    process.exit(1);
  }
  const cand = loadCsv(CAND);
  const audit = loadCsv(AUDIT);
  if (!cand.data.length) {
    console.log("No reference candidates to apply.");
    return;
  }

  const picks = chooseRefPicks(cand, audit);
  if (!picks.length) {
    console.log("No reference changes needed.");
    return;
  }

  const html = readText(HTML);
  let updated = html;
  let count = 0;

  for (const p of picks) {
    const re = new RegExp(`href="${escReg(p.current)}"`, "g");
    if (re.test(updated)) {
      updated = updated.replace(re, `href="${p.next}"`);
      count++;
    }
  }

  if (count === 0) {
    console.log("Found 0 matching hrefs to replace. Nothing changed.");
    return;
  }

  if (!existsSync(BACKUP)) copyFileSync(HTML, BACKUP);
  writeFileSync(HTML, updated, "utf8");

  console.log(`Rewrote ${count} href(s) in ${HTML}.`);
  console.log(`Backup saved at ${BACKUP}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
