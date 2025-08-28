const FALLBACK_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" }
];

export async function onRequestGet({ env }) {
  try {
    // Try D1 first
    if (env.DB) {
      const sql = `
        SELECT s.code,
               s.name,
               COALESCE(b.complaint_form_url, s.link, '') AS link,
               CASE
                 WHEN b.status IN ('error','404') THEN 1
                 ELSE 0
               END AS unavailable,
               COALESCE(b.board_name, '') AS board_name
        FROM states s
        LEFT JOIN boards b ON b.state_code = s.code
        ORDER BY s.code ASC
      `;
      const { results } = await env.DB.prepare(sql).all();
      if (Array.isArray(results) && results.length) {
        return json(results);
      }
    }
    // Fallback to static file in /assets if present
    try {
      const r = await fetch('https://'+self.location?.host+'/assets/states.json', { headers: { accept: 'application/json' }});
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr) && arr.length) return json(arr);
      }
    } catch {}

    // Final fallback: embedded codes/names
    return json(FALLBACK_STATES.map(s => ({ ...s, link: "", unavailable: false, board_name: "" })));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type':'application/json', 'cache-control':'no-store' }
  });
}
