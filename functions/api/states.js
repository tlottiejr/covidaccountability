// functions/api/states.js
export async function onRequestGet({ request, env }) {
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
    } catch {
      // fall through to static
    }
  }

  const url = new URL("/assets/states.json", request.url);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  return new Response(await res.text(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
