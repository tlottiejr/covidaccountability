// /functions/admin/boards/[id]/primary.js
// POST: promote board to primary and demote siblings (atomic).

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export const onRequestPost = async ({ params, env }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return json({ ok: false, reason: "id_invalid" }, 400);

  const DB = env.DB || env.D1 || env.db;
  if (!DB) return json({ ok: false, reason: "db_unavailable" }, 500);

  const row = await DB.prepare("SELECT id, state_code FROM boards WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, reason: "not_found" }, 404);

  await DB.batch([
    DB.prepare("UPDATE boards SET primary_flag = 0 WHERE state_code = ?").bind(row.state_code),
    DB.prepare("UPDATE boards SET primary_flag = 1 WHERE id = ?").bind(id),
  ]);

  const updated = await DB.prepare("SELECT id, state_code, board, url, primary_flag FROM boards WHERE id = ?").bind(id).first();
  return json({ ok: true, board: { ...updated, primary: !!updated.primary } });
};
