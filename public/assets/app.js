/* public/assets/app.js — resilient loader + clear diagnostics + board name */
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
    saveJson: $('#saveJson'),
    copyText: $('#copyText'),
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

  function setBadge(text, danger = false) {
    els.stateStatus.innerHTML = `<span class="badge${danger ? ' danger' : ''}">${text}</span>`;
  }
  function showSource(text) { els.dataSource.textContent = text || ''; }

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
    // Strip UTF-8 BOM if present
    const t = text.replace(/^\uFEFF/, '');
    return JSON.parse(t);
  }

  function normalizeData(raw) {
    if (Array.isArray(raw) && raw.length && raw[0].links) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: (s.links || []).map(l => ({
          board: l.board || 'Official Complaint Link',
          url: l.url || '',
          source: l.source || '',
          primary: !!l.primary
        })),
        unavailable: !s.links || s.links.length === 0
      }));
    }
    if (Array.isArray(raw) && raw.length && ('link' in raw[0] || 'unavailable' in raw[0])) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !!s.unavailable
      }));
    }
    if (Array.isArray(raw) && raw.length && ('code' in raw[0] && 'name' in raw[0])) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !s.link
      }));
    }
    return [];
  }

  async function tryStaticJSON() {
    for (const p of STATIC_JSON_CANDIDATES) {
      try {
        const text = await fetchText(p);
        if (/^\s*</.test(text)) {
          console.warn('[portal] static JSON returned HTML at', p);
          showSource(`Data source error: ${p} returned HTML (not JSON)`);
          continue;
        }
        try {
          const raw = parseJsonStrict(text);
          const norm = normalizeData(raw);
          if (norm.length) {
            console.info('[portal] loaded static JSON:', p, norm.length, 'states');
            showSource(`Data source: ${p}`);
            return norm;
          } else {
            console.warn('[portal] static JSON parsed but empty shape at', p);
          }
        } catch (e) {
          console.error('[portal] JSON parse error at', p, e?.message || e);
          showSource(`JSON parse error in ${p}: ${e?.message || e}`);
        }
      } catch (e) {
        console.warn('[portal] static JSON fetch failed:', p, e?.message || e);
      }
    }
    return [];
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function tryStaticJS() {
    try {
      await loadScript(STATIC_JS_FALLBACK);
      const raw = window.__STATE_LINKS__;
      if (Array.isArray(raw) && raw.length) {
        const norm = normalizeData(raw);
        if (norm.length) {
          console.info('[portal] loaded static JS:', STATIC_JS_FALLBACK, norm.length, 'states');
          showSource(`Data source: ${STATIC_JS_FALLBACK}`);
          return norm;
        }
      }
    } catch (e) {
      console.warn('[portal] static JS failed:', e?.message || e);
    }
    return [];
  }

  async function tryApi() {
    try {
      const text = await fetchText('/api/states');
      try {
        const raw = parseJsonStrict(text);
        const norm = normalizeData(raw);
        if (norm.length) {
          console.info('[portal] loaded /api/states:', norm.length, 'states');
          showSource('Data source: /api/states');
          return norm;
        }
      } catch (e) {
        console.error('[portal] /api/states JSON parse error:', e?.message || e);
        showSource(`JSON parse error from /api/states: ${e?.message || e}`);
      }
    } catch (e) {
      console.warn('[portal] /api/states failed:', e?.message || e);
    }
    return [];
  }

  async function tryLegacy() {
    try {
      const text = await fetchText('/assets/states.json');
      try {
        const raw = parseJsonStrict(text);
        const norm = normalizeData(raw);
        if (norm.length) {
          console.info('[portal] loaded legacy /assets/states.json:', norm.length);
          showSource('Data source: /assets/states.json');
          return norm;
        }
      } catch (e) {
        console.error('[portal] legacy states.json parse error:', e?.message || e);
        showSource(`JSON parse error in /assets/states.json: ${e?.message || e}`);
      }
    } catch (e) {
      console.warn('[portal] legacy states.json failed:', e?.message || e);
    }
    return [];
  }

  async function loadStates() {
    let out = await tryStaticJSON();
    if (out.length) return out;
    out = await tryStaticJS();
    if (out.length) return out;
    out = await tryApi();
    if (out.length) return out;
    out = await tryLegacy();
    return out;
  }

  function setSelectedLink(l) {
    selectedLinkUrl = l?.url || '';
    selectedLinkBoard = l?.board || '';
    els.stateName.textContent = selectedLinkBoard || '—';
    try {
      const u = new URL(selectedLinkUrl);
      els.stateHost.textContent = u.hostname;
    } catch { els.stateHost.textContent = '—'; }
  }

  function renderLinks(state) {
    const container = els.stateUrl;
    container.innerHTML = '';
    selectedLinkUrl = '';
    selectedLinkBoard = '';

    if (!state || !state.links || state.links.length === 0) {
      container.innerHTML = `<span class="small">Not available yet</span>`;
      els.stateName.textContent = '—';
      els.stateHost.textContent = '—';
      els.openBtn.disabled = true;
      setBadge('Unavailable', true);
      return;
    }

    const defaultIndex = Math.max(0, state.links.findIndex(l => l.primary));
    setSelectedLink(state.links[defaultIndex]);

    if (state.links.length === 1) {
      const only = state.links[0];
      container.innerHTML = `<a href="${only.url}" target="_blank" rel="noopener">${only.url}</a><div class="small">${only.board || ''}</div>`;
    } else {
      const radios = state.links.map((l, idx) => {
        const id = `linkChoice-${state.code}-${idx}`;
        const checked = idx === defaultIndex ? 'checked' : '';
        return `
          <div style="margin:6px 0;">
            <label>
              <input type="radio" name="linkChoice-${state.code}" id="${id}" value="${l.url}" data-board="${l.board || 'Official Complaint Link'}" ${checked}/>
              <strong>${l.board ? l.board : 'Official Complaint Link'}</strong>
              <div class="small" style="margin-left:24px;">${l.url}</div>
            </label>
          </div>`;
      }).join('');
      container.innerHTML = radios;
      container.querySelectorAll(`input[type="radio"][name="linkChoice-${state.code}"]`).forEach(r => {
        r.addEventListener('change', (e) => {
          const url = e.target.value;
          const board = e.target.getAttribute('data-board') || '';
          setSelectedLink({ url, board });
        });
      });
    }

    setBadge('OK');
    els.openBtn.disabled = false;
  }

  function renderState(state) {
    selected = state || null;
    renderLinks(selected);
  }

  function populateSelect(data) {
    els.stateSelect.innerHTML = '';
    data.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = `${s.name} (${s.code})`;
      els.stateSelect.appendChild(opt);
    });
  }

  async function verifyTurnstile() {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    const token = input && input.value ? input.value : null;
    if (!token) return true;
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

  els.openBtn?.addEventListener('click', async () => {
    if (!selectedLinkUrl) return;
    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', true); return; }
    setBadge('Opening…');
    window.open(selectedLinkUrl, '_blank', 'noopener');
    setBadge('Opened');
  });

  els.stateSelect?.addEventListener('change', () => {
    const code = els.stateSelect.value;
    const s = STATES.find(x => x.code === code);
    renderState(s);
  });

  (async function init() {
    STATES = await loadStates();
    if (!STATES.length) {
      setBadge('No data', true);
      els.openBtn.disabled = true;
      showSource('No data sources resolved — open /assets/state-links.json directly in your browser; if it shows HTML or errors, fix that file.');
      return;
    }
    populateSelect(STATES);
    els.stateSelect.value = STATES[0].code;
    renderState(STATES[0]);
  })();
})();




