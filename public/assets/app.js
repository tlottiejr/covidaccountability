// Small toast
function toast(msg, ms = 2400) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// Try /api/states then fallback to /assets/states.json
async function fetchStates() {
  const tryApi = async () => {
    const r = await fetch('/api/states', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (r.status === 204) throw new Error('norows');
    if (!r.ok) throw new Error('bad');
    return r.json();
  };
  try {
    return await tryApi();
  } catch {
    const r = await fetch('/assets/states.json', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('fallback-missing');
    return r.json();
  }
}

// Portal initialization
async function initPortal() {
  const sel = document.getElementById('stateSelect');
  const info = document.getElementById('boardInfo');
  const openBtn = document.getElementById('openBoardBtn');
  const form = document.getElementById('reportForm');
  if (!sel || !form) return;

  // 1) Load states
  sel.innerHTML = `<option value="">Loading states…</option>`;
  let list = [];
  try {
    list = await fetchStates();
  } catch (e) {
    sel.innerHTML = `<option value="">Failed to load states</option>`;
    console.error(e);
    return;
  }

  // Normalize & sort
  const states = list
    .map(s => ({
      code: s.code || s.abbr || "",
      name: s.name || s.label || s.code || "Unknown",
      link: s.link || "",
      unavailable: !!(s.unavailable)
    }))
    .sort((a,b) => a.name.localeCompare(b.name));

  sel.innerHTML = `<option value="">Select your state…</option>`;
  for (const s of states) {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.textContent = s.name + (s.unavailable ? " — temporarily unavailable" : "");
    if (s.unavailable) opt.disabled = true;
    opt.dataset.link = s.link || "";
    opt.dataset.name = s.name;
    sel.appendChild(opt);
  }

  // 2) Selection → info panel
  function renderInfo() {
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) {
      info.innerHTML = `<div class="badge">Pick a state to see its board details.</div>`;
      openBtn.disabled = true;
      return;
    }
    const link = opt.dataset.link || "";
    const name = opt.dataset.name || opt.textContent;
    const unavailable = opt.disabled;

    info.innerHTML = `
      <div class="kv">
        <div>Board</div><div>${name}</div>
        <div>URL</div><div>${link ? `<a href="${link}" target="_blank" rel="noopener">${link}</a>` : `<span class="badge">Not available yet</span>`}</div>
        <div>Status</div><div>${unavailable ? `<span class="badge">Temporarily unavailable</span>` : `<span class="badge">Available</span>`}</div>
      </div>
    `;
    openBtn.disabled = !link || unavailable;
  }
  sel.addEventListener('change', renderInfo);
  renderInfo();

  // 3) Open board button
  openBtn.addEventListener('click', () => {
    const opt = sel.selectedOptions[0];
    const link = opt?.dataset?.link;
    if (!link) return;
    window.open(link, '_blank', 'noopener');
  });

  // 4) Submit with Turnstile verification then open board (and optional actions)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) { toast('Please choose your state.'); return; }

    // Turnstile token
    if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') {
      toast('Verification is still loading. Please wait a moment.'); return;
    }
    const token = window.turnstile.getResponse();
    if (!token) { toast('Please complete the verification.'); return; }

    // Server verify
    try {
      const r = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const j = await r.json();
      if (!j.success) { toast('Verification failed. Try again.'); return; }
    } catch {
      toast('Network error verifying.'); return;
    }

    // Open the board
    const link = opt.dataset.link;
    if (link) window.open(link, '_blank', 'noopener');

    // Optional local copy
    const dl = document.getElementById('optDownload');
    const cp = document.getElementById('optCopy');

    if (dl?.checked) {
      const payload = {
        name: document.getElementById('name')?.value?.trim() || '',
        email: document.getElementById('email')?.value?.trim() || '',
        details: document.getElementById('details')?.value?.trim() || '',
        state: opt.value, state_name: opt.dataset.name || '',
        ts: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${opt.value}-${Date.now()}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      toast('Saved local copy.');
    }

    if (cp?.checked) {
      const txt = `State: ${opt.value} (${opt.dataset.name||''})
Name: ${document.getElementById('name')?.value||''}
Email: ${document.getElementById('email')?.value||''}
Details:
${document.getElementById('details')?.value||''}`;
      try { await navigator.clipboard.writeText(txt); toast('Copied to clipboard.'); } catch {}
    }

    toast('Opened official board link.');
  });
}

// Auto-run when portal exists
document.addEventListener('DOMContentLoaded', initPortal);




