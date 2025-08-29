// scripts/auto-approve-states.mjs
// Marks approved=1 for "safe" wins in db/state-link-candidates.csv.
// Rules: .gov domain + (complaint|file) + (medical|medicine|board) in title/url.

import { readFileSync, writeFileSync } from "node:fs";

const IN  = "db/state-link-candidates.csv";
const OUT = "db/state-link-candidates.csv";

const has = (s, re) => re.test(String(s||"").toLowerCase());
const isGov = url => /\.gov(\/|$)/i.test(url || "");

const RE_COMPLAINT = /(complaint|file[-\s]?a[-\s]?complaint)/i;
const RE_BOARD     = /(medical|medicine|board)/i;

function parse(text) {
  const [hdr, ...rows] = text.trim().split(/\r?\n/);
  const headers = hdr.split(",").map(h => h.trim());
  const ix = Object.fromEntries(headers.map((h,i)=>[h,i]));
  const out = rows.map(line => {
    const cols = line.split(",");
    return {
      line, cols, headers, ix,
      code: cols[ix.code],
      url:  cols[ix.candidate_url],
      title: cols[ix.page_title] || ""
    };
  });
  return { headers, rows: out, ix };
}

function serialize(headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.join(","));
  return lines.join("\r\n");
}

const raw = readFileSync(IN, "utf8");
const { headers, rows, ix } = parse(raw);
if (!("approved" in ix)) { headers.push("approved"); rows.forEach(r=>r.cols.push("")); ix.approved = headers.length-1; }

const seen = new Set(); // one winner per code
for (const r of rows) {
  const code = (r.code || "").replace(/"/g,"");
  if (seen.has(code)) continue;
  const url = (r.url || "").replace(/"/g,"");
  const title = (r.title || "").replace(/"/g,"");

  if (isGov(url) && (has(url,RE_COMPLAINT)||has(title,RE_COMPLAINT)) && (has(url,RE_BOARD)||has(title,RE_BOARD))) {
    r.cols[ix.approved] = "1";
    seen.add(code);
  }
}

const out = serialize(headers, rows.map(r=>r.cols));
writeFileSync(OUT, out, "utf8");
console.log("✓ Auto-approvals done. Review db/state-link-candidates.csv and run: npm run apply:states");
