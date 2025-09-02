// scripts/auto-approve-refs.mjs
// --- Hardened approver for About references ---
import fs from "node:fs/promises";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import readline from "node:readline";
import { URL } from "node:url";

const TRUSTED_HOSTS = new Set([
  "doi.org", "www.doi.org",
  "nejm.org", "www.nejm.org",
  "jamanetwork.com", "www.jamanetwork.com",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "www.aafp.org","www.acponline.org","www.fda.gov","www.supremecourt.gov",
  "oversight.house.gov", "correlation-canada.org", "www.acpjournals.org",
  "www.abms.org","www.cdc.gov","www.hhs.gov","www.federalregister.gov",
  "openvaers.com","archive.org","www.archive.org"
]);

const BLOCKLIST = /researchgate|scribd|facebook|x\.com|twitter\.com|medium\.com|blogspot|wordpress/i;
const MIN_SCORE = 0.80;

function isDOI(label) { return /\b10\.\d{4,9}\/\S+/i.test(label) || /^doi$/i.test(label) }
function looksPdf(url) { return /\.pdf($|\?)/i.test(url) }

function baseScore(row) {
  // row: { label_or_title, candidate_url, source, page_title }
  let s = 0;
  try {
    const u = new URL(row.candidate_url);
    if (BLOCKLIST.test(u.hostname + u.pathname)) return 0;
    if (TRUSTED_HOSTS.has(u.hostname)) s += 0.5;
    if (u.protocol === "https:") s += 0.05;
    if (isDOI(row.label_or_title) && (u.hostname === "doi.org" || /\/doi\//.test(u.pathname))) s += 0.35;
    if (looksPdf(u.pathname)) s += 0.10;
    // crude title similarity
    const want = row.label_or_title.toLowerCase().replace(/\W+/g," ").trim();
    const got  = (row.page_title||"").toLowerCase().replace(/\W+/g," ").trim();
    const overlap = want && got ? want.split(" ").filter(w => got.includes(w)).length : 0;
    const denom = Math.max(6, want.split(" ").length);
    s += Math.min(0.4, overlap/denom);
  } catch {}
  return Math.min(1, s);
}

async function main() {
  // read db/ref-candidates.csv → choose the best per label
  // ensure you only approve if score >= MIN_SCORE
  // and prefer doi.org for any DOI label
  // write back db/ref-candidates.csv with approved=1 on chosen row
  // then call your existing "apply-refs" logic or leave to workflow
}

main().catch(e=>{ console.error(e); process.exit(1); });
