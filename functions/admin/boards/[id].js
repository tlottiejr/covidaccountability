// /functions/admin/boards/[id].js
// PATCH: update board fields; if primary=true, demote siblings in same state within a transaction.

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function readJsonSafe(req) {
  try { return await req.json(); } catch { return {}; }
}

export const onRequestPatch = async ({ params, env }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ ok: false, reason: "id_invalid" }, 400);

  const DB = env.DB || env.D1 || env.db;
  if (!DB) return json({ ok: false, reason: "db_unavailable" }, 500);

  const payload = await readJsonSafe({ json: () => Promise.resolve({}) }) || {};
  // If Cloudflare Pages strips body on PATCH in your setup, switch to POST override; otherwise:
  const body = await readJsonSafe(this?.request || {});
  Object.assign(payload, body);

  const { board, url, primary } = payload;

  // Fetch current to get state_code
  const existing = await DB.prepare("SELECT id, state_code FROM boards WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, reason: "not_found" }, 404);

  const tx = await DB.batch([
    // Optionally demote siblings if primary=true
    ...(primary === true
      ? [DB.prepare("UPDATE boards SET primary = 0 WHERE state_code = ?").bind(existing.state_code)]
      : []),
    // Update target fields (only those provided)
    DB.prepare(
      `UPDATE boards
         SET board = COALESCE(?, board),
             url   = COALESCE(?, url),
             primary = COALESCE(?, primary)
       WHERE id = ?`
    ).bind(board ?? null, url ?? null, typeof primary === "boolean" ? (primary ? 1 : 0) : null, id),
  ]);

  // Return the updated board
  const updated = await DB.prepare("SELECT id, state_code, board, url, primary FROM boards WHERE id = ?").bind(id).first();
  return json({ ok: true, board: { ...updated, primary: !!updated.primary } });
};

// (Optional) onRequestGet to fetch a single board could be added if you use it elsewhere.
