import { one, ID_ALIAS, toBoard } from "../../_lib/db.js";
import { assertState, assertUrl, readJson, bad } from "../../_lib/validate.js";

export const onRequestPatch = async ({ env, params, request, data }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw bad("Invalid id");

  const existing = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [id, id]);
  if (!existing) throw bad("Not found", 404);

  const changes = await readJson(request);
  const next = {
    state_code: changes.state_code ? String(changes.state_code).toUpperCase() : existing.state_code,
    board:      changes.board      ?? existing.board,
    url:        changes.url        ?? existing.url,
    primary:    typeof changes.primary === "boolean" ? changes.primary : (Number(existing.primary_flag) === 1),
    active:     typeof changes.active  === "boolean" ? changes.active  : (Number(existing.active) === 1),
  };

  // Validate
  assertState(next.state_code);
  if (next.url !== existing.url) assertUrl(next.url);

  // Update
  await env.DB.prepare(
    `UPDATE boards
        SET state_code=?, board=?, url=?, primary_flag=?, active=?
      WHERE (id=? OR rowid=?)`
  ).bind(next.state_code, next.board, next.url, next.primary ? 1 : 0, next.active ? 1 : 0, id, id).run();

  // If now primary, demote others in state (except self)
  if (next.primary) {
    await env.DB.prepare(
      `UPDATE boards SET primary_flag=0
        WHERE state_code=? AND ${ID_ALIAS.replace(" AS id","")} <> ?`
    ).bind(next.state_code, id).run();
  }

  const after = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [id, id]);

  // audit
  await env.DB.prepare(
    `INSERT INTO board_events (board_id, actor, action, prev, next, ts)
     VALUES (?, ?, 'update', ?, ?, ?)`
  ).bind(id, data.actor || "token", JSON.stringify(existing), JSON.stringify(after), Date.now()).run();

  return json(toBoard(after));
};

export const onRequestDelete = async ({ env, params, data }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw bad("Invalid id");

  const existing = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [id, id]);
  if (!existing) throw bad("Not found", 404);

  await env.DB.prepare(
    `UPDATE boards SET active=0, primary_flag=0 WHERE (id=? OR rowid=?)`
  ).bind(id, id).run();

  const after = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [id, id]);

  await env.DB.prepare(
    `INSERT INTO board_events (board_id, actor, action, prev, next, ts)
     VALUES (?, ?, 'delete', ?, ?, ?)`
  ).bind(id, data.actor || "token", JSON.stringify(existing), JSON.stringify(after), Date.now()).run();

  return new Response(null, { status: 204 });
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
