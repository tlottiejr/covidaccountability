// Validate /public/assets/state-links.json offline
import fs from 'node:fs';
import path from 'node:path';
const file = path.resolve('public/assets/state-links.json');
const raw = fs.readFileSync(file, 'utf8');
const data = JSON.parse(raw);

let ok = true;
for (const s of data) {
  if (!/^[A-Z]{2}$/.test(s.code)) { console.error('Bad code:', s.code); ok = false; }
  if (!Array.isArray(s.links) || s.links.length === 0) { console.error('No links for', s.code); ok = false; }
  let primaryCount = 0;
  for (const l of s.links) {
    try {
      const u = new URL(l.url);
      if (u.protocol !== 'https:') throw new Error('not https');
    } catch {
      console.error('Bad URL for', s.code, l.url);
      ok = false;
    }
    if (l.primary === true) primaryCount++;
  }
  if (primaryCount !== 1) { console.error('Primary count != 1 for', s.code); ok = false; }
}
if (!ok) process.exit(1);
console.log('state-links.json OK');
