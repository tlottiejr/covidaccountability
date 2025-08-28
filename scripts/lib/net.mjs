// scripts/lib/net.mjs
export function getEnvInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export function pLimit(concurrency = 6) {
  let active = 0;
  const queue = [];
  const run = async (fn, resolve, reject) => {
    active++;
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    } finally {
      active--;
      if (queue.length) {
        const next = queue.shift();
        run(next.fn, next.resolve, next.reject);
      }
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      if (active < concurrency) run(fn, resolve, reject);
      else queue.push({ fn, resolve, reject });
    });
}

function timeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

export async function checkUrl(url, { timeoutMs = 12000 } = {}) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    accept: "*/*",
  };

  // Try HEAD first
  const t1 = timeout(timeoutMs);
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: t1.signal });
    t1.clear();
    const okish = r.ok || (r.status >= 200 && r.status < 400) || [401, 403, 405].includes(r.status);
    if (okish) return { ok: r.ok, status: r.status, final: r.url || url, method: "HEAD" };
  } catch {} finally {
    t1.clear();
  }

  // Fallback GET
  const t2 = timeout(timeoutMs + 3000);
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers, signal: t2.signal });
    t2.clear();
    const ok = r.ok || (r.status >= 200 && r.status < 400);
    return { ok, status: r.status, final: r.url || url, method: "GET" };
  } catch (err) {
    t2.clear();
    return { ok: false, status: -1, final: "", method: "GET", error: err?.message || "network error" };
  }
}
