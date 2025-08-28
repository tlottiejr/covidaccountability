export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) return json({ success: false, error: "missing token" }, 400);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token
      })
    });
    const data = await r.json();
    return json({ success: !!data.success });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
