#!/usr/bin/env node
/**
 * Validate and (optionally) normalize /assets/state-links.json
 * Usage:
 *   node scripts/validate-state-links.mjs               # validate only (exit 1 on error)
 *   node scripts/validate-state-links.mjs --fix         # normalize in-place and write file (exit 0)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Simple JSON Schema validator without deps (subset)
function validateAgainstSchema(doc) {
  const errors = [];
  if (!Array.isArray(doc) || doc.length === 0) {
    errors.push("Top-level must be a non-empty array.");
    return errors;
  }
  const urlRe = /^https?:\/\/[^/\s]+/i;
  const codeRe = /^[A-Z]{2}$/;
  doc.forEach((s, i) => {
    if (typeof s !== "object" || !s) errors.push(`Item[${i}]: must be object`);
    const { code, name, links } = s || {};
    if (!code || !codeRe.test(code)) errors.push(`Item[${i}]: invalid code (expected two uppercase letters)`);
    if (!name || typeof name !== "string" || name.length < 2) errors.push(`Item[${i}]: invalid name`);
    if (!Array.isArray(links) || links.length === 0) errors.push(`Item[${i}]: links must be non-empty array`);
    (links || []).forEach((l, j) => {
      if (!l || typeof l !== "object") errors.push(`Item[${i}].links[${j}]: must be object`);
      if (!l?.board || typeof l.board !== "string") errors.push(`Item[${i}].links[${j}]: missing board`);
      if (!l?.url || typeof l.url !== "string" || !urlRe.test(l.url)) errors.push(`Item[${i}].links[${j}]: invalid url`);
      ["primary", "unavailable"].forEach(k => {
        if (k in (l || {}) && typeof l[k] !== "boolean") errors.push(`Item[${i}].links[${j}].${k}: must be boolean`);
      });
    });
  });
  return errors;
}

function canonicalUrl(raw) {
  try {
    let u = new URL(String(raw).trim());
    // Normalize host casing, strip default ports, strip trailing slash on path
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
      u.port = "";
    }
    // keep protocol as-is; do NOT auto-upgrade http->https (no network checks here)
    // trim trailing slash unless it's just "/"
    if (u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.slice(0, -1);
    u.hash = ""; // strip fragments
    return u.toString();
  } catch {
    return String(raw || "").trim();
  }
}

function normalize(doc) {
  // Accept legacy shapes in input (code,name,url) but output canonical
  const states = [];
  const seenState = new Set();
  for (const s of (doc || [])) {
    if (!s) continue;
    const code = String(s.code || "").toUpperCase();
    const name = String(s.name || "").trim();
    if (!code || !name) continue;

    // gather links
    let links = Array.isArray(s.links) ? s.links : (s.url ? [{ board: "Primary", url: s.url, primary: true }] : []);
    const dedup = new Map(); // key = canonical url
    for (const l of links) {
      const board = (l?.board ? String(l.board) : "Primary").trim();
      const url = canonicalUrl(l?.url || "");
      if (!url) continue;
      const key = url.toLowerCase();
      if (dedup.has(key)) {
        // Merge booleans (true wins)
        const prev = dedup.get(key);
        dedup.set(key, {
          board: prev.board.length >= board.length ? prev.board : board, // pick longer label heuristically
          url,
          primary: Boolean(prev.primary || l?.primary),
          unavailable: Boolean(prev.unavailable || l?.unavailable)
        });
      } else {
        dedup.set(key, { board, url, primary: !!l?.primary, unavailable: !!l?.unavailable });
      }
    }

    const outLinks = [...dedup.values()];
    if (!outLinks.length) continue;

    // Sort links: primary first, then board name
    outLinks.sort((a, b) => (b.primary - a.primary) || a.board.localeCompare(b.board, "en"));

    const key = code;
    if (seenState.has(key)) {
      // Merge same-code states by appending links (rare, but keep deterministic)
      const idx = states.findIndex(x => x.code === code);
      const existing = states[idx];
      const urls = new Set(existing.links.map(x => x.url.toLowerCase()));
      for (const l of outLinks) if (!urls.has(l.url.toLowerCase())) existing.links.push(l);
      existing.links.sort((a, b) => (b.primary - a.primary) || a.board.localeCompare(b.board, "en"));
      states[idx] = existing;
    } else {
      states.push({ code, name, links: outLinks });
      seenState.add(key);
    }
  }

  // Sort states by code
  states.sort((a, b) => a.code.localeCompare(b.code, "en"));
  return states;
}

function loadJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function saveJson(file, data) {
  const pretty = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(file, pretty, "utf8");
}

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const ROOT = process.cwd();
const FILE = path.join(ROOT, "public/assets/state-links.json");
const SCHEMA = path.join(ROOT, "schema/state-links.schema.json");

try {
  const doc = loadJson(FILE);
  const normalized = normalize(doc);

  // Validate canonicalized doc
  const schema = loadJson(SCHEMA);
  const validationErrors = validateAgainstSchema(normalized);
  if (validationErrors.length) {
    console.error("Schema/shape errors:\n - " + validationErrors.join("\n - "));
    if (process.argv.includes("--fix")) {
      // still attempt to write the normalized doc for easier repair
      saveJson(FILE, normalized);
      console.error("\nWrote normalized output; re-run without --fix to verify.");
      process.exit(1);
    } else {
      process.exit(1);
    }
  }

  // Compare to disk to decide if changes are needed
  const before = fs.readFileSync(FILE, "utf8");
  const after = JSON.stringify(normalized, null, 2) + "\n";
  if (hash(before) !== hash(after)) {
    if (process.argv.includes("--fix")) {
      saveJson(FILE, normalized);
      console.log("Normalized public/assets/state-links.json");
      process.exit(0);
    } else {
      console.error("Normalization drift detected. Run with --fix or use the Normalize workflow.");
      process.exit(1);
    }
  } else {
    console.log("state-links.json is valid and normalized.");
    process.exit(0);
  }
} catch (e) {
  console.error("Validation failed:", e.message || e);
  process.exit(1);
}
