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

  // Optional / legacy controls (if present in this template)
  const reportText  = document.getElementById('reportText');
  const copyBtn     = document.getElementById('copyText');
  const saveBtn     = document.getElementById('saveJson');
  const reportBtn   = document.getElementById('reportBtn'); // e.g., open guidance

  // ----- State -----
  let STATE_LINKS = [];                 // [{code,name,links:[{board,url,primary?,unavailable?}]}]
  let selected = { state: null, link: null };

  // ----- Utilities -----
  const say = (msg) => { if (srStatus) srStatus.textContent = msg; else console.log('[status]', msg); };
  const esc = (s='') => s.toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const hostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };
  const byName = (a,b) => (a.name||'').localeCompare(b.name||'');
  const up = (s) => String(s||'').trim().toUpperCase();

  const enableOpen = () => { if (openBtn) { openBtn.disabled = false; openBtn.setAttribute('aria-disabled', 'false'); } };
  const disableOpen = () => { if (openBtn) { openBtn.disabled = true; openBtn.setAttribute('aria-disabled', 'true'); } };

  // ---- Normalize data shapes ----
  const normLink = (x) => {
    if (!x) return null;
    if (typeof x === 'string') return { board: 'Board', url: x, primary: true };
    const url = x.url || x.href || x.link || '';
    if (!url) return null;
    return {
      board: x.board || x.name || x.title || 'Board',
      url,
      primary: !!x.primary,
      unavailable: !!x.unavailable
    };
  };

  const normState = (s) => {
    if (!s) return null;
    const code = s.code || s.abbr || s.state || '';
    const name = s.name || s.title || s.stateName || '';

    let links = [];
    if (Array.isArray(s.links))      links = s.links.map(normLink).filter(Boolean);
    else if (Array.isArray(s.boards)) links = s.boards.map(normLink).filter(Boolean);
    else if (s.link || s.url) {
      const single = normLink({ board: s.board || name || 'Board', url: s.link || s.url, primary: true, unavailable: s.unavailable });
      if (single) links = [single];
    }

    return { code: up(code), name: String(name || code || '').trim(), links };
  };

  // ---- Loaders (canonical → API → legacy) ----
  async function loadJson(url) {
    const res = await fetch(url + (url.includes('?') ? '' : `?v=${Date.now()}`), { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  }

  async function loadStateLinks() {
    // 1) canonical file
    try {
      const data = await loadJson('/assets/state-links.json');
      const out = (Array.isArray(data) ? data : []).map(normState).filter(Boolean);
      if (out.length) return out;
    } catch {}

    // 2) optional API (D1)
    try {
      const data = await loadJson('/api/states');
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.states) ? data.states : []);
      const out = arr.map(normState).filter(Boolean);
      if (out.length) return out;
    } catch {}

    // 3) legacy file
    try {
      const data = await loadJson('/assets/states.json');
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.states) ? data.states : []);
      const out = arr.map(normState).filter(Boolean);
      if (out.length) return out;
    } catch {}

    throw new Error('No state links source available');
  }

  // ---- Rendering ----
  function renderStateOptions() {
    if (!stateSelect) return;
    stateSelect.innerHTML = '<option value="">— Select your state —</option>';
    for (const s of STATE_LINKS) {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = s.name;
      stateSelect.appendChild(opt);
    }
  }

  function findStateByCodeOrName(value) {
    if (!value) return null;
    const code = up(value);
    let st = STATE_LINKS.find(s => up(s.code) === code);
    if (st) return st;
    // fallback by visible name
    st = STATE_LINKS.find(s => up(s.name) === up(stateSelect?.options[stateSelect.selectedIndex]?.text || ''));
    return st || null;
  }

  function renderBoardsFor(stateCodeValue) {
    if (!boardsEl) return;

    boardsEl.innerHTML = '';
    selected.link = null;

    const st = findStateByCodeOrName(stateCodeValue);
    selected.state = st || null;

    if (!st || !Array.isArray(st.links) || st.links.length === 0) {
      const p = document.createElement('p');
      p.className = 'small';
      p.textContent = 'No boards available for this state.';
      boardsEl.appendChild(p);
      disableOpen();
      return;
    }

    st.links.forEach((link, idx) => {
      const id = `board-${st.code}-${idx}`;
      const url = String(link.url || '');
      const boardName = String(link.board || 'Board');
      const host = hostOf(url);
      const unavailable = !!link.unavailable;

      const row = document.createElement('div');
      row.className = 'radio-row';

      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'board';
      inp.id = id;
      inp.value = url;
      if (link.primary) inp.setAttribute('data-primary', '1');

      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.className = 'radio-label';
      lab.innerHTML = `
        <span class="radio-title">${esc(boardName)}</span>
        <span class="radio-sub">${esc(host)}</span>
        ${unavailable ? `<span class="badge badge-warn">(temporarily unavailable)</span>` : ''}
      `;

      inp.addEventListener('change', () => {
        selected.link = link;
        enableOpen();
        say(`Selected ${boardName}${host ? ' at ' + host : ''}. Open button enabled.`);
      });

      row.appendChild(inp);
      row.appendChild(lab);
      boardsEl.appendChild(row);
    });

    // Preselect primary or first
    const primary = boardsEl.querySelector('input[type=radio][data-primary="1"]') || boardsEl.querySelector('input[type=radio]');
    if (primary) {
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

    // Open a blank tab synchronously; then navigate it. No "noopener" feature string here,
    // because some browsers return null which would trigger unwanted fallbacks.
    let win = null;
    try { win = window.open('', '_blank'); } catch { win = null; }

    if (win && !win.closed) {
      try { win.opener = null; } catch {}
      try { win.location.href = url; } catch {}
      // Kick off verification in the background
      verifyTurnstileTokenAsync();
      say('Opening board site in a new tab.');
      return;
    }

    // Popup blocked: DO NOT navigate this tab.
    say('Popup blocked — allow popups for this site to open the board in a new tab.');
  });

  // ---- Optional helpers (only bind if the elements exist) ----
  copyBtn?.addEventListener('click', async () => {
    try {
      if (!reportText) return;
      await navigator.clipboard.writeText(reportText.value || '');
      say('Report copied to clipboard.');
    } catch {
      say('Could not copy to clipboard.');
    }
  });

  saveBtn?.addEventListener('click', () => {
    if (!reportText) return;
    const payload = {
      state: {
        code: selected.state?.code || '',
        name: selected.state?.name || ''
      },
      board: {
        name: selected.link?.board || '',
        url: selected.link?.url || ''
      },
      report: reportText.value || '',
      savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `complaint-${selected.state?.code || 'state'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    say('Saved local JSON.');
  });

  reportBtn?.addEventListener('click', () => {
    // Keep this as a harmless helper — if your template uses it, it works; if not, it does nothing.
    try { reportText?.focus(); } catch {}
  });

  // ---- Init ----
  (async () => {
    try {
      const data = await loadStateLinks();
      STATE_LINKS = data.slice().sort(byName);
      renderStateOptions();
      disableOpen();
      say('State list loaded. Choose your state, then a board.');
    } catch (e) {
      console.error(e);
      say('Could not load state links. Please try again later.');
    }
  })();

  stateSelect?.addEventListener('change', () => {
    const code = stateSelect.value;
    renderBoardsFor(code);
    const label = stateSelect.options[stateSelect.selectedIndex]?.text || '';
    say(`State ${label} selected.`);
  });
})();
