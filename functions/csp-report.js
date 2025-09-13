// Receives CSP reports from browsers. Non-blocking, returns 204.
// Works for both legacy `application/csp-report` and Reporting API JSON.

export async function onRequestPost({ request }) {
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  let items = [];

  try {
    if (ct.includes('application/csp-report')) {
      // Legacy single-report shape: { "csp-report": { ... } }
      const body = await request.json();
      if (body) items = [body];
    } else {
      // Reporting API shape: array of reports
      const body = await request.json();
      if (Array.isArray(body)) items = body;
      else if (body) items = [body];
    }
  } catch {
    // ignore parse errors
  }

  // Log to Worker logs (visible in Cloudflare dashboard)
  try {
    for (const r of items) console.log('CSP-REPORT', JSON.stringify(r));
  } catch {}

  return new Response(null, { status: 204 });
}

// Optional: respond to GET with a tiny health check
export function onRequestGet() {
  return new Response('CSP report endpoint OK', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
