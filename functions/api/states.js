export const onRequestGet = async ({ env, request }) => {
  // Try D1 first (if bound and table populated)
  try {
    if (env.DB) {
      const { results } = await env.DB
        .prepare('SELECT code, name, link, board FROM states ORDER BY name')
        .all();

      if (Array.isArray(results) && results.length) {
        // Group rows into { code, name, links: [{board,url,primary}] }
        const by = {};
        for (const r of results) {
          if (!by[r.code]) by[r.code] = { code: r.code, name: r.name, links: [] };
          by[r.code].links.push({
            board: r.board || 'Board',
            url: r.link,
            primary: by[r.code].links.length === 0
          });
        }
        const arr = Object.values(by);
        return new Response(JSON.stringify(arr), {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        });
      }
    }
  } catch {
    // Fall through to static JSON
  }

  // Fallback to shipped JSON
  try {
    const origin = new URL(request.url).origin;
    const url = new URL('/assets/state-links.json', origin).toString();
    const res = await fetch(url, { headers: { 'cache-control': 'no-store' } });
    if (!res.ok) throw new Error(`fallback status ${res.status}`);
    const j = await res.json();
    const arr = Array.isArray(j?.states) ? j.states : j;
    return new Response(JSON.stringify(arr), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
};
