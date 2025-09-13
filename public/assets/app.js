/* public/assets/app.js — adds always-on direct hyperlinks while keeping the button flow */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName: $('#stateName'),
    stateUrl:   $('#stateUrl'),      // radio options rendered here
    stateHost:  $('#stateHost'),
    stateStatus: $('#stateStatus'),
    dataSource: $('#dataSource'),
    directLinks: $('#directLinks'),  // always-clickable hyperlinks
    openBtn: $('#openBtn'),

    saveJson: $('#saveJson'),
    copyText: $('#copyText'),
    nameInput: $('#nameInput'),
    emailInput: $('#emailInput'),
    detailsInput: $('#detailsInput'),
  };

  let STATES = [];
  let selected = null;
  let selectedLinkIdx = 0; // which link the "Open board page" button uses

  // ---------- utils ----------
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
  const primaryIndex = (links=[]) => {
    const i = links.findIndex(l => l && l.primary === true);
    return i >= 0 ? i : 0;
  };

  // ---------- data load ----------
  async function loadStates() {
    // Try API → fallback to file
    try {
      const txt = await fetchText('/api/states');
      const j = JSON.parse(txt);
      if (Array.isArray(j) && j.length) {
        // API might return rows (code,name,link,board,unavailable) — normalize
        if (j[0] && !j[0].links) {
          const by = {};
          j.forEach(r => {
            if (!by[r.code]) by[r.code] = { code: r.code, name: r.name, links: [] };
            if (r.link) by[r.code].links.push({
              board: r.board || r.name || 'Board',
              url: r.link,
              primary: by[r.code].links.length === 0
            });
          });
          return Object.values(by);
        }
        return j;
      }
    } catch (_) {}

    try {
      const txt = await fetchText('/assets/state-links.json');
      return parseMaybeWrapped(txt);
    } catch (e) {
      console.error('Failed to load states', e);
      return [];
    }
  }

  // ---------- UI render ----------
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
      const lab = document.createElement('label');
      lab.style.display = 'block';
      lab.style.margin = '8px 0';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'link-choice';
      input.value = String(idx);
      input.checked = (idx === selectedLinkIdx);
      input.addEventListener('change', () => {
        selectedLinkIdx = idx;
        // update Board + Host fields
        els.stateName.textContent = lnk.board || state.name || 'Board';
        els.stateHost.textContent = getHost(lnk.url) || '—';
      });

      const title = document.createElement('strong');
      title.textContent = lnk.board || 'Board';

      const url = document.createElement('div');
      url.className = 'small';
      url.style.marginLeft = '22px';
      url.innerHTML = lnk.url
        ? `<a href="${lnk.url}" target="_blank" rel="noopener">${lnk.url}</a>`
        : '—';

      lab.appendChild(input);
      lab.appendChild(document.createTextNode(' '));
      lab.appendChild(title);
      lab.appendChild(url);
      group.appendChild(lab);
    });

    els.stateUrl.appendChild(group);
  }

  function renderDirectLinks(state) {
    els.directLinks.innerHTML = '';
    if (!state || !Array.isArray(state.links) || state.links.length === 0) {
      els.directLinks.textContent = '—';
      return;
    }
    const ul = document.createElement('ul');
    ul.style.margin = '6px 0';
    ul.style.paddingLeft = '18px';
    state.links.forEach((lnk) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = lnk.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = lnk.board || lnk.url || 'Board link';
      li.appendChild(a);

      const hint = document.createElement('span');
      hint.className = 'small';
      hint.style.marginLeft = '6px';
      hint.textContent = `(${getHost(lnk.url) || '—'})`;
      li.appendChild(hint);

      ul.appendChild(li);
    });
    els.directLinks.appendChild(ul);
  }

  function updateForState(state) {
    selected = state || null;
    selectedLinkIdx = selected ? primaryIndex(selected.links) : 0;

    const selLink = selected && selected.links[selectedLinkIdx];

    els.stateName.textContent = selLink?.board || selected?.name || '—';
    els.stateHost.textContent = selLink?.url ? getHost(selLink.url) : '—';

    renderLinksRadios(selected);
    renderDirectLinks(selected);

    enableOpen(Boolean(selLink?.url));
    setBadge(selected ? 'Ready' : '—', selected ? 'ok' : '');
  }

  // ---------- verification + open ----------
  async function verifyTurnstile() {
    // if widget present but token missing, we still try to hit verify;
    // direct links do not require verification.
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
    if (!selected || !Array.isArray(selected.links)) return;
    const link = selected.links[selectedLinkIdx];
    if (!link?.url) return;

    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', 'error'); return; }

    setBadge('Opening…', 'ok');
    window.open(link.url, '_blank', 'noopener');
  }

  // ---------- report helpers (unchanged) ----------
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
    try {
      STATES = await loadStates();
      els.dataSource.textContent = 'Data source: ' + (Array.isArray(STATES) && STATES.length ? '/assets/state-links.json or API' : '(none)');
      renderStateOptions(STATES);
    } catch {
      els.dataSource.textContent = 'Data source: (none)';
    }

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
