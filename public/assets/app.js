/* Complaint Portal logic — robust loader + a11y + new-tab-only open
   - New-tab ONLY open (never navigates current tab)
   - Turnstile verify fire-and-forget (non-blocking)
   - Tolerant state-links shapes (canonical file → API → legacy)
   - Optional helpers: save/copy/report if elements exist
*/

(() => {
  // ----- DOM -----
  const stateSelect = document.getElementById('stateSelect');
  const boardsEl    = document.getElementById('boards');
  const openBtn     = document.getElementById('openBtn');
  const srStatus    = document.getElementById('sr-status');
  const reportText  = document.getElementById('reportText');
  const copyBtn     = document.getElementById('copyText');
  const saveBtn     = document.getElementById('saveJson');
  const reportBtn   = document.getElementById('reportBtn');

  // ---- Turnstile render (pull site key from server; tolerate failures) ----
  async function initTurnstile() {
    try {
      const holder = document.querySelector('.cf-turnstile');
      if (!holder) return;
      // If already has a sitekey, let auto-render handle it
      const hasKey = holder.getAttribute('data-sitekey');
      if (hasKey) return;
      const r = await fetch('/api/site-config', { headers: { 'cache-control': 'no-store' } }).catch(() => null);
      const cfg = r ? await r.json().catch(() => ({})) : {};
      const sitekey = cfg?.turnstileSiteKey || '';
      if (!sitekey) return;

      const renderNow = () => {
        try {
          if (window.turnstile && typeof window.turnstile.render === 'function') {
            window.turnstile.render(holder, { sitekey, theme: holder.getAttribute('data-theme') || 'light' });
            return true;
          }
        } catch {}
        return false;
      };
      if (!renderNow()) {
        let tries = 0;
        const id = setInterval(() => { if (renderNow() || ++tries > 20) clearInterval(id); }, 250);
      }
    } catch {}
  }

  // ----- State -----
  let STATE_LINKS = [];                 // [{code,name,links:[{board,url,primary?,unavailable?}]}]
  let selected = { state: null, link: null };

  // ----- Utilities -----
  const say = (msg) => { if (srStatus) srStatus.textContent = msg; else console.log('[status]', msg); };
  const esc = (s='') => s.toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  function hostname(u='') {
    try { return new URL(u).hostname; } catch { return ''; }
  }

  function disableOpen() { openBtn?.setAttribute('disabled', 'true'); }
  function enableOpen()  { openBtn?.removeAttribute('disabled'); }

  function normalizeLinks(input=[]) {
    // tolerate legacy: { code, name, url } or { code, name, links: [...] }
    return (input || []).map((s) => {
      const links = Array.isArray(s.links) ? s.links : (s.url ? [{ board: 'Primary', url: s.url, primary: true }] : []);
      const nlinks = links
        .map(l => ({ board: l.board || 'Primary', url: (l.url || '').trim(), primary: !!l.primary, unavailable: !!l.unavailable }))
        .filter(l => !!l.url);
      return { code: s.code, name: s.name, links: nlinks };
    }).filter(s => s.code && s.name);
  }

  async function loadJson(url) {
    const token = window.__COMMIT_SHA__ || 'dev';
    const res = await fetch(`${url}?v=${token}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('bad_json');
    return res.json();
  }

  async function loadStateLinks() {
    // canonical → /api/states → legacy fallback
    try { STATE_LINKS = normalizeLinks(await loadJson('/assets/state-links.json')); return; } catch {}
    try { STATE_LINKS = normalizeLinks(await loadJson('/api/states')); return; } catch {}
    try { STATE_LINKS = normalizeLinks(await loadJson('/assets/states.json')); return; } catch {}
    STATE_LINKS = [];
  }

  function renderStates() {
    if (!stateSelect) return;
    stateSelect.innerHTML = `<option value="">Select a state…</option>` +
      STATE_LINKS.map(s => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
    stateSelect.disabled = STATE_LINKS.length === 0;
  }

  function renderBoards(state) {
    boardsEl.innerHTML = '';
    selected.link = null;
    if (!state) { disableOpen(); return; }
    const links = (state.links || []);
    boardsEl.innerHTML =
      `<fieldset aria-label="Boards">` +
      links.map((l) => `
        <label class="board-option">
          <input type="radio" name="board" value="${esc(l.url)}" ${l.primary ? 'checked' : ''} ${l.unavailable ? 'disabled' : ''}/>
          <span class="board-name">${esc(l.board)}</span>
          <span class="board-host small">${esc(hostname(l.url))}</span>
          ${l.unavailable ? '<span class="badge">Unavailable</span>' : ''}
        </label>`).join('') +
      `</fieldset>`;
    const primary = boardsEl.querySelector('input[type=radio]:checked') || boardsEl.querySelector('input[type=radio]');
    if (primary && !primary.disabled) {
      primary.checked = true;
      primary.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      disableOpen();
    }
  }

  // ---- Turnstile verify (fire-and-forget; never blocks) ----
  function verifyTurnstileTokenAsync() {
    try {
      const token = window.turnstile?.getResponse?.() || '';
      if (!token) return;
      const payload = JSON.stringify({ token });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/verify-turnstile', blob);
      } else {
        fetch('/api/verify-turnstile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload
        }).catch(() => {});
      }
    } catch {}
  }

  // ---- Open flow: NEW TAB ONLY (do not navigate current tab) ----
  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const url = selected?.link?.url;
    if (!url) return;

    // Open a blank tab synchronously; then navigate it.
    let win = null;
    try { win = window.open('', '_blank'); } catch { win = null; }

    if (win && !win.closed) {
      try { win.opener = null; } catch {}
      try { win.location.href = url; } catch {}
      // Fire analytics beacon (non-blocking, no PII)
      try {
        const payload = JSON.stringify({
          type: 'open_board',
          stateCode: selected?.state?.code || '',
          boardHost: (new URL(url)).host || '',
          date: new Date().toISOString().slice(0,10)
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/event', blob);
        } else {
          fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }).catch(() => {});
        }
      } catch {}
      // Kick off verification in the background
      verifyTurnstileTokenAsync();
      say('Opening board site in a new tab.');
      return;
    }

    // Popup blocked: DO NOT navigate this tab. Try a last-resort new window.
    try {
      const popup = window.open(url, '_blank');
      if (!popup) throw new Error('blocked');
      say('Opening board site in a new tab.');
    } catch {
      say('We tried to open a new tab but the browser blocked it. Enable popups and try again.');
    }
  });

  // ---- Events ----
  stateSelect?.addEventListener('change', (e) => {
    const code = String(e.target.value || '').toUpperCase();
    selected.state = STATE_LINKS.find(s => s.code === code) || null;
    renderBoards(selected.state);
  });

  boardsEl?.addEventListener('change', (e) => {
    const input = e.target?.closest('input[type=radio]');
    if (!input || input.disabled) { disableOpen(); return; }
    selected.link = { url: input.value };
    enableOpen();
  });

  // Optional helpers (if present)
  copyBtn?.addEventListener('click', () => {
    try {
      const txt = reportText?.value || '';
      navigator.clipboard?.writeText(txt);
      say('Copied report text to clipboard.');
    } catch { say('Copy failed.'); }
  });

  saveBtn?.addEventListener('click', () => {
    try {
      const data = { when: new Date().toISOString(), state: selected?.state?.code || '', link: selected?.link?.url || '', text: reportText?.value || '' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'complaint.json';
      a.click();
      say('Saved your draft as complaint.json');
    } catch { say('Save failed.'); }
  });

  reportBtn?.addEventListener('click', () => {
    // no-op placeholder: existing guidance button behavior remains whatever the page had
    say('Opening guidance…');
  });

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', initTurnstile);

  (async () => {
    say('Loading states…');
    await loadStateLinks();
    renderStates();
    say(STATE_LINKS.length ? 'States loaded.' : 'Failed to load states.');
  })();
})();

