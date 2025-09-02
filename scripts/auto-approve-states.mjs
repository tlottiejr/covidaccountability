const GOV_OK = /\.(gov|state\.|\.us)$/i; // *.gov, *.state.xx.us, *.us variants
const MIN_SCORE = 0.75;
const MUST_CONTAIN = /(complaint|file|report|investigation|discipline)/i;
const AVOID = /(attorney-?general|consumer-protection|business|bbb|city|county)/i;

function scoreState(row /* {code,name,candidate_url,page_title} */) {
  let s = 0;
  try {
    const u = new URL(row.candidate_url);
    if (!/^https:$/i.test(u.protocol)) return 0;
    if (!GOV_OK.test(u.hostname)) return 0;           // only official
    if (AVOID.test(u.hostname + u.pathname)) return 0; // wrong channel
    if (MUST_CONTAIN.test(u.pathname)) s += 0.5;
    if (/board|medical|medicine|licen(s|c)ing/i.test(u.pathname+u.search)) s += 0.2;
    // title nudge
    const got = (row.page_title||"").toLowerCase();
    if (/complaint|file|report/i.test(got)) s += 0.2;
    if (/board|medical|licen/i.test(got)) s += 0.1;
  } catch {}
  return Math.min(1, s);
}

// Approve only highest score per state with s >= 0.75.
