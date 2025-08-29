// scripts/export-states.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const SQL = `
SELECT code, name, link, unavailable
FROM states
ORDER BY name;
`.trim();

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] });
  } catch (e) {
    if (e.code === "ENOENT") return null; // not found
    console.error(e.stdout || e.message);
    process.exit(1);
  }
}

function runWrangler(args) {
  // 1) try wrangler
  let out = run("wrangler", args);
  if (out !== null) return out;
  // 2) fallback to npx wrangler
  out = run("npx", ["wrangler", ...args]);
  if (out !== null) return out;

  console.error("Could not find `wrangler` (tried wrangler and npx wrangler). Install with: npm i -g wrangler");
  process.exit(1);
}

console.log("→ Querying D1 (medportal_db) via wrangler…");
const raw = runWrangler(["d1","execute","medportal_db","--command",SQL,"--json"]);

let rows = [];
try {
  const payload = JSON.parse(raw);
  // wrangler may return { result:{ results:[...] } } or [ { result:{ results:[...] } } ]
  if (payload?.result?.results) rows = payload.result.results;
  else if (Array.isArray(payload) && payload[0]?.result?.results) rows = payload[0].result.results;
  else throw new Error("Unexpected wrangler JSON shape");
} catch (e) {
  console.error("Failed to parse wrangler JSON:", e.message);
  process.exit(1);
}

const headers = ["code","name","link","unavailable"];
const lines = [headers.join(",")].concat(rows.map(r => {
  const code = String(r.code ?? "").trim().toUpperCase();
  const name = String(r.name ?? "").replaceAll(",", " ").trim();
  const link = String(r.link ?? "").trim();
  const unav = String(r.unavailable ?? "0").trim() === "1" ? "1" : "0";
  return [code,name,link,unav].join(",");
}));

mkdirSync("db", { recursive: true });
writeFileSync("db/states.csv", lines.join("\r\n"), "utf8");
console.log(`✓ Wrote ${rows.length} rows → db/states.csv`);
