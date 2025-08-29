// scripts/validate-refs.mjs
// Check external links in public/about.html and write db/ref-audit.csv

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ABOUT_PATH = "public/about.html";
const OUT_CSV = "db/ref-audit.csv";

function unique(arr) { return Array.from(new Set(arr)); }
function toCsv(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

function extractLinksFromHtml(html) {
  const re = /href\s*=\s*"(https?:\/\/[^"]+)"/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return unique(out);
}

// Correct, robust concurrency limiter
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const run = async (fn, resolve, reject) => {
    active++;
    try {
      const val = await fn();
      resolve(val);
    } catch (e) {
      reject(e);
    } finally {
      active--;
      if (queue.length) {
        const { fn, resolve, reject } = queue.shift();
        run(fn, resolve, reject);
      }
    }
  };
  return (fn) => new Promise((resolve, reject) => {
    if (active < concurrency) run(fn, resolve, reject);
    else queue.push({ fn, resolve, reject });
  });
}

function timeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function checkUrl(url) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    accept: "*/*",
  };

  // Try HEAD first
  const t1 = timeout(12000);
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: t1.signal });
    t1.clear();
    const ok = r.ok || (r.status >= 200 && r.status < 400) || [401, 403, 405].includes(r.status);
    if (ok) return { ok: !!r.ok, status: r.status, final: r.url || url, method: "HEAD" };
  } catch { /* fall through to GET */ } finally { t1.clear(); }

  // Fallback GET
  const t2 = timeout(15000);
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers, signal: t2.signal });
    t2.clear();
    const ok = r.ok || (r.status >= 200 && r.status < 400);
    return { ok, status: r.status, final: r.url || url, method: "GET" };
  } catch (err) {
    t2.clear();
    return { ok: false, status: -1, final: "", method: "GET", error: err?.message || "network error" };
  }
}

// --- main ---
const html = readFileSync(ABOUT_PATH, "utf8");
const links = extractLinksFromHtml(html).filter((u) => /^https?:\/\//i.test(u));

if (!links.length) {
  console.error(`No external links found in ${ABOUT_PATH}`);
  process.exit(1);
}

const limit = pLimit(6);
const results = await Promise.all(
  links.map((link) =>
    limit(async () => {
      const res = await checkUrl(link);
      return { link, ...res };
    })
  )
);

// Write CSV safely
mkdirSync("db", { recursive: true });
const header = "idx,status,ok,method,final_url,link";
const lines = results.map((r, i) => {
  const row = r || { status: -99, ok: false, method: "?", final: "", link: "" };
  return [i + 1, row.status, row.ok ? 1 : 0, row.method, toCsv(row.final || ""), toCsv(row.link || "")]
    .join(",");
});
writeFileSync(OUT_CSV, [header, ...lines].join("\n"));

const broken = results.filter((r) => !r?.ok);
console.log(`Checked ${results.length} links. Broken/failed: ${broken.length}.`);
if (broken.length) {
  console.log("Examples:");
  for (const b of broken.slice(0, 10)) {
    console.log(` - [${b.status}] ${b.link}`);
  }
}
console.log(`Report written: ${OUT_CSV}`);