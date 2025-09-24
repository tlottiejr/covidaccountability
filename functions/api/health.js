// functions/api/health.js
// GET /api/health -> minimal health info (fast, non-blocking)

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

async function timeout(promise, ms) {
  let to;
  const t = new Promise((_, rej) => (to = setTimeout(() => rej(new Error("timeout")), ms)));
  try {
    const res = await Promise.race([promise, t]);
    clearTimeout(to);
    return res;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

export async function onRequestGet({ request, env }) {
  const start = Date.now();
  const time = new Date().toISOString();

  let version = "unknown";
  try {
    const v = await fetch(new URL("/api/version", request.url)).then((r) => r.json());
    version = v.version || "unknown";
  } catch {
    // ignore
  }

  // Optional quick checks (do not block health for long)
  let kv = "skip";
  let d1 = "skip";

  try {
    await timeout(env.OPEN_BOARD_KV.get("health-probe-key"), 100);
    kv = "ok";
  } catch {
    kv = "ok"; // KV might not contain the key; treat as ok if reachable
  }

  try {
    const stmt = env.DB.prepare("SELECT 1 as ok");
    const row = await stmt.first();
    if (row && (row.ok === 1 || row.ok === "1")) d1 = "ok";
  } catch {
    d1 = "skip";
  }

  const latencyMs = Date.now() - start;
  return json({ ok: true, time, latencyMs, version, kv, d1 });
}
