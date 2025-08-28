// public/app.js
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  function toast(msg, ms=2200){
    let t = $('.toast');
    if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), ms);
  }

  async function safeJson(res){
    const txt = await res.text();
    try { return JSON.parse(txt); } catch {}
    return null;
  }

  async function fetchStates() {
    // Primary: Functions → D1
    const tried = [];
    for (const url of ["/api/states", "/api/states/"]) {
      try {
        const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
        if (!res.ok) { tried.push(`${url} → ${res.status}`); continue; }
        const data = await safeJson(res);
        if (!Array.isArray(data)) { tried.push(`${url} → not array`); continue; }
        return data;
      } catch (e) {
        tried.push(`${url} → ${String(e)}`);
      }
    }
    console.warn("State fetch failed:", tried);
    return [];
  }

  async function loadStates() {
    const sel = $("#state");
    const err = $("#stateError");
    if (!sel) return;

    sel.innerHTML = `<option value="">Loading states…</option>`;

    const states = await fetchStates();

    if (!states.length) {
      sel.innerHTML = `<option value="">Failed to load states</option>`;
      err.textContent = `Could not load /api/states. Check your D1 binding and wrangler.toml.`;
      return;
    }

    sel.innerHTML = `<option value="">Select your state…</option>`;
    for (const s of states) {
      const opt = document.createElement("option");
      opt.value = s.code;
      opt.textContent = `${s.name || s.code}${s.unavailable ? " — temporarily unavailable" : ""}`;
      opt.disabled = !!s.unavailable;
      if (s.link) opt.dataset.link = s.link;
      sel.appendChild(opt);
    }
    err.textContent = "";
  }

  function validState() {
    const sel = $("#state");
    const err = $("#stateError");
    const ok = !!sel.value;
    err.textContent = ok ? "" : "Please choose your state board.";
    return ok;
  }

  async function verifyTurnstile(timeoutMs = 12000) {
    const status = $("#verifyStatus");
    const token = window.turnstile?.getResponse?.() || "";
    if (!token) { status.textContent = "Please complete the verification."; return false; }

    status.textContent = "Verifying…";
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort("timeout"), timeoutMs);

    try {
      const r = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: ac.signal
      });
      clearTimeout(timer);
      const j = await r.json().catch(() => ({}));
      status.textContent = j.success ? "Success!" : "Verification failed.";
      return !!j.success;
    } catch (e) {
      clearTimeout(timer);
      status.textContent = e === "timeout" ? "Taking longer than usual… retrying." : "Network error verifying.";
      return false;
    }
  }

  function saveLocalJSON(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${payload.state || "state"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validState()) return;

    // Verify Turnstile before doing anything else
    const ok = await verifyTurnstile();
    if (!ok) { toast("Could not verify."); return; }

    const sel = $("#state");
    const chosen = sel.selectedOptions[0];
    const link = chosen?.dataset?.link || "";

    // Open the official board link (if we have one)
    if (link) window.open(link, "_blank", "noopener");

    // Optional actions
    const payload = {
      name:   $("#name")?.value?.trim() || "",
      email:  $("#email")?.value?.trim() || "",
      details:$("#details")?.value?.trim() || "",
      state:  sel.value,
      ts:     new Date().toISOString()
    };

    if ($("#optDownload")?.checked) {
      saveLocalJSON(payload);
      toast("Saved local copy.");
    }
    if ($("#optCopy")?.checked) {
      const txt = `State: ${payload.state}\nName: ${payload.name}\nEmail: ${payload.email}\nDetails:\n${payload.details}\n`;
      await navigator.clipboard.writeText(txt).catch(() => {});
      toast("Copied to clipboard.");
    }
    toast("Opened official board link.");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadStates();
    $("#state")?.addEventListener("change", validState);
    $("#reportForm")?.addEventListener("submit", onSubmit);
  });
})();


