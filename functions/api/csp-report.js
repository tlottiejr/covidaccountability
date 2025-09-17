// CSP report sink (Report-Only). We just log and return 204 to avoid noise.
export async function onRequestPost({ request }) {
  try {
    // Limit to small bodies and ignore parsing failures
    const body = await request.text();
    console.log('[CSP-Report]', body.slice(0, 10_000));
  } catch {}
  return new Response(null, { status: 204 });
}
