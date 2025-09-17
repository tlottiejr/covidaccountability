// Returns public site configuration (Turnstile site key).
export async function onRequestGet({ env }) {
  const data = {
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ? String(env.TURNSTILE_SITE_KEY) : ''
  };
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
