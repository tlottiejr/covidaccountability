// Simple bearer token auth for /admin/*
// Set ADMIN_API_TOKEN in Cloudflare Pages project settings.

export const onRequest = async (ctx) => {
  const token = ctx.request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== ctx.env.ADMIN_API_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  // Attach actor (for audit)
  ctx.data = ctx.data || {};
  ctx.data.actor = "token"; // Optionally parse a suffix from token or use Access in future
  return await ctx.next();
};
