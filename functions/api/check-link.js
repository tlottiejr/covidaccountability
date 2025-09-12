// /functions/api/check-link.js
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function onRequestOptions() {
  return new Response(null, { headers: cors });
}

export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const target = u.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ ok: false, error: "missing url" }), {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    // Many boards 405 on HEAD; use GET and follow redirects.
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "CAN-LinkCheck/1.0 (+https://stage.covidaccountabilitynow.com)",
      },
    });

    const status = res.status;
    const finalUrl = res.url || target;
    const ok =
      (status >= 200 && status <= 206) ||
      [300, 301, 302, 303, 307, 308].includes(status);

    return new Response(
      JSON.stringify({ ok, status, finalUrl }),
      { headers: { "content-type": "application/json", ...cors } }
    );
  } catch (e) {
    // Network/CORS/SSL errors at the edge => soft issue; UI shows "Unverified".
    return new Response(
      JSON.stringify({ ok: false, status: 0, error: String(e) }),
      { headers: { "content-type": "application/json", ...cors } }
    );
  }
}
