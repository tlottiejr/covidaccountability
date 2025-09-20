// public/assets/js/health.js

const $ = (sel) => document.querySelector(sel);

const checks = [
  { id: "home",      label: "Home",                   url: "/",                            type: "GET" },
  // NOTE: fixed path: /assets/site.css (not /assets/css/site.css)
  { id: "css",       label: "CSS bundle",             url: "/assets/site.css",             type: "GET" },
  { id: "refs_js",   label: "References JS (if any)", url: "/assets/js/references-page.js", type: "GET" },
  { id: "favicon",   label: "Favicon",                url: "/favicon.ico",                 type: "GET" },
];

function fmt(ms) {
  return `${ms.toFixed(0)} ms`;
}

async function probe({ id, label, url, type = "GET" }) {
  const start = performance.now();
  try {
    const res = await fetch(url, { method: type, cache: "no-store" });
    const t = performance.now() - start;
    return {
      id,
      label,
      ok: res.ok,
      status: res.status,
      ms: t,
      url
    };
  } catch (err) {
    const t = performance.now() - start;
    return {
      id,
      label,
      ok: false,
      status: "NETWORK",
      ms: t,
      url
    };
  }
}

function renderRow({ id, label, ok, ms, status, url }) {
  const item = document.createElement("div");
  item.className = "card small";
  item.setAttribute("data-ok", ok ? "true" : "false");
  item.innerHTML = `
    <div class="row">
      <div>
        <div class="h5">${label}</div>
        <div class="small muted"><code>${url}</code></div>
      </div>
      <div style="text-align:right;">
        <div class="h5" aria-label="Latency">${fmt(ms)}</div>
        <div class="small ${ok ? "good" : "bad"}" aria-label="HTTP status">${ok ? "OK" : status}</div>
      </div>
    </div>
  `;
  return item;
}

async function run() {
  const container = $("#healthStatus");
  container.textContent = ""; // clear

  // Parallel probes, then stable render
  const results = await Promise.all(checks.map(probe));
  results.forEach((r) => container.appendChild(renderRow(r)));

  // Render JSON sources
  const sourcesEl = $("#sources");
  try {
    const sources = await (await fetch("/assets/health/index.json", { cache: "no-store" })).json();
    sourcesEl.textContent = JSON.stringify(sources, null, 2);
  } catch (e) {
    sourcesEl.textContent = "Failed to load /assets/health/index.json";
  }

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
