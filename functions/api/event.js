// functions/api/event.js
// Minimal, privacy-safe event sink for 'open_board'.
// Stores daily aggregates in KV key: open_board:YYYY-MM-DD
// GET /api/event?date=YYYY-MM-DD -> returns aggregate for date (or today if missing)
// POST body: { type: 'open_board', stateCode, boardHost, date? }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = (url.searchParams.get('date') || new Date().toISOString().slice(0,10)).slice(0,10);
  const key = `open_board:${date}`;
  const json = await env.OPEN_BOARD_KV.get(key);
  const data = json ? JSON.parse(json) : { date, totals: 0, byState: {}, byHost: {} };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (!body || body.type !== 'open_board') {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_type' }), { status: 400 });
    }
    const date = (body.date || new Date().toISOString().slice(0,10)).slice(0,10);
    const state = (body.stateCode || '').toUpperCase().slice(0, 2);
    let host = '';
    try { host = new URL(`https://${body.boardHost}`).host; } catch { host = ''; }
    if (!state || !host) {
      // Accept but ignore malformed inputs
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    }

    const key = `open_board:${date}`;
    const existing = await env.OPEN_BOARD_KV.get(key);
    const agg = existing ? JSON.parse(existing) : { date, totals: 0, byState: {}, byHost: {} };

    // Update aggregates (best-effort; KV is not transactional, but fine for low volume)
    agg.totals = (agg.totals || 0) + 1;
    agg.byState[state] = (agg.byState[state] || 0) + 1;
    agg.byHost[host] = (agg.byHost[host] || 0) + 1;

    await env.OPEN_BOARD_KV.put(key, JSON.stringify(agg), { expirationTtl: 60 * 60 * 24 * 45 }); // keep ~45 days

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  } catch {
    // Non-fatal; never block the portal open flow
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
}
