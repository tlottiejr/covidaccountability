/**
 * GET /api/states
 * Returns [{ code, name, link, unavailable }] from D1.
 * Falls back gracefully if any table is missing.
 */
export async function onRequestGet({ env }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });

  // Helper: run SQL safely, return [] on any error
  async function safeAll(sql, params = []) {
    try {
      const stmt = env.DB.prepare(sql);
      const data = await stmt.bind(...params).all();
      return data?.results ?? data ?? [];
    } catch (e) {
      // console.error("D1 query failed:", e);
      return [];
    }
  }

  // Preferred: states + boards join
  const joined = await safeAll(/* sql */ `
    SELECT
      s.code                                     AS code,
      COALESCE(b.board_name, s.name, s.code)     AS name,
      COALESCE(NULLIF(b.complaint_form_url, ''), s.link, '') AS link,
      CASE
        WHEN LOWER(IFNULL(b.status, '')) IN ('error','down','404') THEN 1
        WHEN CAST(IFNULL(s.unavailable, 0) AS INTEGER) = 1 THEN 1
        ELSE 0
      END                                         AS unavailable
    FROM states s
    LEFT JOIN boards b ON b.state_code = s.code
    ORDER BY s.code ASC;
  `);

  if (joined.length) {
    return json(
      joined.map(r => ({
        code: String(r.code).toUpperCase(),
        name: r.name || r.code,
        link: r.link || "",
        unavailable: !!r.unavailable,
      }))
    );
  }

  // Fallback: states only (no boards table yet)
  const onlyStates = await safeAll(/* sql */ `
    SELECT
      code AS code,
      COALESCE(name, code) AS name,
      IFNULL(link, '')     AS link,
      CAST(IFNULL(unavailable, 0) AS INTEGER) AS unavailable
    FROM states
    ORDER BY code ASC;
  `);

  if (onlyStates.length) {
    return json(
      onlyStates.map(r => ({
        code: String(r.code).toUpperCase(),
        name: r.name || r.code,
        link: r.link || "",
        unavailable: !!r.unavailable,
      }))
    );
  }

  // Final fallback: an empty list rather than HTML
  return json([], 200);
}
