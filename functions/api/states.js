// functions/api/states.js
export async function onRequestGet({ env }) {
  try {
    if (env.DB) {
      const { results } = await env.DB
        .prepare(`SELECT code, name, link, unavailable FROM states ORDER BY name;`)
        .all();

      return json(results.map(r => ({
        code: r.code,
        name: r.name,
        link: r.link || "",
        unavailable: !!r.unavailable
      })));
    }
  } catch (e) {
    console.error("D1 query failed:", e);
  }

  // Fallbacks if DB missing or errors (optional to keep)
  return json([
    { code: "AL", name: "Alabama", link: "", unavailable: false },
    { code: "AK", name: "Alaska",  link: "", unavailable: false }
  ]);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
