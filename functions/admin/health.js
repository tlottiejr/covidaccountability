export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, service: "admin-api", ts: Date.now() }), {
    headers: { "content-type": "application/json" },
  });
