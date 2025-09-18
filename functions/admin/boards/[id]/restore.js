/**
 * POST /admin/boards/:id/restore?event=<eventId>
 *
 * Restores the board to the `prev_json` snapshot recorded in `board_events` for the given event.
 * Requirements:
 *  - Authorization: Bearer <ADMIN_API_TOKEN>
 *  - D1 binding: env.DB (points to your medportal_db)
 *
 * Notes:
 *  - We rely on a board_events table with columns:
 *      id (integer PK), board_id (integer), op (text),
 *      prev_json (text), next_json (text), created_at (text)
 *  - prev_json is a JSON object with the board fields we care about (state_code, board, url, primary_flag, active).
 */

async function authOrThrow(request, env) {
  const hdr = request.headers.get('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
  if (!token || token !== env.ADMIN_API_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return null;
}

export const onRequestPost = async (ctx) => {
  const { env, request, params } = ctx;
  const authErr = await authOrThrow(request, env);
  if (authErr) return authErr;

  const boardIdRaw = params.id;
  const url = new URL(request.url);
  const eventIdRaw = url.searchParams.get('event');

  // Validate inputs
  const boardId = Number(boardIdRaw);
  const eventId = Number(eventIdRaw);
  if (!boardId || !Number.isFinite(boardId)) {
    return jsonResp({ ok: false, error: 'invalid_board_id' }, 400);
  }
  if (!eventId || !Number.isFinite(eventId)) {
    return jsonResp({ ok: false, error: 'invalid_event_id' }, 400);
  }

  // 1) Fetch the event and ensure it belongs to this board.
  const evStmt = env.DB.prepare(
    `SELECT id, board_id, op, prev_json, next_json, created_at
       FROM board_events
      WHERE id=?`
  );
  const evRow = await evStmt.bind(eventId).first();

  if (!evRow) return jsonResp({ ok: false, error: 'event_not_found' }, 404);
  if (Number(evRow.board_id) !== boardId) {
    return jsonResp({ ok: false, error: 'event_does_not_belong_to_board' }, 400);
  }

  if (!evRow.prev_json) {
    return jsonResp({ ok: false, error: 'no_prev_snapshot_available' }, 400);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(evRow.prev_json);
  } catch {
    return jsonResp({ ok: false, error: 'invalid_prev_snapshot' }, 500);
  }

  // 2) Make sure the board exists (we only "restore" existing rows).
  const boardStmt = env.DB.prepare(
    `SELECT id, state_code, board, url, primary_flag, active
       FROM boards
      WHERE id=?`
  );
  const boardRow = await boardStmt.bind(boardId).first();
  if (!boardRow) return jsonResp({ ok: false, error: 'board_not_found' }, 404);

  // 3) Apply snapshot in a basic transaction:
  //    - If snapshot.primary_flag=1 we demote any state primary first (like create/primary endpoint does).
  //    - Then update this board with snapshot fields.
  const txn = await env.DB.batch([
    // If the restore sets the row to primary, demote others for that state.
    snapshot.primary_flag ? env.DB.prepare(
      `UPDATE boards
          SET primary_flag=0
        WHERE state_code=? AND id<>?`
    ).bind(snapshot.state_code, boardId) : null,

    env.DB.prepare(
      `UPDATE boards
          SET state_code=?,
              board=?,
              url=?,
              primary_flag=?,
              active=?
        WHERE id=?`
    ).bind(
      snapshot.state_code ?? boardRow.state_code,
      snapshot.board ?? boardRow.board,
      snapshot.url ?? boardRow.url,
      Number(snapshot.primary_flag ?? boardRow.primary_flag) ? 1 : 0,
      Number(snapshot.active ?? boardRow.active) ? 1 : 0,
      boardId
    ),
  ].filter(Boolean));

  // 4) Return final row for convenience.
  const refreshed = await env.DB.prepare(
    `SELECT id, state_code, board, url, primary_flag, active
       FROM boards
      WHERE id=?`
  ).bind(boardId).first();

  return jsonResp({
    ok: true,
    restored_from_event: eventId,
    board: refreshed,
  });
};

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
