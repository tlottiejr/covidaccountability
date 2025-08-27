// POST /api/verify-turnstile  { "token": "<cf-turnstile-response>" }
export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "missing token" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const form = new URLSearchParams();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await r.json();

    return new Response(JSON.stringify({ success: !!data.success }), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}