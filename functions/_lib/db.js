// Shared D1 helpers

export async function one(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).first();
  return r ?? null;
}

export async function all(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).all();
  return r.results ?? [];
}

// Boards table might not have an explicit `id` column in legacy schema.
// Use COALESCE(id, rowid) when selecting; and match WHERE (id = ? OR rowid = ?).
export const ID_ALIAS = "COALESCE(id, rowid) AS id";

// Convert row to minimal API shape
export function toBoard(row) {
  return {
    id: row.id ?? row.rowid ?? row.ID ?? null,
    state_code: row.state_code,
    board: row.board,
    url: row.url,
    primary: Number(row.primary_flag) === 1,
    active: Number(row.active ?? 1) === 1
  };
}
