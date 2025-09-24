// functions/api/event.js
// GET /api/event?date=YYYY-MM-DD  -> return aggregate
// POST /api/event { type:'open_board', state:'XX', url:'https://..', host:'...' } -> aggregate counters in KV

/** Small JSON response helper */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function todayISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isStateCode(v) {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v);
}

function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function readJson(request) {
  const text = await request.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

const EMPTY_AGG = () => ({ totals: 0, byState: {}, byHost: {} });

export async function onRequestGet({ request, env }) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayISO();
    const key = `open_board:${date}`;

    const val = await env.OPEN_BOARD_KV.get(key, "json");
    const agg = val && typeof val === "object" ? val : EMPTY_AGG();

    return json({ date, ...agg });
  } catch (err) {
    console.error("[/api/event GET] error", err);
    return json({ ok: false, error: "internal-error" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const { type, state, url, host } = body || {};

    if (type !== "open_board" || !isStateCode(state) || !isHttpUrl(url) || typeof host !== "string" || !host) {
      return json({ ok: false, error: "bad-request" }, 400);
    }

    const date = todayISO();
    const key = `open_board:${date}`;
    // 2-try optimistic merge (simple since KV lacks atomic ops)
    let tries = 0;
    // In case of parallel writes, last write wins but we retry merge once
    // (acceptable for coarse analytics)
    do {
      tries++;
      const current = (await env.OPEN_BOARD_KV.get(key, "json")) || EMPTY_AGG();
      current.totals = (current.totals || 0) + 1;
      current.byState = current.byState || {};
      current.byHost = current.byHost || {};
      current.byState[state] = (current.byState[state] || 0) + 1;
      current.byHost[host] = (current.byHost[host] || 0) + 1;

      try {
        await env.OPEN_BOARD_KV.put(key, JSON.stringify(current), {
          expirationTtl: 45 * 24 * 60 * 60, // 45 days
        });
        return json({ ok: true }, 202);
      } catch (e) {
        if (tries >= 2) throw e;
      }
    } while (tries < 2);

    return json({ ok: false, error: "kv-write-failed" }, 500);
  } catch (err) {
    console.error("[/api/event POST] error", err);
    return json({ ok: false, error: "internal-error" }, 500);
  }
}
