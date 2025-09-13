/* Radios + hyperlink under each board; robust loader; no "data source" UI */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName:   $('#stateName'),
    stateUrl:    $('#stateUrl'),
    stateHost:   $('#stateHost'),
    stateStatus: $('#stateStatus'),
    openBtn:     $('#openBtn'),
    saveJson:    $('#saveJson'),
    copyText:    $('#copyText'),
    nameInput:   $('#nameInput'),
    emailInput:  $('#emailInput'),
    detailsInput:$('#detailsInput')
  };

  let STATES = [];
  let selected = null;
  let selectedLinkIdx = 0;

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
    // supports top-level array OR {states:[…]}
    return Array.isArray(json) ? json : (Array.isArray(json.states) ? json.states : []);
  };
  const primaryIndex = (links = []) => {
    const i = links.findIndex(l => l && l.primary === true);
    return i >= 0 ? i : 0;
  };

  // ---------- data load ----------
  async function loadStates() {
    // 1) API (if present)
    try {
      const txt = await fetchText('/api/states');
      const j = JSON.parse(txt);
      if (Array.isArray(j) && j.length) {
        // normalize possible row shape {code,name,link,board}
        if (!j[0].links) {
          const by = {};
          j.forEach(r => {
            by[r.code] ||= { code: r.code, name: r.name, links: [] };
            if (r.link) by[r.code].links.push({
              board:   r.board || r.name || 'Board',
              url:     r.link,
              primary: by[r.code].links.length === 0
            });
          });
          return Object.values(by);
        }
        return j;
      }
    } catch(_) {}

    // 2) Static JSON (your repo file)
    const candidates = ['/assets/state-links.json', '/state-links.json', '/public/assets/state-links.json'];
    for (const path of candidates) {
      try {
        const txt = await fetchText(path);
        const states = parseMaybeWrapped(txt);
        if (Array.isArray(states) && states.length) return states;
      } catch(_) {}
    }

    return [];
  }

  // ---------- UI ----------
  function renderStateOptions(states) {
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

  function renderLinksRadios(state) {
    els.stateUrl.innerHTML = '';
    if (!state || !Array.isArray(state.links) || state.links.length === 0) {
      els.stateUrl.innerHTML = '<span class="small">Not available yet</span>';
      return;
    }

    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    group.id = 'linkOptions';

    state.links.forEach((lnk, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.margin = '8px 0';

      const lab = document.createElement('label');
      lab.style.display = 'flex';
      lab.style.alignItems = 'flex-start';
      lab.style.gap = '8px';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'link-choice';
      input.value = String(idx);
      input.checked = (idx === selectedLinkIdx);
      input.addEventListener('change', () => {
        selectedLinkIdx = idx;
        els.stateName.textContent = lnk.board || state.name || 'Board';
        els.stateHost.textContent = getHost(lnk.url) || '—';
        enableOpen(Boolean(lnk.url));
      });

      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = lnk.board || 'Board';
      const url = document.createElement('div');
      url.className = 'small';
      url.innerHTML = lnk.url
        ? `<a href="${lnk.url}" target="_blank" rel="noopener">${lnk.url}</a>`
        : '—';

      text.appendChild(title);
      text.appendChild(url);

      lab.appendChild(input);
      lab.appendChild(text);
      wrapper.appendChild(lab);
      group.appendChild(wrapper);
    });

    els.stateUrl.appendChild(group);
  }

  function updateForState(state) {
    selected = state || null;
    selectedLinkIdx = selected ? primaryIndex(selected.links) : 0;
    const link = selected?.links?.[selectedLinkIdx] || null;

    els.stateName.textContent = link?.board || selected?.name || '—';
    els.stateHost.textContent = link?.url ? getHost(link.url) : '—';

    renderLinksRadios(selected);
    enableOpen(Boolean(link?.url));
    setBadge(selected ? 'OK' : '—', selected ? 'ok' : '');
  }

  // ---------- verification + open ----------
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

  async function onOpenClick(ev) {
    ev.preventDefault();
    const link = selected?.links?.[selectedLinkIdx];
    if (!link?.url) return;
    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', 'error'); return; }
    setBadge('Opening…', 'ok');
    window.open(link.url, '_blank', 'noopener');
  }

  // ---------- report helpers ----------
  function buildReport() {
    const now = new Date().toISOString();
    const link = selected?.links?.[selectedLinkIdx];
    return {
      generatedAt: now,
      state: selected ? { code: selected.code, name: selected.name } : null,
      board: link ? { name: link.board, url: link.url, host: link?.url ? getHost(link.url) : null } : null,
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
    STATES = await loadStates();
    if (!STATES.length) {
      setBadge('No data', 'error');
      enableOpen(false);
      return;
    }
    renderStateOptions(STATES);

    els.stateSelect?.addEventListener('change', () => {
      const s = STATES.find(x => x.code === els.stateSelect.value) || null;
      updateForState(s);
    });
    els.openBtn?.addEventListener('click', onOpenClick);

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

