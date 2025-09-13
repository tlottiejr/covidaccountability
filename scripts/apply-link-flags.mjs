// scripts/apply-link-flags.mjs
// Marks failing links as { unavailable: true } based on reports/link-health.json
// Usage:
//   node scripts/apply-link-flags.mjs           # dry run (prints changes only)
//   APPLY=1 node scripts/apply-link-flags.mjs   # writes changes
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.resolve(ROOT, 'public/assets/state-links.json');
const REPORT_JSON = path.resolve(ROOT, 'reports/link-health.json');
const APPLY = process.env.APPLY === '1';

function nowIso() { return new Date().toISOString(); }

function keyFor(r) { return `${r.stateCode}::${r.url}`; }

async function loadJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function main() {
  const report = await loadJson(REPORT_JSON);
  const states = await loadJson(JSON_PATH);

  const failing = new Map();
  for (const r of report.results) {
    if (!['ok', 'redirect'].includes(r.status)) failing.set(keyFor(r), r);
  }

  let changes = 0;
  for (const s of states) {
    for (const l of s.links || []) {
      if (!l.url) continue;
      const k = keyFor({ stateCode: s.code, url: l.url });
      if (failing.has(k) && !l.unavailable) {
        l.unavailable = true;
        changes++;
      }
    }
  }

  if (!changes) {
    console.log('No changes to apply.');
    return;
  }

  if (!APPLY) {
    console.log(`[DRY RUN] Would set unavailable: true on ${changes} link(s). Set APPLY=1 to write.`);
    return;
  }

  const backup = `${JSON_PATH}.${nowIso().replace(/[:.]/g, '-')}.bak.json`;
  await fs.cp(JSON_PATH, backup);
  await fs.writeFile(JSON_PATH, JSON.stringify(states, null, 2), 'utf8');
  console.log(`Applied ${changes} change(s). Backup saved to ${backup}`);
}

main().catch(e => { console.error(e); process.exit(1); });
