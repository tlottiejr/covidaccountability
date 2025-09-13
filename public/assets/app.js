/* public/assets/app.js — resilient loader, all links visible, Turnstile fallback-open */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName: $('#stateName'),
    stateUrl: $('#stateUrl'),
    stateHost: $('#stateHost'),
    stateStatus: $('#stateStatus'),
    dataSource: $('#dataSource'),
    openBtn: $('#openBtn'),
    reportBtn: $('#reportBtn'),
    saveJson: $('#saveJson'),
    copyText: $('#copyText'),
    nameInput: $('#nameInput'),
    emailInput: $('#emailInput'),
    details: $('#details')
  };

  let STATES = [];
  let selected = null;
  let selectedLinkUrl = "";
  let selectedLinkBoard = "";

  const STATIC_JSON_CANDIDATES = [
    '/assets/state-links.json',
    '/state-links.json',
    '/public/assets/state-links.json'
  ];
  const STATIC_JS_FALLBACK = '/assets/state-links.js'; // optional legacy

  function setBadge(text, danger = false) {
    if (els.stateStatus) els.stateStatus.innerHTML = `<span class="badge${danger ? ' danger' : ''}">${text}</span>`;
  }
  // HIDE the “data source” snippet by making this a no-op.
  function showSource(_text) { /* intentionally blank */ }

  async function fetchText(url, timeout = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(t); }
  }
  function parseJsonStrict(text) {
    const t = text.replace(/^\uFEFF/, '');
    return JSON.parse(t);
  }
  async function getVersionToken(url) {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit' });
      const etag = res.headers.get('etag');
      if (etag) return etag.replace(/"/g, '');
      const lm = res.headers.get('last-modified');
      if (lm) return String(Date.parse(lm));
    } catch {}
    return String(Date.now());
  }
  function normalizeData(raw) {
    if (Array.isArray(raw) && raw.length && raw[0].links) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: (s.links || []).map(l => ({
          board: l.board || 'Official Complaint Link',
          url: l.url,
          source: l.source || '',
          primary: !!l.primary
        })),
        unavailable: false
      }));
    }
    if (raw && raw.__STATIC__ === true && Array.isArray(raw.states)) {
      return raw.states.map(s => ({ code: s.code, name: s.name, links: s.links || [], unavailable: false }));
    }
    if (Array.isArray(raw) && raw.length && raw[0].link) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !s.link
      }));
    }
    return [];
  }

  async function tryStaticJSON() {
    const v = await getVersionToken('/assets/state-links.json');
    for (const p of STATIC_JSON_CANDIDATES) {
      for (const candidate of [`${p}?v=${encodeURIComponent(v)}`, p]) {
        try {
          const text = await fetchText(candidate);
          if (/^\s*</.test(text)) { console.warn('[portal] got HTML, not JSON:', candidate); continue; }
          const norm = normalizeData(parseJsonStrict(text));
          if (norm.length) { showSource(`Data source: ${candidate}`); return norm; }
        } catch (e) { console.warn('[portal] static JSON failed:', candidate, e?.message || e); }
      }
    }
    return [];
  }
  async function tryStaticJS() {
    try {
      const text = await fetchText(STATIC_JS_FALLBACK);
      if (/^\s*</.test(text)) return [];
      const fn = new Function(`${text}; return window.__STATE_LINKS__ || null;`);
      const obj = fn.call(window);
      if (obj && obj.states) {
        const norm = normalizeData({ __STATIC__: true, states: obj.states });
        if (norm.length) { showSource(`Data source: ${STATIC_JS_FALLBACK}`); return norm; }
      }
    } catch (e) { console.warn('[portal] static JS failed:', e?.message || e); }
    return [];
  }
  async function tryApi() {
    try {
      const text = await fetchText(`/api/states?v=${Date.now()}`);
      const norm = normalizeData(parseJsonStrict(text));
      if (norm.length) { showSource('Data source: /api/states'); return norm; }
    } catch (e) { console.warn('[portal] /api/states failed:', e?.message || e); }
    return [];
  }
  async function tryLegacy() {
    try {
      const text = await fetchText(`/assets/states.json?v=${Date.now()}`);
      const norm = normalizeData(parseJsonStrict(text));
      if (norm.length) { showSource('Data source: /assets/states.json'); return norm; }
    } catch (e) { console.warn('[portal] legacy states.json failed:', e?.message || e); }
    return [];
  }
  async function loadStates() {
    let out = await tryStaticJSON(); if (out.length) return out;
    out = await tryStaticJS();       if (out.length) return out;
    out = await tryApi();            if (out.length) return out;
    out = await tryLegacy();         return out;
  }

  function setSelectedLink(l) {
    selectedLinkUrl = l?.url || '';
    selectedLinkBoard = l?.board || '';
    if (els.stateName) els.stateName.textContent = selectedLinkBoard || '—';
    try { const u = new URL(selectedLinkUrl); if (els.stateHost) els.stateHost.textContent = u.hostname; }
    catch { if (els.stateHost) els.stateHost.textContent = '—'; }
  }

  // SHOW ALL links by default (no toggle) — DOM-built for safety
  function renderLinks(state) {
    const container = els.stateUrl;
    container.innerHTML = '';
    selectedLinkUrl = '';
    selectedLinkBoard = '';

    if (!state || !Array.isArray(state.links) || state.links.length === 0) {
      container.innerHTML = `<span class="small">Not available yet</span>`;
      if (els.stateName) els.stateName.textContent = '—';
      if (els.stateHost) els.stateHost.textContent = '—';
      if (els.openBtn) els.openBtn.disabled = true;
      setBadge('Unavailable', true);
      return;
    }

    const primaryIdx = state.links.findIndex(l => l && l.primary);
    const checkedIdx = primaryIdx >= 0 ? primaryIdx : 0;

    state.links.forEach((link, idx) => {
      const row = document.createElement('div'); row.style.margin = '6px 0';
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `linkChoice-${state.code}`;
      input.value = link.url || '';
      input.setAttribute('data-board', link.board || 'Official Complaint Link');
      if (idx === checkedIdx) input.checked = true;
      input.addEventListener('change', () => setSelectedLink({
        url: input.value,
        board: input.getAttribute('data-board') || ''
      }));
      const strong = document.createElement('strong'); strong.textContent = link.board || 'Official Complaint Link';
      const small = document.createElement('div'); small.className = 'small'; small.style.marginLeft = '24px'; small.textContent = link.url || '';

      label.appendChild(input); label.appendChild(strong); label.appendChild(small);
      row.appendChild(label); container.appendChild(row);
    });

    setSelectedLink(state.links[checkedIdx]);
    if (els.openBtn) els.openBtn.disabled = false;
    setBadge('Ready');
  }

  function renderState(s) {
    selected = s || null;
    if (!s) {
      if (els.stateName) els.stateName.textContent = '—';
      if (els.stateHost) els.stateHost.textContent = '—';
      if (els.openBtn) els.openBtn.disabled = true;
      els.stateUrl.innerHTML = '';
      return;
    }
    renderLinks(s);
  }

  function populateSelect(states) {
    els.stateSelect.innerHTML = states.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
    els.stateSelect.addEventListener('change', () => {
      const s = states.find(x => x.code === els.stateSelect.value);
      renderState(s);
    });
  }

  async function verifyTurnstile() {
    try {
      const token = window.turnstile?.getResponse?.() || '';
      if (!token) return false;
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      return !!json?.success;
    } catch { return false; }
  }

  function buildReport() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: selected ? { name: selected.name, code: selected.code } : null,
      board: selectedLinkUrl ? {
        name: selectedLinkBoard, url: selectedLinkUrl,
        host: (() => { try { return new URL(selectedLinkUrl).hostname; } catch { return ''; } })()
      } : null,
      reporter: {
        name: els.nameInput?.value.trim() || '',
        email: els.emailInput?.value.trim() || ''
      },
      details: els.details?.value.trim() || ''
    };
  }
  function toText(r) {
    const lines = [];
    lines.push(`# Complaint Portal — Report`);
    lines.push(`Generated: ${r.generatedAt}`); lines.push('');
    lines.push(`State: ${r.state ? `${r.state.name} (${r.state.code})` : '—'}`);
    lines.push(`Board: ${r.board?.name || '—'}`);
    lines.push(`URL: ${r.board?.url || '—'}`);
    lines.push(`Host: ${r.board?.host || '—'}`); lines.push('');
    lines.push(`Reporter`); lines.push(`Name: ${r.reporter?.name || ''}`); lines.push(`Email: ${r.reporter?.email || ''}`);
    lines.push(''); lines.push('Details'); lines.push(r.details || '');
    return lines.join('\n');
  }
  function saveTxt(text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'report.txt'; a.click(); URL.revokeObjectURL(a.href);
  }

  els.openBtn?.addEventListener('click', async () => {
    if (!selectedLinkUrl) return;
    setBadge('Verifying…');
    let ok = false; try { ok = await verifyTurnstile(); } catch {}
    if (!ok) setBadge('Verification failed — opening anyway', true); else setBadge('Opening…');
    window.open(selectedLinkUrl, '_blank', 'noopener'); setBadge('Opened');
  });

  els.reportBtn?.addEventListener('click', async () => {
    if (!selected) { setBadge('Choose a state first.', true); return; }
    if (!els.saveJson?.checked && !els.copyText?.checked) { setBadge('Select Save or Copy.', true); return; }
    const r = buildReport(); const txt = toText(r);
    if (els.copyText?.checked) await navigator.clipboard.writeText(txt);
    if (els.saveJson?.checked) saveTxt(txt);
    setBadge('Report copied/saved');
  });

  (async function init() {
    setBadge('Loading…');
    STATES = await loadStates();
    if (!STATES.length) {
      setBadge('No data', true);
      if (els.openBtn) els.openBtn.disabled = true;
      return;
    }
    populateSelect(STATES);
    els.stateSelect.value = STATES[0].code;
    renderState(STATES[0]);
  })();
})();
