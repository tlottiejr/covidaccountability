// functions/admin/boards/[id]/primary.js
// POST -> promote board to primary within its state (demote siblings), audit

import { one } from "../../../_lib/db.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function getBoard(env, id) {
  return await one(
    env.DB,
    `
    SELECT COALESCE(id, rowid) AS id, state_code, board, url,
           (primary_flag = 1) AS primary,
           active, created_at, updated_at
    FROM boards
    WHERE COALESCE(id, rowid) = ?
    `,
    [id],
  );
}

export async function onRequestPost({ env, params, data }) {
  const id = params.id;
  if (!id) return json({ ok: false, error: "missing-id" }, 400);

  const existing = await getBoard(env, id);
  if (!existing) return json({ ok: false, error: "not-found" }, 404);

  const now = new Date().toISOString();

  try {
    await env.DB
      .prepare("UPDATE boards SET primary_flag = 0, updated_at = ? WHERE state_code = ? AND active = 1")
      .bind(now, existing.state_code)
      .run();

    await env.DB
      .prepare("UPDATE boards SET primary_flag = 1, updated_at = ? WHERE COALESCE(id, rowid) = ?")
      .bind(now, id)
      .run();

    const updated = await getBoard(env, id);

    const actor = (data && data.actor) || "token";
    await env.DB
      .prepare(
        `
        INSERT INTO board_events (board_id, actor, action, prev_json, next_json, created_at)
        VALUES (?,?,?,?,?,?)
      `,
      )
      .bind(
        updated.id,
        actor,
        "promote_primary",
        JSON.stringify({ ...existing }),
        JSON.stringify({ ...updated }),
        now,
      )
      .run();

    return json({ ok: true, board: updated }, 200);
  } catch (err) {
    console.error("[admin/boards primary POST] error", err);
    return json({ ok: false, error: "db-error" }, 500);
  }
}
