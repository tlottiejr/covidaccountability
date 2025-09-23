// functions/api/states.js (REPLACEMENT)
// Canonical states endpoint: serves /assets/state-links.json (source of truth)
// Falls back to D1 `states` table (legacy flat shape). Adds JSON headers.

export async function onRequestGet({ request, env }) {
  // 1) Prefer the versioned static asset committed in the repo
  try {
    const url = new URL("/assets/state-links.json", request.url);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (res.ok) {
      const text = await res.text();
      return new Response(text, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
        }
      });
    }
  } catch {}

  // 2) Fallback to D1 legacy shape if available
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT
           code,
           COALESCE(name, '')       AS name,
           COALESCE(link, '')       AS link,
           COALESCE(unavailable, 0) AS unavailable
         FROM states
         ORDER BY name`
      ).all();

      return new Response(JSON.stringify(results), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch {}
  }

  // 3) Out of options
  return new Response(JSON.stringify({ error: "state data unavailable" }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
