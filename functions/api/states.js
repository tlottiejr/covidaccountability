export async function onRequest(context) {
  const { request, env } = context;

  // Try D1 first
  try {
    const sql = `
      SELECT
        code,
        name,
        COALESCE(link, '') AS link,
        COALESCE(unavailable, 0) AS unavailable
      FROM states
      ORDER BY name ASC
    `;
    const { results } = await env.DB.prepare(sql).all();

    if (Array.isArray(results) && results.length) {
      return new Response(JSON.stringify(results), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    // No rows found -> return 204 so client falls back to /assets/states.json
    return new Response(null, { status: 204 });
  } catch (err) {
    // D1 not ready / schema missing -> signal client to fallback
    return new Response(JSON.stringify({ error: "d1_error", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
