// functions/admin/boards/[id].js
// PATCH { board?, url?, primary? } -> update board; if primary true, demote siblings
// DELETE -> 405 (disabled)

import { one } from "../../_lib/db.js";
import { assertUrl, assertNonEmpty, bad } from "../../_lib/validate.js";

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

export async function onRequestPatch({ request, env, params, data }) {
  const id = params.id;
  if (!id) return bad(400, "missing id");

  const existing = await getBoard(env, id);
  if (!existing) return bad(404, "not found");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad(400, "invalid json");
  }

  const fields = {};
  if (body.board != null) {
    assertNonEmpty(body.board, "board");
    fields.board = String(body.board);
  }
  if (body.url != null) {
    assertUrl(body.url);
    fields.url = String(body.url);
  }
  if (body.primary != null) {
    fields.primary = !!body.primary;
  }

  if (Object.keys(fields).length === 0) {
    return json({ ok: true, board: existing }, 200);
  }

  const now = new Date().toISOString();

  try {
    // Transaction-ish: demote siblings if promoting this one
    if (fields.primary === true) {
      await env.DB
        .prepare("UPDATE boards SET primary_flag = 0, updated_at = ? WHERE state_code = ? AND active = 1")
        .bind(now, existing.state_code)
        .run();
    }

    const next = {
      ...existing,
      ...(fields.board != null ? { board: fields.board } : {}),
      ...(fields.url != null ? { url: fields.url } : {}),
      ...(fields.primary != null ? { primary: fields.primary } : {}),
      updated_at: now,
    };

    await env.DB
      .prepare(
        `
        UPDATE boards
        SET board = COALESCE(?, board),
            url = COALESCE(?, url),
            primary_flag = COALESCE(?, primary_flag),
            updated_at = ?
        WHERE COALESCE(id, rowid) = ?
        `,
      )
      .bind(
        fields.board ?? null,
        fields.url ?? null,
        fields.primary != null ? (fields.primary ? 1 : 0) : null,
        now,
        id,
      )
      .run();

    const updated = await getBoard(env, id);

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
        updated.id,
        actor,
        "update",
        JSON.stringify(existing),
        JSON.stringify(updated),
        now,
      )
      .run();

    return json({ ok: true, board: updated }, 200);
  } catch (err) {
    console.error("[admin/boards PATCH] error", err);
    return json({ ok: false, error: "db-error" }, 500);
  }
}

export async function onRequestDelete() {
  // Deletion disabled per product decision
  return json({ ok: false, error: "delete-disabled" }, 405);
}
