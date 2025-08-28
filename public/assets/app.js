// public/app.js
(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let STATE_LIST = [];
  let SELECT     = null;
  let BTN_OPEN   = null;

  function toast(msg, ms = 2200) {
    let t = $('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), ms);
  }

  function hostFromUrl(u) {
    try { return new URL(u).host; } catch { return ''; }
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  async function fetchStates() {
    const res = await fetch('/api/states', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderInfo(state) {
    // state = { code, name, link, unavailable, board_name, last_verified_at, status }
    const nameEl   = $('#boardName');
    const urlEl    = $('#boardUrl');
    const hostEl   = $('#boardHost');
    const statEl   = $('#boardStatus');
    const verifyEl = $('#boardVerified');

    const boardName = state.board_name || `${state.name} medical board`;
    const link      = state.link || '';

    nameEl.textContent = boardName;
    hostEl.textContent = link ? hostFromUrl(link) : '—';

    // URL line
    if (link) {
      urlEl.innerHTML = `<a href="${link}" target="_blank" rel="noopener">${link}</a>`;
    } else {
      urlEl.textContent = 'Not available yet';
    }

    // Status line
    const s = (state.status || '').toLowerCase();
    const u = !!state.unavailable;
    if (u) {
      statEl.textContent = 'Temporarily unavailable';
      statEl.className = 'muted text-warn';
    } else if (s === '404') {
      statEl.textContent = '404 (page not found)';
      statEl.className = 'muted text-warn';
    } else if (s === 'error') {
      statEl.textContent = 'Error (site down or blocked)';
      statEl.className = 'muted text-warn';
    } else {
      statEl.textContent = 'Available';
      statEl.className = 'muted text-ok';
    }

    // Verified
    verifyEl.textContent = fmtDate(state.last_verified_at) || '—';

    // Open button
    BTN_OPEN.disabled = !(link && !u);
    BTN_OPEN.dataset.href = link || '';
  }

  function onStateChange() {
    const code = SELECT.value;
    const state = STATE_LIST.find(x => x.code === code);
    if (state) renderInfo(state);
  }

  async function initStates() {
    SELECT   = $('#state');
    BTN_OPEN = $('#btnOpenBoard');
    if (!SELECT) return;

    // Loading placeholder
    SELECT.innerHTML = `<option value="">Loading states…</option>`;
    BTN_OPEN.disabled = true;

    try {
      STATE_LIST = await fetchStates();
      // clear + placeholder
      SELECT.innerHTML = `<option value="">Select your state…</option>`;
      for (const s of STATE_LIST) {
        const o = document.createElement('option');
        o.value = s.code;
        o.textContent = s.name + (s.unavailable ? ' — temporarily unavailable' : '');
        if (s.unavailable) o.disabled = true;
        SELECT.appendChild(o);
      }

      // preselect first usable
      const first = STATE_LIST.find(s => !s.unavailable) || STATE_LIST[0];
      if (first) {
        SELECT.value = first.code;
        renderInfo(first);
      }

    } catch (e) {
      console.error('states load failed', e);
      SELECT.innerHTML = `<option value="">Failed to load states (open /api/states to debug)</option>`;
    }

    SELECT.addEventListener('change', onStateChange);
    BTN_OPEN.addEventListener('click', () => {
      const href = BTN_OPEN.dataset.href;
      if (href) window.open(href, '_blank', 'noopener');
    });
  }

  // Turnstile verification + optional local save / clipboard
  async function verifyTurnstile({ timeoutMs = 12000 } = {}) {
    const s = $('#verifyStatus');
    if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') {
      s.textContent = 'Verification script not loaded.';
      return { success: false };
    }
    const token = window.turnstile.getResponse();
    if (!token) {
      s.textContent = 'Please complete the verification.';
      return { success: false };
    }
    s.textContent = 'Verifying…';

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    try {
      const r = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const j = await r.json().catch(() => ({ success: false }));
      s.textContent = j.success ? 'Success!' : 'Verification failed.';
      return j;
    } catch (e) {
      clearTimeout(t);
      s.textContent = e === 'timeout' ? 'Taking longer than usual…' : 'Network error verifying.';
      return { success: false };
    }
  }

  function initForm() {
    const form = $('#reportForm');
    if (!form) return;

    const dl = $('#optDownload');
    const cp = $('#optCopy');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      // Must choose a state
      if (!SELECT.value) {
        toast('Choose your state.');
        return;
      }

      // Verify Turnstile
      const v = await verifyTurnstile();
      if (!v.success) {
        toast('Verification failed.');
        return;
      }

      // Open board page
      const chosen = STATE_LIST.find(x => x.code === SELECT.value);
      if (chosen?.link && !chosen.unavailable) {
        window.open(chosen.link, '_blank', 'noopener');
      }

      // Optional local download
      if (dl?.checked) {
        const payload = {
          state: SELECT.value,
          name: $('#name')?.value?.trim() || '',
          email: $('#email')?.value?.trim() || '',
          details: $('#details')?.value?.trim() || '',
          ts: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state || 'state'}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Saved local copy.');
      }

      // Optional clipboard
      if (cp?.checked) {
        const txt = `State: ${SELECT.value}
Name: ${$('#name')?.value || ''}
Email: ${$('#email')?.value || ''}
Details:
${$('#details')?.value || ''}`;
        await navigator.clipboard.writeText(txt).catch(() => {});
        toast('Copied to clipboard.');
      }

      toast('Board page opened.');
    });
  }

  // Header/footer injection (if shell.js exists and placeholders are present, it’ll run; safe no-op otherwise)
  function ensureShell() {
    if (!$('#__header') && !$('#__footer') && typeof window.loadShell !== 'function') return;
    if (typeof window.loadShell === 'function') window.loadShell();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureShell();
    initStates();
    initForm();
  });
})();





