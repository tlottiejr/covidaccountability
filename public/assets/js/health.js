// public/assets/js/health.js

const $ = (sel) => document.querySelector(sel);

const checks = [
  { id: "home",      label: "Home",                 url: "/",                            type: "GET" },
  { id: "css",       label: "CSS bundle",           url: "/assets/css/site.css",         type: "GET" },
  { id: "refs_js",   label: "References JS (if any)", url: "/assets/js/references-page.js", type: "GET" },
  { id: "favicon",   label: "Favicon",              url: "/favicon.ico",                 type: "GET" },
];

function fmt(ms) {
  return `${ms.toFixed(0)} ms`;
}

async function probe({ id, label, url, type = "GET" }) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: type, cache: "no-store", redirect: "follow" });
    const t1 = performance.now();
    const ok = res.ok;
    return { id, label, url, ok, status: res.status, time: t1 - t0 };
  } catch (e) {
    const t1 = performance.now();
    return { id, label, url, ok: false, status: "ERR", time: t1 - t0, err: e?.message || String(e) };
  }
}

function cardHTML(r) {
  const color = r.ok ? "var(--ok, #1f7a1f)" : "var(--err, #a52828)";
  const badge = r.ok ? "OK" : "FAIL";
  return `
  <div class="card p-3">
    <div class="flex-between">
      <div>
        <div class="h5">${r.label}</div>
        <div class="text-sm mono">${r.url}</div>
      </div>
      <div class="badge" style="background:${color};color:white;padding:4px 8px;border-radius:999px">${badge}</div>
    </div>
    <div class="text-sm mt-2 mono">status: ${r.status} · time: ${fmt(r.time)}</div>
    ${r.err ? `<div class="text-sm mt-1 mono" style="color:${color}">error: ${r.err}</div>` : ``}
  </div>`;
}

async function run() {
  // Environment panel
  const env = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "n/a",
    when: new Date().toISOString()
  };
  $("#env_body").textContent = JSON.stringify(env, null, 2);

  // Probes
  const results = await Promise.all(checks.map(probe));
  $("#probes").innerHTML = results.map(cardHTML).join("");

  // CSP (very light heuristic): see if a CSP meta tag exists OR (preferred) we’re on HTTPS and
  // Cloudflare Pages sent CSP via headers (we can’t read headers in JS, so we just nudge here).
  const metaCsp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const cspMsg = metaCsp
    ? "CSP meta tag present (good for local preview)."
    : "Assuming CSP via Cloudflare Pages headers (best practice).";
  $("#csp_check").textContent = cspMsg;

  // HTTPS
  const httpsOK = location.protocol === "https:";
  $("#https_check").textContent = httpsOK ? "HTTPS in use." : "Not using HTTPS (enable before production).";
}

run();
