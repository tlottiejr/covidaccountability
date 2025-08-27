// Minimal helper to show messages consistently
function setStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
}

// 1) Populate the states dropdown from your API
function normalizeStates(json) {
  let arr = [];
  if (Array.isArray(json)) arr = json;
  else if (Array.isArray(json?.states)) arr = json.states;
  else if (Array.isArray(json?.rows)) arr = json.rows;
  else if (Array.isArray(json?.result)) arr = json.result;
  else arr = [];

  // Normalize field names so the UI doesn't care about DB column names
  return arr.map(s => ({
    state_code: s.state_code || s.code || s.abbr || s.STATE_CODE || "",
    name: s.name || s.board_name || s.state_name || s.STATE_NAME || s.state || s.state_code || "",
    complaint_form_url: s.complaint_form_url || s.url || s.complaint_url || null,
    status: s.status || "ok",
  }));
}

async function loadStates() {
  const select = document.getElementById("state");
  try {
    const res = await fetch("/api/states", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`States request failed: ${res.status}`);
    const json = await res.json();

    const states = normalizeStates(json).sort((a, b) =>
      (a.name || a.state_code).localeCompare(b.name || b.state_code)
    );

    // Reset options
    select.innerHTML = '<option value="" disabled selected>Select your state…</option>';

    for (const s of states) {
      if (!s.state_code) continue;
      const opt = document.createElement("option");
      opt.value = s.state_code;
      opt.textContent = s.name ? `${s.name} (${s.state_code})` : s.state_code;
      if (s.complaint_form_url) opt.dataset.url = s.complaint_form_url;
      opt.dataset.prefillMode = s.prefill_mode || "none";
      opt.dataset.prefillTpl  = s.prefill_template || "";
      if (s.status && s.status !== "ok") {
        opt.disabled = true;
        opt.textContent += " — temporarily unavailable";
      }
      select.appendChild(opt);
    }

    if (states.length === 0) {
      console.warn("API returned no states or an unexpected shape:", json);
      setStatus("No states yet — try again shortly.", "warn");
    } else {
      setStatus("States loaded.", "ok");
    }
  } catch (err) {
    console.error(err);
    setStatus("Could not load states. Try again later.", "error");
  }
}

// 2) When a state is selected, show the official link
function attachStateLinkHandler() {
  const select = document.getElementById("state");
  const wrap = document.getElementById("boardLinkWrap");
  const link = document.getElementById("boardLink");

  select.addEventListener("change", () => {
    const opt = select.selectedOptions[0];
    const url = opt?.dataset?.url || "";
    if (url) {
      link.href = url;
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
  });
}

// 3) Handle form submit (will work once POST /api/report exists)
function download(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function toPlainText(rec) {
  return [
    `State: ${rec.state_name || rec.state_code || "N/A"}`,
    rec.board_url ? `Official form: ${rec.board_url}` : `Official form: N/A`,
    rec.name ? `Name: ${rec.name}` : null,
    rec.email ? `Email: ${rec.email}` : null,
    "",
    "Details:",
    rec.details || ""
  ].filter(Boolean).join("\n");
}

function buildPrefillUrl(base, rec, mode, tpl) {
  if (mode !== 'query' || !tpl) return base;
  return base + tpl
    .replace('{name}', encodeURIComponent(rec.name || ''))
    .replace('{email}', encodeURIComponent(rec.email || ''))
    .replace('{details}', encodeURIComponent(rec.details || ''));
}

function attachSubmitHandler() {
    
  const form = document.getElementById("reportForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const REQUIRE_TURNSTILE = true; // set false if you want to keep widget but not block
    if (REQUIRE_TURNSTILE) {
    const token = document.querySelector('input[name="cf-turnstile-response"]')?.value || "";
    const vr = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
    }).then(r => r.json()).catch(() => ({ success: false }));

    if (!vr.success) {
        setStatus("Please complete the verification (Turnstile).", "error");
        return;
    }
    }

    const select = document.getElementById("state");
    const opt = select.selectedOptions[0];
    const state_code = select.value || null;
    const state_name = opt?.textContent?.replace(/\s+\([A-Z]{2}\)\s*$/, "") || null;
    const board_url = opt?.dataset?.url || null;
    const prefill_mode = opt?.dataset?.prefillMode || 'none';
    const prefill_tpl = opt?.dataset?.prefillTpl || '';

    const name = document.getElementById("name").value.trim() || null;
    const email = document.getElementById("email").value.trim() || null;
    const details = document.getElementById("details").value.trim();

    if (!details || details.length < 10) {
      return setStatus("Please add details (at least 10 characters).", "error");
    }

    const record = {
      state_code, state_name, board_url, name, email, details,
      captured_at: new Date().toISOString(),
      note: "Local-only. Not sent to server."
    };

    const wantDownload = document.getElementById("optDownload")?.checked;
    const wantCopy = document.getElementById("optCopy")?.checked;

    if (wantDownload) {
      const filename = `CAN-report-${state_code || "NA"}-${Date.now()}.json`;
      download(filename, JSON.stringify(record, null, 2));
    }
    if (wantCopy) {
      const ok = await copyToClipboard(toPlainText(record));
      if (!ok) setStatus("Could not copy to clipboard (browser blocked).", "warn");
    }

    let dest = board_url;
    if (dest) dest = buildPrefillUrl(dest, record, prefill_mode, prefill_tpl);

    if (dest) {
      window.open(dest, "_blank", "noopener");
      setStatus("Opening the official state form. Your info stayed on your device.", "ok");
    } else {
      setStatus("No official link yet for this state. Your info stayed on your device.", "warn");
    }

    form.reset();
    document.getElementById("boardLinkWrap").hidden = true;
  });
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  loadStates();
  attachStateLinkHandler();
  attachSubmitHandler();
});