// /functions/api/verify-turnstile.js
export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "missing-token" }), { status: 400 });
    }

    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await resp.json();

    return new Response(JSON.stringify({ success: !!data.success }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
  }
}
