// Complaint Portal client logic
(() => {
  const $ = (s) => document.querySelector(s);

  function toast(msg, ms = 2200) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
  }

  async function verifyTurnstile(timeoutMs = 12000) {
    const status = $("#verifyStatus");
    if (!window.turnstile || typeof window.turnstile.getResponse !== "function") {
      status.textContent = "Verification script not loaded. Check site key & allowed domains.";
      return { success: false };
    }
    const token = window.turnstile.getResponse();
    if (!token) { status.textContent = "Please complete the verification."; return { success: false }; }

    status.textContent = "Verifying…";
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort("timeout"), timeoutMs);

    try {
      const r = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      const j = await r.json().catch(() => ({ success: false }));
      status.textContent = j.success ? "Success!" : "Verification failed.";
      return j;
    } catch (e) {
      clearTimeout(to);
      status.textContent = e === "timeout" ? "Taking longer than usual… retrying." : "Network error verifying.";
      if (e === "timeout") return verifyTurnstile(12000);
      return { success: false };
    }
  }

  async function loadStates() {
    const sel = $("#state");
    const err = $("#stateError");
    if (!sel) return;

    sel.innerHTML = `<option value="">Loading states…</option>`;
    try {
      const res = await fetch("/api/states", { headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const states = await res.json();

      sel.innerHTML = `<option value="">Select your state...</option>`;
      for (const s of states) {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = (s.name || s.code) + (s.unavailable ? " (temporarily unavailable)" : "");
        if (s.unavailable) opt.disabled = true;
        if (s.link) opt.dataset.link = s.link;
        sel.appendChild(opt);
      }
      err.textContent = "";
    } catch (e) {
      console.error("loadStates:", e);
      sel.innerHTML = `<option value="">Failed to load states (check /api/states)</option>`;
      $("#stateError").textContent = "Could not load the state list. Open /api/states in a new tab and check the response.";
    }
  }

  function initForm() {
    const form = $("#reportForm");
    if (!form) return;

    const sel = $("#state");
    const err = $("#stateError");
    const dl  = $("#optDownload");
    const cp  = $("#optCopy");

    sel?.addEventListener("change", () => (err.textContent = ""));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sel.value) { err.textContent = "Please choose your state board."; sel.focus(); return; }

      const v = await verifyTurnstile();
      if (!v.success) { toast("Could not verify."); return; }

      const opt = sel.selectedOptions[0];
      const url = opt?.dataset?.link;
      if (url) window.open(url, "_blank", "noopener");

      if (dl?.checked) {
        const payload = {
          state: sel.value,
          name: $("#name")?.value?.trim() || "",
          email: $("#email")?.value?.trim() || "",
          details: $("#details")?.value?.trim() || "",
          ts: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state || "state"}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast("Saved local copy.");
      }

      if (cp?.checked) {
        const txt = `State: ${sel.value}
Name: ${$("#name")?.value || ""}
Email: ${$("#email")?.value || ""}
Details:
${$("#details")?.value || ""}`;
        await navigator.clipboard.writeText(txt).catch(() => {});
        toast("Copied to clipboard.");
      }

      toast("Opened official board link.");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadStates();
    initForm();
  });
})();

