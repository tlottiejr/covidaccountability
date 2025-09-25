// scripts/write-version-json.mjs
import fs from "node:fs";
import path from "node:path";

const commit = process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || "dev";
const builtAt = new Date().toISOString();

const outDir = path.resolve("public/assets");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "version.json"),
  JSON.stringify({ version: commit, builtAt }, null, 2) + "\n",
  "utf8"
);

console.log("Wrote public/assets/version.json", { commit, builtAt });
