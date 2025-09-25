// /functions/api/verify-turnstile.js
// Server-side verify for Cloudflare Turnstile
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function readJsonSafe(req) {
  try { return await req.json(); } catch { return {}; }
}

export const onRequestPost = async ({ request, env }) => {
  const { response, remoteip } = await readJsonSafe(request);
  const secret = env.TURNSTILE_SECRET || env.TURNSTILE_SERVER_SECRET;
  if (!secret) return json({ success: false, reason: "secret_missing" }, 500);
  if (!response) return json({ success: false, reason: "response_missing" }, 400);

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", response);
  if (remoteip) form.append("remoteip", String(remoteip));

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

  const success = !!(data && data.success);
  return json({ success, data }, success ? 200 : 400);
};
