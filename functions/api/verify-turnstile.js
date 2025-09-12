export const onRequestPost = async ({ request, env }) => {
  try {
    const { token } = await request.json().catch(() => ({}));
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'missing-token' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    const secret = env.TURNSTILE_SECRET;
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: 'missing-secret' }), {
        status: 500,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    const out = await verifyRes.json();
    const ok = !!out?.success;

    return new Response(JSON.stringify({ success: ok }), {
      status: ok ? 200 : 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'server-error' }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
};
