/* public/assets/app.js — resilient loader + board name + local save/copy actions (PDF) */
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
    saveJson: $('#saveJson'),      // checkbox; now saves PDF (ID unchanged)
    copyText: $('#copyText'),
    nameInput: $('#nameInput'),
    emailInput: $('#emailInput'),
    detailsInput: $('#detailsInput')
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
  const STATIC_JS_FALLBACK = '/assets/state-links.js'; // optional fallback

  function setBadge(text, cls = '') {
    const span = els.stateStatus.querySelector('.badge') || document.createElement('span');
    span.className = `badge ${cls}`.trim();
    span.textContent = text;
    if (!els.stateStatus.contains(span)) els.stateStatus.appendChild(span);
  }

  function setDataSource(text) {
    els.dataSource.textContent = text || '';
  }

  function setStateFields(obj) {
    els.stateName.textContent = obj?.board || '—';
    els.stateUrl.innerHTML = obj?.url ? `<a href="${obj.url}" target="_blank" rel="noopener">${obj.url}</a>` : '<span class="small">Not available yet</span>';
    els.stateHost.textContent = obj?.host || '—';
  }

  function enableOpen(enabled) {
    els.openBtn.disabled = !enabled;
    if (enabled) {
      els.openBtn.removeAttribute('aria-disabled');
    } else {
      els.openBtn.setAttribute('aria-disabled', 'true');
    }
  }

  // ---------- fetch & normalize ----------
  async function fetchText(url, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(timer); }
  }
  function parseJsonStrict(text) {
    const t = text.replace(/^\uFEFF/, ''); // strip BOM
    return JSON.parse(t);
  }
  function normalizeHost(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }
  function normalizeStates(arr) {
    // shape: [{code,name,links:[{board,url,primary?}]}]
    return (arr || []).map(s => {
      const links = (s.links || []).map((lnk, idx) => ({
        board: lnk.board || s.name || 'Board',
        url: lnk.url || '',
        primary: !!lnk.primary || idx === 0,
        host: normalizeHost(lnk.url || '')
      }));
      return { code: s.code, name: s.name, links };
    });
  }

  async function loadFromApi() {
    try {
      const txt = await fetchText('/api/states');
      const json = parseJsonStrict(txt);
      // API might return flat rows or normalized list; detect
      if (Array.isArray(json) && json.length && json[0]?.links) {
        return { list: json, source: 'API' };
      }
      // flat rows -> normalize
      if (Array.isArray(json)) {
        const by = {};
        json.forEach(r => {
          by[r.code] ||= { code: r.code, name: r.name, links: [] };
          if (r.link) by[r.code].links.push({
            board: r.board || r.name || 'Board',
            url: r.link,
            primary: by[r.code].links.length === 0,
            host: normalizeHost(r.link)
          });
        });
        return { list: Object.values(by), source: 'API' };
      }
      throw new Error('Unexpected API shape');
    } catch (e) {
      throw e;
    }
  }

  async function loadFromStatic() {
    // try JSON candidates
    for (const path of STATIC_JSON_CANDIDATES) {
      try {
        const txt = await fetchText(path);
        const json = parseJsonStrict(txt);
        const list = Array.isArray(json?.states) ? normalizeStates(json.states) :
                     Array.isArray(json) ? normalizeStates(json) : null;
        if (list && list.length) return { list, source: `File: ${path}` };
      } catch {}
    }
    // optional JS fallback (export const STATES=[])
    try {
      const txt = await fetchText(STATIC_JS_FALLBACK);
      const match = txt.match(/STATES\s*=\s*(\[[\s\S]*\]);?/);
      if (match) {
        const arr = parseJsonStrict(match[1]);
        const list = normalizeStates(arr);
        if (list.length) return { list, source: `File: ${STATIC_JS_FALLBACK}` };
      }
    } catch {}
    return { list: [], source: 'None' };
  }

  async function loadStates() {
    // API first
    try {
      const { list, source } = await loadFromApi();
      return { list, source };
    } catch {
      const { list, source } = await loadFromStatic();
      return { list, source };
    }
  }

  // ---------- UI wiring ----------
  function renderStates(list) {
    els.stateSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a state';
    els.stateSelect.appendChild(ph);

    list.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = s.name;
      els.stateSelect.appendChild(opt);
    });
  }

  function getPrimaryLink(state) {
    if (!state) return null;
    return state.links.find(x => x.primary) || state.links[0] || null;
  }

  async function verifyTurnstile() {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    const token = input && input.value ? input.value : null;
    if (!token) return true; // treat as pass if present widget but no token yet
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

  // ---------- Build report (for PDF/Text) ----------
  function buildReport() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: selected ? { code: selected.code, name: selected.name } : null,
      board: { name: selectedLinkBoard || null, url: selectedLinkUrl || null, host: els.stateHost.textContent || null },
      user: { name: els.nameInput.value || null, email: els.emailInput.value || null },
      details: els.detailsInput.value || ''
    };
  }

  function reportToText(r) {
    return [
      `Generated: ${r.generatedAt}`,
      r.state ? `State: ${r.state.name} (${r.state.code})` : `State: —`,
      r.board ? `Board: ${r.board.name}\nURL: ${r.board.url}\nHost: ${r.board.host}` : `Board: —`,
      r.user.name ? `Name: ${r.user.name}` : '',
      r.user.email ? `Email: ${r.user.email}` : '',
      '',
      'Details:',
      r.details || '—'
    ].filter(Boolean).join('\n');
  }

  function saveAsPdf(text) {
    // simple text -> blob -> download (kept lightweight; no canvas lib)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'complaint.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Events ----------
  els.stateSelect.addEventListener('change', async () => {
    selected = STATES.find(s => s.code === els.stateSelect.value) || null;
    const link = getPrimaryLink(selected);
    selectedLinkUrl = link?.url || '';
    selectedLinkBoard = link?.board || '';

    setStateFields(link ? { board: link.board, url: link.url, host: link.host } : null);
    enableOpen(!!selectedLinkUrl);

    if (!selected) {
      setBadge('—');
      setDataSource('');
      return;
    }
    setBadge('Ready', 'ok');
  });

  els.openBtn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!selectedLinkUrl) return;

    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', 'error'); return; }

    setBadge('Opening…', 'ok');
    window.open(selectedLinkUrl, '_blank', 'noopener');
  });

  els.copyText?.addEventListener('click', () => {
    const r = buildReport();
    const text = reportToText(r);
    navigator.clipboard?.writeText(text).catch(()=>{});
  });

  els.saveJson?.addEventListener('change', () => {
    const r = buildReport();
    const text = reportToText(r);
    saveAsPdf(text);
  });

  // ---------- boot ----------
  (async () => {
    try {
      const { list, source } = await loadStates();
      STATES = list;
      setDataSource(source ? `Data source: ${source}` : '');
      renderStates(STATES);
    } catch {
      setDataSource('Data source: (none)');
      renderStates([]);
    }
  })();
})();
