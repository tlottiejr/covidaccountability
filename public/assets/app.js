// public/assets/app.js
(function () {
  const $ = (sel) => document.querySelector(sel);

  const ui = {
    select: $("#stateSelect"),
    name: $("#stateName"),
    url: $("#stateUrl"),
    host: $("#stateHost"),
    status: $("#stateStatus"),
    openBtn: $("#openBtn"),
  };

  const timeout = (ms, p) =>
    Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);

  async function fetchJson(url) {
    const r = await timeout(8000, fetch(url, { headers: { accept: "application/json" } }));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function loadStates() {
    if (!ui.select) return;
    ui.select.innerHTML = `<option>Loading states...</option>`;
    try {
      const data =
        (await fetchJson("/api/states").catch(() => null)) ||
        (await fetchJson("/assets/states.json"));
      const states = normalizeStates(data);
      populate(states);
    } catch {
      ui.select.innerHTML = `<option disabled selected>Failed to load states</option>`;
    }
  }

  function normalizeStates(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s) => ({
        code: (s.code || s.abbr || "").toString().trim(),
        name: (s.name || s.state || "").toString().trim(),
        link: (s.link || s.url || "").toString().trim(),
        unavailable: Number(s.unavailable || 0),
      }))
      .filter((s) => s.code && s.name);
  }

  function populate(states) {
    ui.select._states = states;
    ui.select.innerHTML =
      `<option value="" selected>Select your state…</option>` +
      states
        .map(
          (s) =>
            `<option value="${s.code}">${s.name} (${s.code})${
              s.unavailable ? " — unavailable" : ""
            }</option>`
        )
        .join("");

    ui.select.addEventListener("change", onSelect);
    ui.openBtn.addEventListener("click", openBoard);
    ui.openBtn.disabled = true;

    ui.name.textContent = "—";
    ui.url.innerHTML = `<span class="small">Not available yet</span>`;
    ui.host.textContent = "—";
    ui.status.innerHTML = `<span class="badge">—</span>`;
  }

  function onSelect() {
    const code = ui.select.value;
    const s = (ui.select._states || []).find((x) => x.code === code);
    if (!s) return;

    ui.name.textContent = s.name;
    if (s.link) {
      ui.url.innerHTML = `<a href="${s.link}" target="_blank" rel="noopener">${s.link}</a>`;
      try { ui.host.textContent = new URL(s.link).host; } catch { ui.host.textContent = "—"; }
    } else {
      ui.url.innerHTML = `<span class="small">Not available yet</span>`;
      ui.host.textContent = "—";
    }

    const ok = !!s.link && !s.unavailable;
    ui.status.innerHTML = ok
      ? `<span class="badge">OK</span>`
      : `<span class="badge" style="background: var(--danger); color:#fff;">Unavailable</span>`;
    ui.openBtn.disabled = !ok;
  }

  function openBoard() {
    const code = ui.select.value;
    const s = (ui.select._states || []).find((x) => x.code === code);
    if (s && s.link) window.open(s.link, "_blank", "noopener");
  }

  document.addEventListener("DOMContentLoaded", loadStates);
})();

