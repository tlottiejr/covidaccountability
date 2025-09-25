// /functions/csp-report.js
// Accepts both legacy "application/csp-report" and modern "application/reports+json" batches.
// Always returns 204 to avoid client retries.

function text(body = "", status = 204, headers = {}) {
  return new Response(body, { status, headers });
}

export const onRequestPost = async ({ request, env }) => {
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("application/csp-report")) {
      const { "csp-report": report } = await request.json();
      await env?.KV_LOG?.put?.(`csp:${Date.now()}:${Math.random()}`, JSON.stringify(report || {}), { expirationTtl: 7 * 24 * 60 * 60 });
    } else if (ct.includes("application/reports+json")) {
      const arr = await request.json();
      if (Array.isArray(arr)) {
        for (const r of arr) {
          await env?.KV_LOG?.put?.(`csp:${Date.now()}:${Math.random()}`, JSON.stringify(r || {}), { expirationTtl: 7 * 24 * 60 * 60 });
        }
      }
    } else {
      // Best-effort parse
      const obj = await request.json().catch(() => ({}));
      await env?.KV_LOG?.put?.(`csp:${Date.now()}:${Math.random()}`, JSON.stringify(obj || {}), { expirationTtl: 7 * 24 * 60 * 60 });
    }
  } catch {
    // don't fail the caller
  }
  return text();
};
