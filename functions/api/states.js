export async function onRequestGet({ env }) {
  // D1 preferred
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(`
        SELECT code,
               COALESCE(name, '')    AS name,
               COALESCE(link, '')    AS link,
               COALESCE(unavailable, 0) AS unavailable,
               COALESCE(verified_at, NULL) AS verified_at
        FROM states
        ORDER BY code
      `).all();
      return new Response(JSON.stringify(results), {
        headers:{'content-type':'application/json; charset=utf-8'}
      });
    } catch (e) {
      // fall through to static
    }
  }
  // Static fallback (kept in /public/assets/states.json)
  const fallback = await fetch(new URL('../../public/assets/states.json', import.meta.url));
  return new Response(await fallback.text(), { headers:{'content-type':'application/json'} });
}
