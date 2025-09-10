// scripts/audit-state-links.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const FILE = path.resolve('public/assets/state-links.json');

function asArray(v) { return Array.isArray(v) ? v : []; }

async function check(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    // Use GET (some portals block HEAD)
    const res = await fetch(url, {
      method: 'GET',
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
      if (!l.url || !/^https?:\/\//i.test(l.url)) {
        console.log(`FAIL: ${s.code} ${s.name} "${l.board}" missing/invalid URL`);
        failures++;
        continue;
      }
      const r = await check(l.url);
      if (!r.ok) {
        console.log(`FAIL: ${s.code} ${s.name} "${l.board}" -> ${l.url} [${r.status}] ${r.error || ''}`.trim());
        failures++;
      } else {
        console.log(`OK  : ${s.code} ${s.name} "${l.board}" -> ${r.finalUrl} [${r.status}]`);
      }
      // Be polite to servers
      await sleep(250);
    }
  }

  if (failures > 0) {
    console.error(`\nAudit failed: ${failures} issue(s) found.`);
    process.exit(1);
  } else {
    console.log('\nAudit passed: all links reachable.');
  }
}

await main();
