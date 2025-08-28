// functions/api/states.js
export async function onRequest({ env }) {
  const db = env.DB;

  const sql = `
    SELECT
      s.code,
      s.name,
      -- prefer states.link, otherwise boards.complaint_form_url
      COALESCE(s.link, b.complaint_form_url) AS link,
      -- "unavailable" if the state itself is flagged OR board status indicates bad
      CASE
        WHEN s.unavailable = 1
             OR COALESCE(b.status, '') IN ('error','404')
        THEN 1 ELSE 0
      END AS unavailable,
      COALESCE(b.board_name, '')         AS board_name,
      COALESCE(b.last_verified_at, '')   AS last_verified_at,
      COALESCE(b.status, '')             AS status,
      COALESCE(b.prefill_mode, 'none')   AS prefill_mode,
      COALESCE(b.prefill_template, '')   AS prefill_template
    FROM states s
    LEFT JOIN boards b ON b.state_code = s.code
    ORDER BY s.code;
  `;

  const { results } = await db.prepare(sql).all();

  return new Response(JSON.stringify(results), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
