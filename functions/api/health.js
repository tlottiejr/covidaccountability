// /functions/api/health.js
// Quick health probe with small reachability checks.

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function timeout(p, ms = 2000) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export const onRequestGet = async ({ request, env }) => {
  const started = Date.now();
  const origin = new URL(request.url).origin;

  let version = null;
  try {
    const v = await timeout(fetch(`${origin}/api/version`, { headers: { accept: "application/json" } }), 1500);
    if (v.ok) version = await v.json();
  } catch { /* ignore */ }

  let kv = "skip";
  const KV = env.OPEN_BOARD_KV;
  if (KV) {
    try {
      await timeout(KV.get("health-probe"), 1000);
      kv = "ok";
    } catch {
      kv = "error";
    }
  }

  let d1 = "skip";
  const DB = env.DB || env.D1 || env.db;
  if (DB) {
    try {
      await timeout(DB.prepare("SELECT 1").first(), 1000);
      d1 = "ok";
    } catch {
      d1 = "error";
    }
  }

  const latencyMs = Date.now() - started;
  return json({ ok: true, time: new Date().toISOString(), latencyMs, version, kv, d1 });
};
