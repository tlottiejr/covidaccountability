import { all, one, ID_ALIAS, toBoard } from "../_lib/db.js";
import { assertState, assertUrl, assertNonEmpty, readJson, bad } from "../_lib/validate.js";

export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  if (!state) throw bad("Missing state query param");
  assertState(state);

  const rows = await all(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards
      WHERE state_code = ? AND active = 1
      ORDER BY primary_flag DESC, board`, [state]);

  return json(rows.map(toBoard));
};

export const onRequestPost = async ({ env, request, data }) => {
  const body = await readJson(request);
  const state_code = String(body.state_code || "").toUpperCase();
  const board = String(body.board || "");
  const url = String(body.url || "");
  const primary = !!body.primary;

  assertState(state_code);
  assertNonEmpty(board, "board");
  assertUrl(url);

  // de-dupe: same (state, board, url) active?
  const dupe = await one(env.DB,
    `SELECT ${ID_ALIAS} FROM boards WHERE state_code=? AND board=? AND url=? AND active=1 LIMIT 1`,
    [state_code, board, url]
  );
  if (dupe) throw bad("Duplicate board url for state", 409);

  // insert
  const ins = await env.DB.prepare(
    `INSERT INTO boards (state_code, board, url, primary_flag, active)
     VALUES (?, ?, ?, ?, 1)`
  ).bind(state_code, board, url, primary ? 1 : 0).run();

  const insertedId = ins.lastRowId;

  // if primary, demote others atomically
  if (primary) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE boards SET primary_flag=0 WHERE state_code=? AND ${ID_ALIAS.replace(" AS id","")} <> ?`)
        .bind(state_code, insertedId)
    ]);
  }

  const row = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [insertedId, insertedId]);

  // audit
  await env.DB.prepare(
    `INSERT INTO board_events (board_id, actor, action, prev, next, ts)
     VALUES (?, ?, 'create', NULL, ?, ?)`
  ).bind(insertedId, data.actor || "token", JSON.stringify(row), Date.now()).run();

  return json(toBoard(row), 201);
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
