// scripts/audit-state-links.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const FILE = path.resolve('public/assets/state-links.json');

function asArray(v) { return Array.isArray(v) ? v : []; }
function isPlaceholder(url) {
  if (!url) return true;
  const u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) return true;
  return /REPLACE-WITH/i.test(u);
}

async function check(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',           // some portals block HEAD
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const raw = await fs.readFile(FILE, 'utf8').catch(()=>'[]');
  const data = JSON.parse(raw || '[]');

  let failures = 0;
  for (const s of data) {
    const links = asArray(s.links);
    if (!links.length) {
      console.log(`WARN: ${s.code} ${s.name} has no links`);
      continue;
    }

    for (const l of links) {
      if (isPlaceholder(l.url)) {
        console.log(`SKIP: ${s.code} ${s.name} "${l.board || 'Official Complaint Link'}" placeholder/empty URL`);
        continue;
      }

      const r = await check(l.url);
      if (!r.ok) {
        console.log(`FAIL: ${s.code} ${s.name} "${l.board || 'Official Complaint Link'}" -> ${l.url} [${r.status}] ${r.error || ''}`.trim());
        failures++;
      } else {
        console.log(`OK  : ${s.code} ${s.name} "${l.board || 'Official Complaint Link'}" -> ${r.finalUrl} [${r.status}]`);
      }
      await sleep(250); // be polite
    }
  }

  if (failures > 0) {
    console.error(`\nAudit failed: ${failures} issue(s) found.`);
    process.exit(1);
  } else {
    console.log('\nAudit passed: all populated links reachable.');
  }
}

await main();
