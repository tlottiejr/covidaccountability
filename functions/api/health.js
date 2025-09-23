// functions/api/health.js
// Lightweight health check. Includes version.json data if available.

export async function onRequestGet({ request }) {
  const started = Date.now();
  let version = null;

  try {
    const v = await fetch(new URL("/api/version", request.url).toString(), {
      headers: { accept: "application/json" }
    });
    if (v.ok) version = await v.json();
  } catch {}

  const body = {
    ok: true,
    time: new Date().toISOString(),
    latencyMs: Date.now() - started,
    version
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Cache a little at the edge to keep it cheap but still fresh
      "cache-control": "public, max-age=5, s-maxage=30"
    }
  });
}
