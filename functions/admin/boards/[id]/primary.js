import { one, ID_ALIAS, toBoard } from "../../../_lib/db.js";
import { bad } from "../../../_lib/validate.js";

export const onRequestPost = async ({ env, params, data }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw bad("Invalid id");

  const row = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?) AND active=1`, [id, id]);
  if (!row) throw bad("Not found or inactive", 404);

  const state = row.state_code;

  // Make this the sole primary for the state
  await env.DB.batch([
    env.DB.prepare(`UPDATE boards SET primary_flag=0 WHERE state_code=?`).bind(state),
    env.DB.prepare(`UPDATE boards SET primary_flag=1 WHERE (id=? OR rowid=?)`).bind(id, id)
  ]);

  const after = await one(env.DB,
    `SELECT ${ID_ALIAS}, state_code, board, url, primary_flag, active
       FROM boards WHERE (id=? OR rowid=?)`, [id, id]);

  await env.DB.prepare(
    `INSERT INTO board_events (board_id, actor, action, prev, next, ts)
     VALUES (?, ?, 'set_primary', ?, ?, ?)`
  ).bind(id, data.actor || "token", JSON.stringify(row), JSON.stringify(after), Date.now()).run();

  return new Response(JSON.stringify(toBoard(after)), {
    headers: { "content-type": "application/json" }
  });
};
