// /functions/api/states.js
// Returns states from D1. Shape expected by the UI:
// [{ code: "AL", name: "Alabama", link: "https://...", unavailable: false }, ...]

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

export async function onRequestGet({ env }) {
  try {
    // Prefer name if present in your table; otherwise fill from map
    const sql = `
      SELECT
        code,
        COALESCE(name, '') AS name,
        link,
        CAST(COALESCE(unavailable, 0) AS INTEGER) AS unavailable
      FROM states
      ORDER BY name COLLATE NOCASE, code
    `;
    const { results } = await env.DB.prepare(sql).all();

    const rows = (results || []).map(r => ({
      code: r.code,
      name: r.name && r.name.trim() ? r.name : (STATE_NAMES[r.code] ?? r.code),
      link: r.link ?? null,
      unavailable: !!r.unavailable
    }));

    return new Response(JSON.stringify(rows), {
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    // If DB isn’t bound or query fails, return a loud error so we see it
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
