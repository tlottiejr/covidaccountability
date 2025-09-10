/* public/assets/app.js — multi-link aware portal logic */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName: $('#stateName'),
    stateUrl: $('#stateUrl'),
    stateHost: $('#stateHost'),
    stateStatus: $('#stateStatus'),
    openBtn: $('#openBtn'),
    reportBtn: $('#reportBtn'),
    saveJson: $('#saveJson'),
    copyText: $('#copyText'),
    detailsInput: $('#detailsInput')
  };

  let STATES = [];        // [{ code, name, links:[{board,url,source,primary}], unavailable? }]
  let selected = null;    // current state object
  let selectedLinkUrl = ""; // chosen complaint URL for the selected state

  // ---- fetch helpers ----
  async function fetchJSON(url, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Normalize any of the three data shapes into our target shape
  function normalizeData(raw) {
    // Case A: our new format already
    if (Array.isArray(raw) && raw.length && raw[0].links) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: (s.links || []).map(l => ({
          board: l.board || 'Official Complaint Link',
          url: l.url || '',
          source: l.source || '',
          primary: !!l.primary
        })),
        unavailable: !s.links || s.links.length === 0
      }));
    }
    // Case B: legacy API /api/states -> [{code,name,link,unavailable}]
    if (Array.isArray(raw) && raw.length && ('link' in raw[0] || 'unavailable' in raw[0])) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !!s.unavailable
      }));
    }
    // Case C: legacy /assets/states.json -> list of {code,name,link?}
    if (Array.isArray(raw) && raw.length && ('code' in raw[0] && 'name' in raw[0])) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !s.link
      }));
    }
    return [];
  }

  async function loadStates() {
    // Try new multi-link seed first
    try {
      const a = await fetchJSON('/assets/state-links.json');
      const norm = normalizeData(a);
      if (norm.length) return norm;
    } catch {}
    // Fallback: API
    try {
      const b = await fetchJSON('/api/states');
      const norm = normalizeData(b);
      if (norm.length) return norm;
    } catch {}
    // Last resort: legacy static
    try {
      const c = await fetchJSON('/assets/states.json');
      const norm = normalizeData(c);
      if (norm.length) return norm;
    } catch {}
    return [];
  }

  function setBadge(text, danger = false) {
    els.stateStatus.innerHTML = `<span class="badge${danger ? ' danger' : ''}">${text}</span>`;
  }

  function renderLinks(state) {
    const container = els.stateUrl;
    container.innerHTML = '';
    selectedLinkUrl = '';

    if (!state || !state.links || state.links.length === 0) {
      container.innerHTML = `<span class="small">Not available yet</span>`;
      els.stateHost.textContent = '—';
      els.openBtn.disabled = true;
      setBadge('Unavailable', true);
      return;
    }

    // Choose default link (primary or first)
    const defaultIndex = Math.max(0, state.links.findIndex(l => l.primary));
    selectedLinkUrl = state.links[defaultIndex].url;

    if (state.links.length === 1) {
      const only = state.links[0];
      container.innerHTML = `<a href="${only.url}" target="_blank" rel="noopener">${only.url}</a><div class="small">${only.board || ''}</div>`;
    } else {
      // Multiple: build radio list
      const radios = state.links.map((l, idx) => {
        const id = `linkChoice-${state.code}-${idx}`;
        const checked = idx === defaultIndex ? 'checked' : '';
        return `
          <div style="margin:6px 0;">
            <label>
              <input type="radio" name="linkChoice-${state.code}" id="${id}" value="${l.url}" ${checked}/>
              <strong>${l.board ? l.board : 'Official Complaint Link'}</strong>
              <div class="small" style="margin-left:24px;">${l.url}</div>
            </label>
          </div>`;
      }).join('');
      container.innerHTML = radios;
      // Wire up change
      container.querySelectorAll(`input[type="radio"][name="linkChoice-${state.code}"]`).forEach(r => {
        r.addEventListener('change', (e) => {
          selectedLinkUrl = e.target.value;
          try {
            const u = new URL(selectedLinkUrl);
            els.stateHost.textContent = u.hostname;
          } catch { els.stateHost.textContent = '—'; }
        });
      });
    }

    // Host + status
    try {
      const u = new URL(selectedLinkUrl);
      els.stateHost.textContent = u.hostname;
    } catch { els.stateHost.textContent = '—'; }
    setBadge('OK');
    els.openBtn.disabled = false;
  }

  function renderState(state) {
    selected = state || null;
    els.stateName.textContent = selected ? selected.name : '—';
    renderLinks(selected);
  }

  function populateSelect(data) {
    els.stateSelect.innerHTML = '';
    // Sort by name for UX
    data.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = `${s.name} (${s.code})`;
      els.stateSelect.appendChild(opt);
    });
  }

  async function verifyTurnstile() {
    // If a token is present, verify it; otherwise allow (keeps portal functional if widget not present)
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    const token = input && input.value ? input.value : null;
    if (!token) return true;
    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      return !!json?.success;
    } catch {
      return false;
    }
  }

  // ---- wire up events ----
  els.openBtn?.addEventListener('click', async () => {
    if (!selectedLinkUrl) return;
    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', true); return; }
    setBadge('Opening…');
    window.open(selectedLinkUrl, '_blank', 'noopener');
    setBadge('Opened');
  });

  els.stateSelect?.addEventListener('change', () => {
    const code = els.stateSelect.value;
    const s = STATES.find(x => x.code === code);
    renderState(s);
  });

  // ---- init ----
  (async function init() {
    STATES = await loadStates();
    populateSelect(STATES);
    // Select first by default
    const first = STATES[0] || null;
    if (first) {
      els.stateSelect.value = first.code;
      renderState(first);
    } else {
      setBadge('No data', true);
      els.openBtn.disabled = true;
    }
  })();
})();

