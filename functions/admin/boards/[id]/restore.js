// functions/admin/boards/[id]/restore.js
// POST { eventId } or { snapshot:{ board, url, primary, active } } -> restore fields and audit

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

export async function onRequestPost({ request, env, params, data }) {
  const id = params.id;
  if (!id) return json({ ok: false, error: "missing-id" }, 400);

  const existing = await getBoard(env, id);
  if (!existing) return json({ ok: false, error: "not-found" }, 404);

  let body = {};
  try {
    body = await request.json();
  } catch {
    // ignore
  }

  let snapshot = body.snapshot || null;

  if (!snapshot && body.eventId) {
    // Load from board_events
    const ev = await one(
      env.DB,
      `
      SELECT id, prev_json, next_json
      FROM board_events
      WHERE board_id = ? AND id = ?
      `,
      [existing.id, body.eventId],
    );
    if (!ev) return json({ ok: false, error: "event-not-found" }, 404);
    // Prefer next_json (state after that event)
    snapshot = (ev.next_json && JSON.parse(ev.next_json)) || (ev.prev_json && JSON.parse(ev.prev_json)) || null;
  }

  if (!snapshot) {
    return json({ ok: false, error: "missing-snapshot" }, 400);
  }

  const nextFields = {
    board: snapshot.board ?? existing.board,
    url: snapshot.url ?? existing.url,
    primary: snapshot.primary ?? existing.primary,
    active: snapshot.active ?? existing.active,
  };

  const now = new Date().toISOString();

  try {
    if (nextFields.primary === true) {
      await env.DB
        .prepare("UPDATE boards SET primary_flag = 0, updated_at = ? WHERE state_code = ? AND active = 1")
        .bind(now, existing.state_code)
        .run();
    }

    await env.DB
      .prepare(
        `
        UPDATE boards
        SET board = ?, url = ?, primary_flag = ?, active = ?, updated_at = ?
        WHERE COALESCE(id, rowid) = ?
        `,
      )
      .bind(
        nextFields.board,
        nextFields.url,
        nextFields.primary ? 1 : 0,
        nextFields.active ? 1 : 0,
        now,
        id,
      )
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
        "restore",
        JSON.stringify(existing),
        JSON.stringify(updated),
        now,
      )
      .run();

    return json({ ok: true, board: updated }, 200);
  } catch (err) {
    console.error("[admin/boards restore POST] error", err);
    return json({ ok: false, error: "db-error" }, 500);
  }
}
