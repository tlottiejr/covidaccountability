// /functions/api/version.js
// Prefer static /assets/version.json; fallback to env vars.

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export const onRequestGet = async ({ request, env }) => {
  const origin = new URL(request.url).origin;

  try {
    const res = await fetch(`${origin}/assets/version.json`, { headers: { accept: "application/json" } });
    if (res.ok) {
      const body = await res.json();
      return json(body, 200, { "x-source": "static" });
    }
  } catch { /* ignore and fall back */ }

  const body = {
    version: env.GIT_COMMIT || env.COMMIT_SHA || "unknown",
    builtAt: env.BUILT_AT || null,
  };
  return json(body, 200, { "x-source": "env" });
};
