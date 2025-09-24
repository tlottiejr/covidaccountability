// functions/csp-report.js
// POST endpoint for CSP reporting (legacy + Reporting API)

function noContent(headers = {}) {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function onRequestPost({ request }) {
  try {
    const ct = (request.headers.get("content-type") || "").toLowerCase();

    if (ct.includes("application/csp-report")) {
      // Legacy single-report format
      const body = await request.json().catch(() => ({}));
      const rep = body["csp-report"] || body;
      const record = {
        violatedDirective: rep["violated-directive"] || rep.violatedDirective || null,
        effectiveDirective: rep.effectiveDirective || null,
        blockedURI: rep["blocked-uri"] || rep.blockedURI || null,
        disposition: rep.disposition || null,
        referrer: rep.referrer || null,
        originalPolicy: rep["original-policy"] || rep.originalPolicy || null,
        userAgent: request.headers.get("user-agent") || null,
      };
      console.warn("[CSP-LEGACY]", JSON.stringify(record));
      return noContent();
    }

    // Reporting API (application/reports+json) or generic JSON array
    const arr = await request.json().catch(() => []);
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const body = (item && item.body) || item || {};
        const rep = body["csp-report"] || body;
        const record = {
          violatedDirective: rep["violated-directive"] || rep.violatedDirective || null,
          effectiveDirective: rep.effectiveDirective || null,
          blockedURI: rep["blocked-uri"] || rep.blockedURI || null,
          disposition: rep.disposition || null,
          referrer: rep.referrer || null,
          originalPolicy: rep["original-policy"] || rep.originalPolicy || null,
          userAgent: request.headers.get("user-agent") || null,
        };
        console.warn("[CSP-REPORT]", JSON.stringify(record));
      }
    }

    return noContent();
  } catch (err) {
    console.error("[/csp-report] error", err);
    return noContent();
  }
}
