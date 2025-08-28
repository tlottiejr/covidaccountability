export async function onRequestGet({ env }) {
  try {
    // Prefer D1
    if (env.DB) {
      const { results } = await env.DB.prepare(
        `SELECT code, name, link, unavailable
         FROM states
         ORDER BY code ASC`
      ).all();

      // normalize types
      const rows = (results || []).map(r => ({
        code: String(r.code || '').toUpperCase(),
        name: r.name || r.code || 'Unknown',
        link: r.link || '',
        unavailable: !!r.unavailable
      }));

      return new Response(JSON.stringify(rows), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
  } catch (e) {
    // fall through to JSON fallback
    console.error('D1 /api/states error:', e);
  }

  // Fallback to the static file so the UI still works
  return new Response(
    await (await fetch(new URL('../public/assets/states.json', import.meta.url))).text(),
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}


