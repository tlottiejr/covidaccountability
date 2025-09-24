// functions/admin/_middleware.js
// Enforce Bearer token, capture actor suffix if provided: "Bearer TOKEN#alice"

function json(body, status = 401) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest(ctx) {
  const { request, env, data } = ctx;
  const auth = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "missing-authorization" }, 401);
  }
  const tokenRaw = auth.slice(7).trim(); // after "Bearer "
  const [provided, actorSuffix] = tokenRaw.split("#");
  if (!provided || provided !== env.ADMIN_API_TOKEN) {
    return json({ ok: false, error: "invalid-authorization" }, 401);
  }
  // capture actor for audit
  ctx.data = data || {};
  ctx.data.actor = actorSuffix || "token";
  return await ctx.next();
}
