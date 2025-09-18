const STATE_RX = /^[A-Z]{2}$/;
const URL_RX = /^https?:\/\//i;

export function assertState(code) {
  if (!STATE_RX.test(code)) throw bad("Invalid state_code");
}

export function assertUrl(url) {
  if (!URL_RX.test(url)) throw bad("Invalid url (must be http/https)");
}

export function assertNonEmpty(s, field) {
  if (!s || !String(s).trim()) throw bad(`Missing ${field}`);
}

export function bad(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

export async function readJson(req) {
  let j;
  try { j = await req.json(); }
  catch { throw bad("Body must be valid JSON"); }
  return j;
}
