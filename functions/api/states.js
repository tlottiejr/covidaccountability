// functions/api/states.js
// GET /api/states
export async function onRequestGet({ env }) {
  // Postal code → human name (51 inc. DC)
  const NAMES = {
    AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
    CO:"Colorado", CT:"Connecticut", DE:"Delaware", DC:"District of Columbia",
    FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois",
    IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
    ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan",
    MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana",
    NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey",
    NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota",
    OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania",
    RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota",
    TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia",
    WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming"
  };

  // If D1 isn’t bound, bail early
  if (!env.DB) {
    return new Response(JSON.stringify([]), {
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  }

  try {
    // We only really need code, link, unavailable from states
    // (If you later add a 'name' column, we’ll prefer it.)
    const { results } = await env.DB.prepare(`
      SELECT code, link, unavailable, 
             COALESCE(name, '') as name
      FROM states
      ORDER BY code
    `).all();

    const out = (results || []).map(r => ({
      code: r.code,
      name: r.name && r.name.trim() ? r.name : (NAMES[r.code] || r.code),
      link: r.link || "",
      unavailable: !!r.unavailable
    }));

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "DB query failed" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}

