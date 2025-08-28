/**
 * POST /api/verify-turnstile
 * Body: { token }
 * Uses env.TURNSTILE_SECRET (already created in Dashboard).
 */
export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) return new Response(JSON.stringify({ success: false }), { status: 400 });

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const j = await r.json().catch(() => ({}));
    return new Response(JSON.stringify({ success: !!j.success }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      status: 200,
    });
  } catch {
    return new Response(JSON.stringify({ success: false }), {
      headers: { "content-type": "application/json; charset=utf-8" },
      status: 200,
    });
  }
}
