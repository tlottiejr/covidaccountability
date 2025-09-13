/* public/assets/app.js — resilient loader + board name + local save/copy actions (TXT) */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    stateSelect: $('#stateSelect'),
    stateName: $('#stateName'),   // shows BOARD name
    stateUrl: $('#stateUrl'),
    stateHost: $('#stateHost'),
    stateStatus: $('#stateStatus'),
    dataSource: $('#dataSource'),
    openBtn: $('#openBtn'),
    reportBtn: $('#reportBtn'),
    saveJson: $('#saveJson'),      // checkbox; saves TXT (kept id for parity)
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
  const STATIC_JS_FALLBACK = '/assets/state-links.js'; // optional

  // ---------- UI helpers ----------
  function setBadge(text, danger = false) {
    if (!els.stateStatus) return;
    els.stateStatus.innerHTML = `<span class="badge${danger ? ' danger' : ''}">${text}</span>`;
  }
  function showSource(text) { if (els.dataSource) els.dataSource.textContent = text || ''; }
  function flash(text, ms = 3000) {
    if (!els.dataSource) return;
    const old = els.dataSource.textContent;
    els.dataSource.textContent = text;
    setTimeout(() => { els.dataSource.textContent = old; }, ms);
  }

  // ---------- network & normalize ----------
  async function fetchText(url, timeout = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(timer); }
  }
  function parseJsonStrict(text) {
    const t = text.replace(/^\uFEFF/, ''); // strip BOM
    return JSON.parse(t);
  }
  // Derive a stable version token from ETag/Last-Modified; fallback to timestamp.
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
    // new multi-link
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
    // static JS fallback shape: window.__STATE_LINKS__
    if (raw && raw.__STATIC__ === true && Array.isArray(raw.states)) {
      return raw.states.map(s => ({
        code: s.code, name: s.name,
        links: s.links || [],
        unavailable: false
      }));
    }
    // API legacy: { code, name, link }
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
      const url = `${p}?v=${encodeURIComponent(v)}`;
      try {
        const text = await fetchText(url);
        if (/^\s*</.test(text)) { // HTML
          console.warn('[portal] static JSON returned HTML at', url);
          continue;
        }
        const raw = parseJsonStrict(text);
        const norm = normalizeData(raw);
        if (norm.length) {
          console.info('[portal] loaded static JSON:', url, norm.length, 'states');
          showSource(`Data source: ${p}`);
          return norm;
        }
      } catch (e) {
        console.warn('[portal] static JSON failed:', url, e?.message || e);
      }
    }
    return [];
  }
  async function tryStaticJS() {
    try {
      const text = await fetchText(STATIC_JS_FALLBACK);
      if (/^\s*</.test(text)) return []; // HTML
      const fn = new Function(`${text}; return window.__STATE_LINKS__ || null;`);
      const obj = fn.call(window);
      if (obj && obj.states) {
        const norm = normalizeData({ __STATIC__: true, states: obj.states });
        if (norm.length) {
          console.info('[portal] loaded static JS:', STATIC_JS_FALLBACK, norm.length, 'states');
          showSource(`Data source: ${STATIC_JS_FALLBACK}`);
          return norm;
        }
      }
    } catch (e) { console.warn('[portal] static JS failed:', e?.message || e); }
    return [];
  }
  async function tryApi() {
    try {
      const text = await fetchText(`/api/states?v=${Date.now()}`);
      const raw = parseJsonStrict(text);
      const norm = normalizeData(raw);
      if (norm.length) {
        console.info('[portal] loaded /api/states:', norm.length, 'states');
        showSource('Data source: /api/states');
        return norm;
      }
    } catch (e) { console.warn('[portal] /api/states failed:', e?.message || e); }
    return [];
  }
  async function tryLegacy() {
    try {
      const text = await fetchText(`/assets/states.json?v=${Date.now()}`);
      const raw = parseJsonStrict(text);
      const norm = normalizeData(raw);
      if (norm.length) {
        console.info('[portal] loaded legacy /assets/states.json:', norm.length);
        showSource('Data source: /assets/states.json');
        return norm;
      }
    } catch (e) { console.warn('[portal] legacy states.json failed:', e?.message || e); }
    return [];
  }
  async function loadStates() {
    let out = await tryStaticJSON(); if (out.length) return out;
    out = await tryStaticJS();       if (out.length) return out;
    out = await tryApi();            if (out.length) return out;
    out = await tryLegacy();         return out;
  }

  // ---------- state rendering ----------
  function setSelectedLink(l) {
    selectedLinkUrl = l?.url || '';
    selectedLinkBoard = l?.board || '';
    if (els.stateName) els.stateName.textContent = selectedLinkBoard || '—';
    try {
      const u = new URL(selectedLinkUrl);
      if (els.stateHost) els.stateHost.textContent = u.hostname;
    } catch { if (els.stateHost) els.stateHost.textContent = '—'; }
  }

  // SHOW ALL LINKS BY DEFAULT (no toggle), DOM-safe
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

    // Default selection: primary if present, else first
    const primaryIdx = state.links.findIndex(l => l && l.primary);
    const checkedIdx = primaryIdx >= 0 ? primaryIdx : 0;

    // Build radios with pure DOM (avoids template pitfalls)
    state.links.forEach((link, idx) => {
      const board = link.board || 'Official Complaint Link';
      const url = link.url || '';

      const row = document.createElement('div');
      row.style.margin = '6px 0';

      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `linkChoice-${state.code}`;
      input.value = url;
      input.setAttribute('data-board', board);
      if (idx === checkedIdx) input.checked = true;

      input.addEventListener('change', () => {
        setSelectedLink({ url: input.value, board: input.getAttribute('data-board') || '' });
      });

      const strong = document.createElement('strong');
      strong.textContent = board;

      const small = document.createElement('div');
      small.className = 'small';
      small.style.marginLeft = '24px';
      small.textContent = url;

      label.appendChild(input);
      label.appendChild(strong);
      label.appendChild(small);

      row.appendChild(label);
      container.appendChild(row);
    });

    // Apply initial selection & enable button
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

  // ---------- Turnstile integration ----------
  async function verifyTurnstile() {
    try {
      const token = window.turnstile?.getResponse?.() || '';
      if (!token) return false;
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const json = await res.json();
      return !!json?.success;
    } catch { return false; }
  }

  // ---------- Report helpers (optional) ----------
  function buildReport() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: selected ? { name: selected.name, code: selected.code } : null,
      board: selectedLinkUrl ? { name: selectedLinkBoard, url: selectedLinkUrl, host: (() => {
        try { return new URL(selectedLinkUrl).hostname; } catch { return ''; }
      })() } : null,
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
    lines.push(`Generated: ${r.generatedAt}`);
    lines.push('');
    lines.push(`State: ${r.state ? `${r.state.name} (${r.state.code})` : '—'}`);
    lines.push(`Board: ${r.board?.name || '—'}`);
    lines.push(`URL: ${r.board?.url || '—'}`);
    lines.push(`Host: ${r.board?.host || '—'}`);
    lines.push('');
    lines.push(`Reporter`);
    lines.push(`Name: ${r.reporter?.name || ''}`);
    lines.push(`Email: ${r.reporter?.email || ''}`);
    lines.push('');
    lines.push(`Details`);
    lines.push(r.details || '');
    return lines.join('\n');
  }
  function saveTxt(text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'report.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- events ----------
  els.openBtn?.addEventListener('click', async () => {
    if (!selectedLinkUrl) return;
    setBadge('Verifying…');
    let ok = false;
    try { ok = await verifyTurnstile(); } catch {}
    if (!ok) { setBadge('Verification failed — opening anyway', true); }
    else { setBadge('Opening…'); }
    window.open(selectedLinkUrl, '_blank', 'noopener');
    setBadge('Opened');
  });

  els.reportBtn?.addEventListener('click', async () => {
    if (!selected) { flash('Choose a state first.'); return; }
    if (!els.saveJson?.checked && !els.copyText?.checked) {
      flash('Select at least one option: Save or Copy.'); return;
    }
    const r = buildReport();
    const ts = new Date(r.generatedAt).toISOString().replace(/[:.]/g,'-');
    const base = selected ? selected.code : 'report';

    let did = [];
    if (els.copyText?.checked) {
      await navigator.clipboard.writeText(toText(r));
      did.push('copied');
    }
    if (els.saveJson?.checked) {
      saveTxt(toText(r));
      did.push('saved');
    }
    flash(`Report ${did.join(' & ')} (${base}-${ts})`);
  });

  (async function init() {
    STATES = await loadStates();
    if (!STATES.length) {
      setBadge('No data', true);
      if (els.openBtn) els.openBtn.disabled = true;
      showSource('No data sources resolved — ensure /assets/state-links.json exists.');
      return;
    }
    populateSelect(STATES);
    els.stateSelect.value = STATES[0].code;
    renderState(STATES[0]);
  })();
})();
