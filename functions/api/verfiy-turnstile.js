export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json();
    if (!token) return json({ success: false, error: 'missing token' }, 400);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET, // set in Dashboard → Pages → Variables
        response: token
      })
    });

    const data = await resp.json();
    return json({ success: !!data.success });
  } catch (e) {
    return json({ success: false, error: 'verify error' }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
