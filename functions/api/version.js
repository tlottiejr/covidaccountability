// functions/api/version.js
// Returns version info from the static asset /assets/version.json with strong caching.

export async function onRequestGet({ request }) {
  try {
    const url = new URL("/assets/version.json", request.url);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (res.ok) {
      const text = await res.text();
      return new Response(text, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400"
        }
      });
    }
  } catch {}

  // Fallback when the asset is missing
  return new Response(
    JSON.stringify({
      version: "unknown",
      commit: "unknown",
      builtAt: new Date().toISOString()
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
