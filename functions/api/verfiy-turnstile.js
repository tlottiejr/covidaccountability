export async function onRequest(context) {
  const { request, env } = context;
  try {
    const { token } = await request.json();

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "missing_token" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    const form = new URLSearchParams();
    form.set("secret", env.TURNSTILE_SECRET);
    form.set("response", token);
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.set("remoteip", ip);

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
    const data = await r.json();
    return new Response(JSON.stringify({ success: !!data.success, data }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "bad_request" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
