/* public/assets/app.js — resilient loader + board name + local save/copy actions */
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

  // ---------- UI helpers ----------
  function setBadge(text, danger = false) {
    els.stateStatus.innerHTML = `<span class="badge${danger ? ' danger' : ''}">${text}</span>`;
  }
  function showSource(text) { els.dataSource.textContent = text || ''; }
  function flash(text, ms = 3000) {
    const old = els.dataSource.textContent;
    els.dataSource.textContent = text;
    setTimeout(() => (els.dataSource.textContent = old), ms);
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
  function normalizeData(raw) {
    // new multi-link
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
    // /api/states style
    if (Array.isArray(raw) && raw.length && ('link' in raw[0] || 'unavailable' in raw[0])) {
      return raw.map(s => ({
        code: s.code, name: s.name,
        links: s.link ? [{ board: 'Official Complaint Link', url: s.link, source: '', primary: true }] : [],
        unavailable: !!s.unavailable
      }));
    }
    // legacy /assets/states.json
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
        if (/^\s*</.test(text)) { // HTML
          console.warn('[portal] static JSON returned HTML at', p);
          continue;
        }
        const raw = parseJsonStrict(text);
        const norm = normalizeData(raw);
        if (norm.length) {
          console.info('[portal] loaded static JSON:', p, norm.length, 'states');
          showSource(`Data source: ${p}`);
          return norm;
        }
      } catch (e) {
        console.warn('[portal] static JSON failed:', p, e?.message || e);
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
    } catch (e) { console.warn('[portal] static JS failed:', e?.message || e); }
    return [];
  }
  async function tryApi() {
    try {
      const text = await fetchText('/api/states');
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
      const text = await fetchText('/assets/states.json');
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
    els.stateName.textContent = selectedLinkBoard || '—';
    try {
      const u = new URL(selectedLinkUrl);
      els.stateHost.textContent = u.hostname;
    } catch { els.stateHost.textContent = '—'; }
  }

  function renderLinks(state) {
    const container = els.stateUrl;
    container.innerHTML = '';
    selectedLinkUrl = ''; selectedLinkBoard = '';

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

  // ---------- Turnstile ----------
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

  // ---------- Local actions (save/copy) ----------
  function buildReport() {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      state: selected ? { code: selected.code, name: selected.name } : null,
      board: { name: selectedLinkBoard || null, url: selectedLinkUrl || null, host: els.stateHost.textContent || null },
      reporter: {
        name: (els.nameInput?.value || '').trim() || null,
        email: (els.emailInput?.value || '').trim() || null
      },
      details: (els.detailsInput?.value || '').trim() || null,
      notice: "This file is stored locally by you. The site does not store your report."
    };
  }

  function reportToText(r) {
    return [
      'Complaint draft',
      `Generated: ${r.generatedAt}`,
      '',
      `State: ${r.state ? `${r.state.name} (${r.state.code})` : '—'}`,
      `Board: ${r.board?.name || '—'}`,
      `URL:   ${r.board?.url || '—'}`,
      `Host:  ${r.board?.host || '—'}`,
      '',
      `Your name:  ${r.reporter?.name || ''}`,
      `Your email: ${r.reporter?.email || ''}`,
      '',
      'Details:',
      r.details || ''
    ].join('\n');
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  // ---------- Events ----------
  els.openBtn?.addEventListener('click', async () => {
    if (!selectedLinkUrl) return;
    setBadge('Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) { setBadge('Verification failed', true); return; }
    setBadge('Opening…');
    window.open(selectedLinkUrl, '_blank', 'noopener');
    setBadge('Opened');
  });

  els.reportBtn?.addEventListener('click', async () => {
    if (!selected) { flash('Choose a state first.'); return; }
    if (!els.saveJson.checked && !els.copyText.checked) {
      flash('Select at least one option: Save JSON or Copy text.'); return;
    }
    const r = buildReport();
    const ts = new Date(r.generatedAt).toISOString().replace(/[:.]/g,'-');
    const base = selected ? selected.code : 'report';
    const filename = `complaint-${base}-${ts}.json`;

    let did = [];
    if (els.saveJson.checked) {
      downloadJson(filename, r);
      did.push('saved JSON');
    }
    if (els.copyText.checked) {
      const ok = await copyToClipboard(reportToText(r));
      did.push(ok ? 'copied text' : 'copy failed');
    }
    flash(`Done: ${did.join(' & ')}. We do not store your report.`);
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
      showSource('No data sources resolved — ensure /assets/state-links.json exists.');
      return;
    }
    populateSelect(STATES);
    els.stateSelect.value = STATES[0].code;
    renderState(STATES[0]);
  })();
})();




