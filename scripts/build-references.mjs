// scripts/build-references.mjs
// Build artifacts for the References page from existing repo data.
// - board-index.json  : flattened boards from public/assets/state-links.json
// - board-index.html  : grouped <ul> HTML by state (drop-in embed if you want)
// - references.json   : curated references from data/references.sources.json
//
// Usage: node scripts/build-references.mjs
// Node >= 18. No external deps.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_LINKS = path.join(ROOT, 'public/assets/state-links.json');
const SOURCES_JSON = path.join(ROOT, 'data/references.sources.json');

const OUT_DIR = path.join(ROOT, 'public/assets');
const OUT_BOARD_JSON = path.join(OUT_DIR, 'board-index.json');
const OUT_BOARD_HTML = path.join(OUT_DIR, 'board-index.html');
const OUT_REFS_JSON  = path.join(OUT_DIR, 'references.json');

const now = () => new Date().toISOString();

function stripBom(s) { return s.replace(/^\uFEFF/, ''); }

function toHost(u) {
  try { return new URL(u).hostname; } catch { return ''; }
}

async function loadJsonSafe(p, fallback) {
  try { return JSON.parse(stripBom(await fs.readFile(p, 'utf8'))); }
  catch { return fallback; }
}

function buildBoardIndex(states) {
  const rows = [];
  for (const s of states) {
    for (const l of (s.links || [])) {
      if (!l?.url) continue;
      rows.push({
        code: s.code,
        state: s.name,
        board: l.board || 'Official Complaint Link',
        url: l.url,
        host: toHost(l.url),
        primary: !!l.primary,
        unavailable: !!l.unavailable
      });
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code) || Number(b.primary) - Number(a.primary) || a.board.localeCompare(b.board));
  return rows;
}

function buildBoardHtml(states) {
  const lines = [];
  lines.push(`<!-- generated ${now()} ; do not edit by hand -->`);
  lines.push(`<div class="board-index">`);
  for (const s of states.sort((a,b) => a.code.localeCompare(b.code))) {
    lines.push(`<h3 id="state-${s.code}">${s.name}</h3>`);
    if (!s.links || !s.links.length) {
      lines.push(`<p><em>No links available.</em></p>`);
      continue;
    }
    lines.push(`<ul>`);
    for (const l of s.links) {
      const label = l.board || 'Official Complaint Link';
      const url = l.url || '#';
      const host = toHost(url);
      const flags = [];
      if (l.primary) flags.push('primary');
      if (l.unavailable) flags.push('temporarily unavailable');
      const flagText = flags.length ? ` <small>(${flags.join(', ')})</small>` : '';
      lines.push(`<li><a href="${url}" rel="noopener">${label}</a> <span class="small">— ${host}</span>${flagText}</li>`);
    }
    lines.push(`</ul>`);
  }
  lines.push(`</div>`);
  return lines.join('\n');
}

async function main() {
  const states = await loadJsonSafe(STATE_LINKS, []);
  if (!Array.isArray(states) || !states.length) {
    throw new Error('Could not read public/assets/state-links.json or it is empty.');
  }

  // 1) Board index (flattened JSON)
  const boardIndex = buildBoardIndex(states);

  // 2) Board index HTML snippet (grouped by state)
  const boardHtml = buildBoardHtml(states);

  // 3) Curated references (optional)
  const src = await loadJsonSafe(SOURCES_JSON, { generatedAt: now(), categories: [] });
  const references = {
    generatedAt: now(),
    categories: Array.isArray(src.categories) ? src.categories : []
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_BOARD_JSON, JSON.stringify({ generatedAt: now(), rows: boardIndex }, null, 2), 'utf8');
  await fs.writeFile(OUT_BOARD_HTML, boardHtml, 'utf8');
  await fs.writeFile(OUT_REFS_JSON, JSON.stringify(references, null, 2), 'utf8');

  console.log('Built:');
  console.log(' -', path.relative(ROOT, OUT_BOARD_JSON));
  console.log(' -', path.relative(ROOT, OUT_BOARD_HTML));
  console.log(' -', path.relative(ROOT, OUT_REFS_JSON));
}

main().catch(err => { console.error(err); process.exit(1); });
