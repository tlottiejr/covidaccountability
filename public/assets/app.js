// LASTWORKING behavior + bulletproof data loading.
// Main link = primary(true) or first; extra links shown under "More links".
// Button uses Turnstile; if verify/API fails, we still open to avoid dead ends.
(() => {
  const $ = (s) => document.querySelector(s);

  const els = {
    stateSelect: $('#stateSelect'),
    boardName:   $('#boardName'),
    boardUrl:    $('#boardUrl'),
    boardHost:   $('#boardHost'),
    status:      $('#status'),
    openBtn:     $('#openBtn'),
    moreLinksWrap: $('#moreLinksWrap'),
    moreLinks:     $('#moreLinks'),
    nameInput:   $('#nameInput'),
    emailInput:  $('#emailInput'),
    detailsInput:$('#detailsInput'),
    saveCopy:    $('#saveCopy'),
    copyText:    $('#copyText'),
  };

  let STATES = [];
  let current = null;
  let mainLink = null;

  // ---------- helpers ----------
  const setBadge = (text, kind = '') => {
    let b = els.status.querySelector('.badge');
    if (!b) { b = document.createElement('span'); b.className = 'badge'; els.status.appendChild(b); }
    b.className = `badge ${kind}`.trim();
    b.textContent = text;
  };

  const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
  const primaryOrFirst = (links = []) => {
    const i = links.findIndex(l => l && l.primary === true);
    return links[(i >= 0 ? i : 0)] || null;
  };

  const fetchJson = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const readInlineJson = () => {
    const node = document.getElementById('stateLinksJson');
    if (!node) return null;
    const txt = node.textContent.trim();
    if (!txt) return null;
    try {
      const j = JSON.parse(txt.replace(/^\uFEFF/, ''));
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.states)) return j.states;
    } catch {}
    return null;
  };

  // ---------- data load (robust) ----------
  async function loadStates() {
    // (1) Preferred path + cache buster
    const stamp = Date.now();
    const candidates = [
      `/assets/state-links.json?v=${stamp}`,
      `assets/state-links.json?v=${stamp}`,
      `/public/assets/state-links.json?v=${stamp}`,
      `./assets/state-links.json?v=${stamp}`
    ];

    for (const url of candidates) {
      try {
        const j = await fetchJson(url);
        if (Array.isArray(j) && j.length) return j;
        if (j && Array.isArray(j.states) && j.states.length) return j.states;
      } catch (_) {}
    }

    // (2) Inline fallback (guaranteed if you pasted it in HTML)
    const inline = readInlineJson();
    if (inline && inline.length) return inline;

    return [];
  }

  // ---------- UI ----------
  function fillDropdown(states) {
    els.stateSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a state';
    els.stateSelect.appendChild(ph);

    states.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = s.name;
      els.stateSelect.appendChild(opt);
    });
  }

  function renderState(state) {
    current = state || null;
    const links = state?.links || [];
    mainLink = primaryOrFirst(links);

    els.boardName.textContent = mainLink?.board || state?.name || '—';
    els.boardUrl.innerHTML = mainLink?.url
      ? `<a href="${mainLink.url}" target="_blank" rel="noopener">${mainLink.url}</a>`
      : 'Not available yet';
    els.boardHost.textContent = mainLink?.url ? hostOf(mainLink.url) : '—';

    // Extras
    els.moreLinks.innerHTML = '';
    const extras = links.filter(l => l && l !== mainLink);
    if (extras.length) {
      els.moreLinksWrap.style.display = '';
      extras.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = l.board || l.url;
        li.appendChild(a);
        const hint = document.createElement('span');
        hint.className = 'small';
        hint.style.marginLeft = '6px';
        hint.textContent = `(${hostOf(l.url) || '—'})`;
        li.appendChild(hint);
        els.moreLinks.appendChild(li);
      });
    } else {
      els.moreLinksWrap.style.display = 'none';
    }

    const ok = Boolean(mainLink?.url);
    els.openBtn.disabled = !ok;
    els.openBtn.setAttribute('aria-disabled', String(!ok));
    setBadge(ok ? 'OK' : '—', ok ? 'ok' : '');
  }

  // ---------- button (Turnstile + graceful fallback) ----------
  async function verifyTurnstile() {
    const token = document.querySelector('input[name="cf-turnstile-response"]')?.value || '';
    if (!token) return false;
    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      return !!json?.success;
    } catch { return false; }
  }

  async function onOpenClick(e) {
    e.preventDefault();
    if (!mainLink?.url) return;
    setBadge('Verifying…');
    let ok = false;
    try { ok = await verifyTurnstile(); } catch { ok = false; }
    if (!ok) {
      // Don’t block users if verify/API is flaky
      setBadge('Opening…', 'ok');
      window.open(mainLink.url, '_blank', 'noopener');
      return;
    }
    setBadge('Opening…', 'ok');
    window.open(mainLink.url, '_blank', 'noopener');
  }

  // ---------- boot ----------
  (async () => {
    try { STATES = await loadStates(); } catch { STATES = []; }
    if (!STATES.length) { setBadge('No data', 'error'); return; }
    fillDropdown(STATES);

    els.stateSelect.addEventListener('change', () => {
      const s = STATES.find(x => x.code === els.stateSelect.value) || null;
      renderState(s);
    });
    els.openBtn.addEventListener('click', onOpenClick);

    // simple helpers
    els.copyText?.addEventListener('click', () => {
      const lines = [
        `State: ${current?.name || '—'} (${current?.code || '—'})`,
        `Board: ${mainLink?.board || '—'}`,
        `URL: ${mainLink?.url || '—'}`,
        '',
        'Details:',
        els.detailsInput?.value || '—'
      ];
      navigator.clipboard?.writeText(lines.join('\n')).catch(()=>{});
    });

    els.saveCopy?.addEventListener('change', () => {
      const blob = new Blob(
        [`State: ${current?.name || '—'}\nBoard: ${mainLink?.board || '—'}\nURL: ${mainLink?.url || '—'}\n\nDetails:\n${els.detailsInput?.value || '—'}`],
        { type: 'text/plain;charset=utf-8' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'complaint.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  })();
})();


