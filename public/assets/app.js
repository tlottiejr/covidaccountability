/* LASTWORKING portal logic
   - loads state-links.json
   - single selected link (primary/first); extras shown as “Direct links”
   - button uses Turnstile verify
*/
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName:   $('#stateName'),
    stateUrl:    $('#stateUrl'),
    stateHost:   $('#stateHost'),
    stateStatus: $('#stateStatus'),
    openBtn:     $('#openBtn'),
    directWrap:  $('#directLinksWrap'),
    directList:  $('#directLinks'),

    saveJson:    $('#saveJson'),
    copyText:    $('#copyText'),
    nameInput:   $('#nameInput'),
    emailInput:  $('#emailInput'),
    detailsInput:$('#detailsInput')
  };

  let STATES = [];
  let selected = null;
  let mainLink = null;

  // ---------- helpers ----------
  const setBadge = (text, cls = '') => {
    const span = els.stateStatus.querySelector('.badge') || document.createElement('span');
    span.className = `badge ${cls}`.trim();
    span.textContent = text;
    if (!els.stateStatus.contains(span)) els.stateStatus.appendChild(span);
  };
  const getHost = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
  const enableOpen = (enabled) => {
    els.openBtn.disabled = !enabled;
    els.openBtn.setAttribute('aria-disabled', String(!enabled));
  };

  const fetchText = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  const parseMaybeWrapped = (txt) => {
    const json = JSON.parse(txt.replace(/^\uFEFF/, ''));
    return Array.isArray(json) ? json : (Array.isArray(json.states) ? json.states : []);
  };

  const pickPrimary = (links=[]) => {
    const i = links.findIndex(l => l && l.primary === true);
    return i >= 0 ? links[i] : (links[0] || null);
  };

  // ---------- data load ----------
  async function loadStates() {
    // Try API first (optional)
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

    // Static JSON with fallbacks
    const candidates = [
      '/assets/state-links.json',
      'assets/state-links.json',
      '/public/assets/state-links.json',
      './assets/state-links.json'
    ];
    for (const path of candidates) {
      try {
        const txt = await fetchText(path);
        const states = parseMaybeWrapped(txt);
        if (Array.isArray(states) && states.length) return states;
      } catch (_) {}
    }
    return [];
  }

  // ---------- UI ----------
  function renderOptions(states) {
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
    selected = state || null;
    const links = state?.links || [];
    mainLink = pickPrimary(links);

    // header fields
    els.stateName.textContent = mainLink?.board || state?.name || '—';
    els.stateUrl.innerHTML = mainLink?.url
      ? `<a href="${mainLink.url}" target="_blank" rel="noopener">${mainLink.url}</a>`
      : '<span class="small">Not available yet</span>';
    els.stateHost.textContent = mainLink?.url ? getHost(mainLink.url) : '—';

    // direct links list for extras
    const extras = links.filter(l => l && l !== mainLink);
    els.directList.innerHTML = '';
    if (extras.length) {
      els.directWrap.style.display = '';
      extras.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.url; a.target = '_blank'; a.rel='noopener';
        a.textContent = l.board || l.url;
        li.appendChild(a);
        const hint = document.createElement('span');
        hint.className = 'small'; hint.style.marginLeft = '6px';
        hint.textContent = `(${getHost(l.url) || '—'})`;
        li.appendChild(hint);
        els.directList.appendChild(li);
      });
    } else {
      els.directWrap.style.display = 'none';
    }

    const ok = Boolean(mainLink?.url);
    enableOpen(ok);
    setBadge(ok ? 'OK' : '—', ok ? 'ok' : '');
  }

  // ---------- verify + open ----------
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

  async function onOpen(ev) {
    ev.preventDefault();
    if (!mainLink?.url) return;
    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', 'error'); return; }
    setBadge('Opening…', 'ok');
    window.open(mainLink.url, '_blank', 'noopener');
  }

  // ---------- export helpers ----------
  function buildReport() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: selected ? { code: selected.code, name: selected.name } : null,
      board: mainLink ? { name: mainLink.board, url: mainLink.url, host: mainLink.url ? getHost(mainLink.url) : null } : null,
      user: { name: els.nameInput?.value || null, email: els.emailInput?.value || null },
      details: els.detailsInput?.value || ''
    };
  }
  function reportToText(r) {
    return [
      `Generated: ${r.generatedAt}`,
      r.state ? `State: ${r.state.name} (${r.state.code})` : `State: —`,
      r.board ? `Board: ${r.board.name}\nURL: ${r.board.url}\nHost: ${r.board.host}` : `Board: —`,
      r.user?.name ? `Name: ${r.user.name}` : '',
      r.user?.email ? `Email: ${r.user.email}` : '',
      '',
      'Details:',
      r.details || '—'
    ].filter(Boolean).join('\n');
  }
  function saveAsTxt(text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'complaint.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- boot ----------
  (async () => {
    try { STATES = await loadStates(); } catch { STATES = []; }
    if (!STATES.length) { setBadge('No data', 'error'); return; }
    renderOptions(STATES);

    els.stateSelect?.addEventListener('change', () => {
      const s = STATES.find(x => x.code === els.stateSelect.value) || null;
      renderState(s);
    });
    els.openBtn?.addEventListener('click', onOpen);

    els.copyText?.addEventListener('click', () => {
      const txt = reportToText(buildReport());
      navigator.clipboard?.writeText(txt).catch(()=>{});
    });
    els.saveJson?.addEventListener('change', () => {
      const txt = reportToText(buildReport());
      saveAsTxt(txt);
    });
  })();
})();

