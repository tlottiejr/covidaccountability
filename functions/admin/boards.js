// functions/admin/boards.js
// GET ?state=XX -> list active boards for state
// POST { state, board, url, primary? } -> create board; if primary true, demote siblings

import { all, one } from "../_lib/db.js";
import { assertState, assertUrl, assertNonEmpty, bad } from "../_lib/validate.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  try {
    assertState(state);
  } catch (e) {
    return bad(400, e);
  }

  try {
    const rows = await all(
      env.DB,
      `
      SELECT COALESCE(id, rowid) AS id, state_code, board, url,
             (primary_flag = 1) AS primary,
             active, created_at, updated_at
      FROM boards
      WHERE state_code = ? AND active = 1
      ORDER BY primary_flag DESC, board ASC
      `,
      [state],
    );
    return json({ ok: true, state, boards: rows });
  } catch (err) {
    console.error("[admin/boards GET] error", err);
    return json({ ok: false, error: "internal-error" }, 500);
  }
}

export async function onRequestPost({ request, env, data }) {
  try {
    const body = await request.json();
    const state = body.state;
    const board = body.board;
    const url = body.url;
    const primary = !!body.primary;

    assertState(state);
    assertNonEmpty(board, "board");
    assertUrl(url);

    const now = new Date().toISOString();

    // Transaction (serialize statements)
    const demote = primary
      ? env.DB.prepare("UPDATE boards SET primary_flag = 0, updated_at = ? WHERE state_code = ? AND active = 1")
          .bind(now, state)
      : null;

    const insert = env.DB
      .prepare(
        `
        INSERT INTO boards (state_code, board, url, primary_flag, active, created_at, updated_at)
        VALUES (?,?,?,?,1,?,?)
        `,
      )
      .bind(state, board, url, primary ? 1 : 0, now, now);

    try {
      if (demote) await demote.run();
      const res = await insert.run();
      const id = res.lastRowId;

      const created = await one(
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

      // Audit
      const actor = (data && data.actor) || "token";
      await env.DB
        .prepare(
          `
          INSERT INTO board_events (board_id, actor, action, prev_json, next_json, created_at)
          VALUES (?,?,?,?,?,?)
        `,
        )
        .bind(
          created.id,
          actor,
          "create",
          null,
          JSON.stringify(created),
          now,
        )
        .run();

      return json({ ok: true, board: created }, 201);
    } catch (e) {
      console.error("[admin/boards POST] db error", e);
      return json({ ok: false, error: "db-error" }, 500);
    }
  } catch (err) {
    console.error("[admin/boards POST] error", err);
    return json({ ok: false, error: "bad-request" }, 400);
  }
}
