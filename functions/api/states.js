// /functions/api/states.js
// Serves canonical state->board links.
// Strategy: static-first (/assets/state-links.json) with strong cache; fallback to D1 canonicalization.
// Response headers include: x-source: static|d1-fallback

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function coerceOnePrimaryPerState(states) {
  // If multiple primaries exist, keep the first and flip the rest to false.
  for (const s of states) {
    let seen = false;
    for (const link of s.links) {
      if (link.primary === true) {
        if (seen) link.primary = false;
        seen = true;
      }
    }
    // If none marked, make the first one primary (defensive)
    if (!seen && s.links.length > 0) s.links[0].primary = true;
  }
  return states;
}

async function fromStatic(origin) {
  const res = await fetch(`${origin}/assets/state-links.json`, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 600, cacheEverything: true },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data)) return null;
  return coerceOnePrimaryPerState(data);
}

async function fromD1(env) {
  const DB = env.DB || env.D1 || env.db;
  if (!DB) return null;
  const rows = (await DB.prepare(`
    SELECT s.code as code, s.name as name, b.board as board, b.url as url, b.primary as primary
    FROM boards b
    JOIN states s ON s.code = b.state_code
    ORDER BY s.code ASC, b.primary DESC, b.board ASC
  `).all()).results || [];
  const byState = new Map();
  for (const r of rows) {
    if (!byState.has(r.code)) byState.set(r.code, { code: r.code, name: r.name, links: [] });
    byState.get(r.code).links.push({ board: r.board, url: r.url, primary: !!r.primary });
  }
  return coerceOnePrimaryPerState(Array.from(byState.values()));
}

export const onRequestGet = async ({ request, env }) => {
  const origin = new URL(request.url).origin;

  // Static-first
  const staticData = await fromStatic(origin);
  if (staticData) {
    return json(staticData, 200, {
      "x-source": "static",
      "cache-control": "public, max-age=300, s-maxage=300",
    });
  }

  // Fallback to D1
  const d1Data = await fromD1(env);
  if (d1Data && d1Data.length) {
    return json(d1Data, 200, { "x-source": "d1-fallback", "cache-control": "no-store" });
  }

  return json({ ok: false, reason: "no-data" }, 503, { "cache-control": "no-store" });
};
