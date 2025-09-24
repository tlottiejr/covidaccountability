// functions/api/verify-turnstile.js
// POST /api/verify-turnstile  { response, remoteip? } -> { success, data }

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { response, remoteip } = await readJson(request);
    if (!response || typeof response !== "string") {
      return json({ success: false, error: "missing-response" }, 400);
    }

    const form = new URLSearchParams();
    form.set("secret", env.TURNSTILE_SECRET);
    form.set("response", response);
    if (remoteip) form.set("remoteip", remoteip);

    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    const data = await verify.json().catch(() => ({}));
    const success = !!data.success;

    return json({ success, data }, 200);
  } catch (err) {
    console.error("[/api/verify-turnstile] error", err);
    return json({ success: false, error: "internal-error" }, 500);
  }
}
