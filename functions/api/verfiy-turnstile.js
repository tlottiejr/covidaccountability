// functions/api/verify-turnstile.js
// POST { token }
export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) return Response.json({ success: false, error: "missing token" }, { status: 400 });

    const form = new URLSearchParams();
    form.set("secret", env.TURNSTILE_SECRET);
    form.set("response", token);

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
    const data = await r.json().catch(() => ({}));
    return Response.json({ success: !!data.success });
  } catch (_) {
    return Response.json({ success: false }, { status: 500 });
  }
}
