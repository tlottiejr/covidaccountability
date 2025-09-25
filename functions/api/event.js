// /functions/api/event.js
// GET /api/event?date=YYYY-MM-DD  -> return aggregate
// POST /api/event { type:'open_board', state:'XX', url:'https://…', host:'…' } -> aggregate counters in KV

/** Small JSON response helper */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

/** Parse JSON safely (with size cap) */
async function readJson(req, max = 32 * 1024) {
  const reader = req.body?.getReader?.();
  if (!reader) return {};
  let received = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) throw new Error("payload_too_large");
    chunks.push(value);
  }
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buf || new Uint8Array()));
}

/** Validate event payload */
function validateEvent(evt) {
  const errors = [];
  if (!evt || typeof evt !== "object") return ["invalid_json"];
  const { type, state, url, host } = evt;

  if (type !== "open_board") errors.push("type_invalid");
  if (!/^[A-Z]{2}$/.test(String(state || ""))) errors.push("state_invalid");
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") errors.push("url_must_be_https");
  } catch {
    errors.push("url_invalid");
  }
  if (!host || typeof host !== "string" || !host.length) errors.push("host_invalid");

  return errors;
}

/** Return YYYY-MM-DD in UTC */
function ymdUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const onRequestGet = async ({ request, env }) => {
  const KV = env.OPEN_BOARD_KV || env.ANALYTICS || env.EVENTS || env.OPEN_BOARD_KV;
  if (!KV) return json({ ok: false, reason: "kv_unavailable" }, 500);

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || ymdUTC();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, reason: "date_invalid" }, 400);
  }

  const key = `events:${date}`;
  const data = (await KV.get(key, "json")) || {};
  return json({ ok: true, date, data });
};

export const onRequestPost = async ({ request, env }) => {
  const KV = env.OPEN_BOARD_KV || env.ANALYTICS || env.EVENTS || env.OPEN_BOARD_KV;
  if (!KV) return json({ ok: false, reason: "kv_unavailable" }, 500);

  let payload;
  try {
    payload = await readJson(request);
  } catch (e) {
    if (e.message === "payload_too_large") return json({ ok: false, reason: "payload_too_large" }, 413);
    return json({ ok: false, reason: "invalid_json" }, 400);
  }

  const errors = validateEvent(payload);
  if (errors.length) return json({ ok: false, errors }, 400);

  const date = ymdUTC();
  const key = `events:${date}`;

  // Merge-with-retry (CAS-like)
  for (let i = 0; i < 2; i++) {
    const existing = (await KV.get(key, "json")) || {};
    const next = { ...existing };

    const { type, state } = payload;
    next[type] = next[type] || {};
    next[type][state] = (next[type][state] || 0) + 1;

    try {
      // We don't have native CAS; accept last write wins with a short retry loop.
      await KV.put(key, JSON.stringify(next), {
        expirationTtl: 45 * 24 * 60 * 60, // 45 days
      });
      return json({ ok: true }, 202);
    } catch {
      // retry
    }
  }
  return json({ ok: false, reason: "kv_write_failed" }, 500);
};
