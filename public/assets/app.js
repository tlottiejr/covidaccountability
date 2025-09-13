// Rollback: simple, robust loader; primary/first link is used for the button.
// Extra links are shown as plain hyperlinks below. Button falls back if verify/API fails.
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
  let current = null;       // current state object
  let mainLink = null;      // chosen primary/first link

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

  const fetchText = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const parseStates = (txt) => {
    const j = JSON.parse(txt.replace(/^\uFEFF/, ''));
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.states)) return j.states;
    return [];
  };

  // ---------- data load (robust) ----------
  async function loadStates() {
    // (1) API if present
    try {
      const txt = await fetchText('/api/states');
      const j = JSON.parse(txt);
      if (Array.isArray(j) && j.length) {
        if (!j[0].links) {
          const by = {};
          j.forEach(r => {
            by[r.code] ||= { code: r.code, name: r.name, links: [] };
            if (r.link) by[r.code].links.push({
              board: r.board || r.name || 'Board',
              url:   r.link,
              primary: by[r.code].links.length === 0
            });
          });
          return Object.values(by);
        }
        return j;
      }
    } catch (_) {}

    // (2) Static JSON (multiple fallback paths)
    const candidates = [
      '/assets/state-links.json',
      'assets/state-links.json',
      '/public/assets/state-links.json',
      './assets/state-links.json'
    ];
    for (const p of candidates) {
      try {
        const txt = await fetchText(p);
        const states = parseStates(txt);
        if (Array.isArray(states) && states.length) return states;
      } catch (_) {}
    }
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

    // extra links
    els.moreLinks.innerHTML = '';
    const extras = links.filter(l => l && l !== mainLink);
    if (extras.length) {
      els.moreLinksWrap.style.display = '';
      extras.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = l.board || l.url;
        li.appendChild(a);

        const span = document.createElement('span');
        span.className = 'small';
        span.style.marginLeft = '6px';
        span.textContent = `(${hostOf(l.url)})`;
        li.appendChild(span);

        els.moreLinks.appendChild(li);
      });
    } else {
      els.moreLinksWrap.style.display = 'none';
    }

    const enabled = Boolean(mainLink?.url);
    els.openBtn.disabled = !enabled;
    els.openBtn.setAttribute('aria-disabled', String(!enabled));
    setBadge(enabled ? 'OK' : '—', enabled ? 'ok' : '');
  }

  // ---------- button flow (Turnstile with graceful fallback) ----------
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
      // graceful fallback so users aren’t blocked
      setBadge('Opening (no verify)…', 'ok');
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

    // optional helpers
    els.copyText?.addEventListener('click', () => {
      const lines = [
        `State: ${current?.name || '—'} (${current?.code || '—'})`,
        `Board: ${mainLink?.board || '—'}`,
        `URL: ${mainLink?.url || '—'}`,
        '',
        'Details:',
        els.detailsInput?.value || '—'
      ];
      const s = lines.join('\n');
      navigator.clipboard?.writeText(s).catch(()=>{});
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
