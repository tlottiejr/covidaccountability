// functions/api/version.js
// GET /api/version -> { version, builtAt } from static file if present, else synthesized.

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=3600",
      ...headers,
    },
  });
}

export async function onRequestGet({ request, env }) {
  try {
    // Try static file
    const url = new URL("/assets/version.json", request.url).toString();
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      return json(data);
    }
  } catch {
    // fall through
  }

  const version = env.GIT_COMMIT || "unknown";
  const builtAt = env.BUILT_AT || null;
  return json({ version, builtAt });
}
