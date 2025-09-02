// Auto-approve candidate reference links, then rewrite About.
// Heuristics: whitelisted domains, DOI labels -> doi.org, title token match, min score.

import fs from "node:fs";
import path from "node:path";

// tiny CSV helper
const readCSV = (p) =>
  fs.readFileSync(p, "utf8").trim().split(/\r?\n/).map((l, i) =>
    i ? Object.fromEntries(l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v, j) => [j, v.replace(/^"|"$/g, "")])) : l.split(",")
  );
const parseCSV = (text) => {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(h => h.trim());
  return rows.map(r => {
    const vals = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.replace(/^"|"$/g, ""));
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
};
const writeCSV = (p, rows) => {
  if (!rows.length) return fs.writeFileSync(p, "");
  const cols = Object.keys(rows[0]);
  const esc = (s="") => `"${String(s).replace(/"/g,'""')}"`;
  const text = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  fs.writeFileSync(p, text);
};

// Config
const CANDIDATES = "db/ref-candidates.csv";        // produced by discover:refs
const AUDIT      = "db/ref-audit.csv";             // produced by audit:refs
const ABOUT_HTML = "public/about.html";            // target to rewrite (apply-refs.mjs handles it)
const APPLY      = "scripts/apply-refs.mjs";       // existing script in repo

const OK_DOMAINS = [
  "doi.org","nejm.org","jamanetwork.com","pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov","usgs.gov","supremecourt.gov","fda.gov",
  "hhs.gov","whitehouse.gov","cdc.gov","archive.org","aaas.org","ama-assn.org",
  "acponline.org","aafp.org","abms.org","texasattorneygeneral.gov","federalregister.gov"
];

function scoreCandidate(label, url, title) {
  let score = 0;

  // 1) Domain trust
  try {
    const d = new URL(url).hostname.replace(/^www\./, "");
    if (OK_DOMAINS.some(allow => d.endsWith(allow))) score += 60;
  } catch { /* ignore */ }

  // 2) DOI rules
  const isDoiLabel = /^10\./.test(label) || label.toLowerCase().startsWith("doi");
  if (isDoiLabel) {
    if (/doi\.org\//.test(url)) score += 50;
    else score -= 40; // DOI labels should resolve at doi.org
  }

  // 3) Title token overlap (loose match)
  const toks = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(x=>x.length>3);
  const L = new Set(toks(label));
  const T = new Set(toks(title || ""));
  const overlap = [...L].filter(x => T.has(x)).length;
  score += Math.min(40, overlap * 6); // up to +40

  return score;
}

function approve() {
  if (!fs.existsSync(CANDIDATES)) {
    console.error(`Missing ${CANDIDATES}. Run discovery first.`);
    process.exit(1);
  }
  const rows = parseCSV(fs.readFileSync(CANDIDATES, "utf8"));
  const updated = rows.map(r => {
    const s = scoreCandidate(r.label_or_title || "", r.candidate_url || "", r.page_title || "");
    r.score = String(s);
    r.approved = s >= 80 ? "yes" : ""; // threshold
    return r;
  });

  writeCSV(CANDIDATES, updated);
  console.log(`[auto-approve] Marked ${updated.filter(r=>r.approved==="yes").length} candidates as approved.`);
}

function ensureApply() {
  if (!fs.existsSync(APPLY)) {
    console.error(`Missing ${APPLY}. Make sure apply-refs.mjs exists.`);
    process.exit(1);
  }
}

function main() {
  approve();
  ensureApply();
  // run the rewrite (apply-refs), which reads approved rows in db/ref-candidates.csv
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync("node", [APPLY], { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status);
  console.log(`[auto-approve] Completed. Review ${ABOUT_HTML} and ${AUDIT}.`);
}
main().catch(e => { console.error(e); process.exit(1); });
