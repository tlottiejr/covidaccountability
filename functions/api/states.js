// functions/api/states.js
// GET /api/states  -> canonical state-links (static JSON, then D1 fallback, else 503)

import { ID_ALIAS, all } from "../_lib/db.js";

/** Small JSON response helper */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=3600",
      ...headers,
    },
  });
}

async function fetchStaticStateLinks(request) {
  // Pages will serve the static asset for this URL.
  const url = new URL("/assets/state-links.json", request.url).toString();
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  return data;
}

function coerceOnePrimaryPerState(items) {
  // items: [{ code, name, links:[{board,url,primary?}] }]
  return items.map((s) => {
    if (!Array.isArray(s.links) || s.links.length <= 1) return s;
    const primaries = s.links.filter((l) => l.primary);
    if (primaries.length <= 1) return s;
    // Coerce: keep the first primary, unset the rest
    let seen = false;
    const links = s.links.map((l) => {
      if (l.primary && !seen) {
        seen = true;
        return l;
      }
      return { ...l, primary: false };
    });
    return { ...s, links };
  });
}

async function d1FallbackCanonical(env) {
  // Build canonical shape from D1 active boards
  const rows = await all(
    env.DB,
    `
    SELECT s.code, s.name,
           ${ID_ALIAS},
           b.board, b.url, (b.primary_flag = 1) AS primary
    FROM states s
    JOIN boards b ON b.state_code = s.code AND b.active = 1
    ORDER BY s.code, (b.primary_flag = 1) DESC, b.board ASC
    `,
    [],
  );

  if (!rows || rows.length === 0) return [];

  // Group by state code/name
  /** @type {Record<string,{code:string,name:string,links:Array}>} */
  const map = {};
  for (const r of rows) {
    const code = r.code;
    if (!map[code]) map[code] = { code, name: r.name, links: [] };
    map[code].links.push({
      board: r.board,
      url: r.url,
      primary: !!r.primary,
    });
  }
  const result = Object.values(map);
  return coerceOnePrimaryPerState(result);
}

export async function onRequestGet({ request, env }) {
  try {
    // 1) Prefer static JSON (authoritative)
    const staticData = await fetchStaticStateLinks(request);
    if (Array.isArray(staticData) && staticData.length > 0) {
      return json(coerceOnePrimaryPerState(staticData));
    }

    // 2) Fallback to D1 (canonicalized)
    const canonical = await d1FallbackCanonical(env);
    if (canonical.length > 0) {
      // Mark as fallback in a header for observability
      return json(canonical, 200, { "x-source": "d1-fallback" });
    }

    // 3) No data
    return json({ ok: false, reason: "no-data" }, 503, { "cache-control": "no-store" });
  } catch (err) {
    console.error("[/api/states] error", err);
    return json({ ok: false, error: "internal-error" }, 500, { "cache-control": "no-store" });
  }
}
