/* app.js — portal behaviors & small helpers */

const $ = (s, r = document) => r.querySelector(s);

function toast(msg, ms = 2200) {
  const t = $(".toast") || Object.assign(document.createElement("div"), { className: "toast" });
  if (!t.isConnected) document.body.appendChild(t);
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

// Try to parse JSON; return null on HTML/non-JSON
async function safeJson(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch {}
  if (/<html|<!doctype/i.test(txt)) return null;
  if (/^\s*\[/.test(txt)) { try { return Function(`return (${txt})`)(); } catch {} }
  return null;
}

async function getStates() {
  const tries = ["/api/states", "/api/states/", "/assets/states.json"];
  let lastErr = null;

  for (const url of tries) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const data = await safeJson(res);
      if (!data) continue;
      const arr = Array.isArray(data) ? data : (data.states || data.data || []);
      if (!Array.isArray(arr)) continue;

      // Normalize
      const states = arr.map(s => ({
        code: s.code || s.abbr || s.id || "",
        name: s.name || s.label || s.state || s.code || "Unknown",
        link: s.link || s.url || s.href || "",
        unavailable: Boolean(s.unavailable || s.disabled || s.down),
      }));
      console.info(`[states] loaded ${states.length}`);
      return states;
    } catch (e) { lastErr = e; }
  }
  throw (lastErr || new Error("Failed to load states"));
}

function bindPortal() {
  const sel   = $("#stateSelect");
  const err   = $("#stateError");
  const info  = $("#stateInfo");
  const name  = $("#boardName");
  const aLink = $("#boardLink");
  const open  = $("#openBoardBtn");
  const submit= $("#submitBtn");

  if (!sel) return;

  const updateInfo = () => {
    const opt   = sel.selectedOptions[0];
    const label = opt?.textContent || "";
    const link  = opt?.dataset?.link || "";
    const down  = opt?.disabled || false;

    if (!opt || !opt.value) {
      info.hidden = true;
      open.disabled = true;
      submit.disabled = true;
      return;
    }
    name.textContent = `Official board: ${label}`;
    aLink.href = link || "#";
    aLink.textContent = link ? link : "No official link set yet";
    info.hidden = false;

    open.disabled = !link || down;
    // allow submit even without a link; we still verify Turnstile & maybe save/copy
    submit.disabled = false;
  };

  sel.addEventListener("change", () => {
    err.textContent = sel.value ? "" : "Please choose your state.";
    updateInfo();
  });

  open.addEventListener("click", () => {
    const link = sel.selectedOptions[0]?.dataset?.link;
    if (link) window.open(link, "_blank", "noopener");
  });

  submit.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!sel.value) { err.textContent = "Please choose your state."; return; }

    const v = await verifyTurnstile();
    if (!v.success) { toast("Verification failed or not ready."); return; }

    const opt = sel.selectedOptions[0];
    const link = opt?.dataset?.link || "";

    if (link) window.open(link, "_blank", "noopener");

    // optional JSON save
    if ($("#optDownload")?.checked) {
      const payload = {
        state_code: sel.value,
        state_free_text: opt?.textContent || "",
        name: $("#name")?.value?.trim() || "",
        email: $("#email")?.value?.trim() || "",
        details: $("#details")?.value?.trim() || "",
        created_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report-${payload.state_code || "state"}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Saved local copy.");
    }

    // optional clipboard
    if ($("#optCopy")?.checked) {
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

  // initial populate
  (async () => {
    try {
      sel.innerHTML = `<option value="">Loading states…</option>`;
      const states = await getStates();
      sel.innerHTML = `<option value="">Select your state…</option>`;
      for (const s of states) {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = s.name + (s.unavailable ? " — temporarily unavailable" : "");
        if (s.unavailable) opt.disabled = true;
        if (s.link) opt.dataset.link = s.link;
        sel.appendChild(opt);
      }
      console.debug("[portal] dropdown ready");
    } catch (e) {
      console.error(e);
      sel.innerHTML = `<option value="">Failed to load states</option>`;
      err.textContent = "Could not load the state list. Open /api/states in a new tab and check the response.";
    }
  })();
}

// Turnstile hardening
async function verifyTurnstile({ timeoutMs = 12000 } = {}) {
  const status = $("#verifyStatus");
  const noWidget = !window.turnstile || typeof window.turnstile.getResponse !== "function";
  if (noWidget) {
    status.textContent = "Verification script not loaded (check site key & allowed domains).";
    return { success: false };
  }
  const token = window.turnstile.getResponse();
  if (!token) {
    status.textContent = "Please complete the verification.";
    return { success: false };
  }
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
    if (e === "timeout") return verifyTurnstile({ timeoutMs: 12000 });
    return { success: false };
  }
}

document.addEventListener("DOMContentLoaded", bindPortal);



