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

  // ---------- Build report (for PDF/Text) ----------
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

  // ---------- PDF generation ----------
  async function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    throw new Error('jsPDF failed to load');
  }

  async function downloadPdf(filename, report) {
    const jsPDF = await getJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612x792
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addLine = (text, opts = {}) => {
      const size = opts.size || 11;
      const bold = opts.bold || false;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, contentWidth);
      for (const line of lines) {
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += (opts.leading || 16);
      }
    };

    // Title
    addLine('Complaint Draft', { size: 18, bold: true, leading: 26 });
    addLine(`Generated: ${report.generatedAt}`, { size: 10, leading: 14 });
    y += 6;

    // Metadata
    addLine(`State: ${report.state ? `${report.state.name} (${report.state.code})` : '—'}`, { bold: true });
    addLine(`Board: ${report.board?.name || '—'}`);
    addLine(`URL: ${report.board?.url || '—'}`);
    addLine(`Host: ${report.board?.host || '—'}`);
    y += 6;

    // Reporter
    addLine('Reporter', { bold: true });
    addLine(`Name: ${report.reporter?.name || ''}`);
    addLine(`Email: ${report.reporter?.email || ''}`);
    y += 6;

    // Details
    addLine('Details', { bold: true });
    addLine(report.details || '', { leading: 16 });

    // Footer note
    y = Math.max(y, pageHeight - margin - 32);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('This PDF is stored locally by you. The site does not store your report.', margin, pageHeight - margin);

    doc.save(filename);
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
      flash('Select at least one option: Save PDF or Copy text.'); return;
    }
    const r = buildReport();
    const ts = new Date(r.generatedAt).toISOString().replace(/[:.]/g,'-');
    const base = selected ? selected.code : 'report';

    let did = [];
    if (els.saveJson.checked) {
      try {
        await downloadPdf(`complaint-${base}-${ts}.pdf`, r);
        did.push('saved PDF');
      } catch (e) {
        console.error('PDF generation failed, offering TXT instead:', e);
        const ok = await copyToClipboard(reportToText(r));
        did.push(ok ? 'PDF failed; copied TXT' : 'PDF failed');
      }
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

/* ===== Link Health 2.0 — portal-side status checker (server API) =====
   This patch replaces any existing browser-side HEAD/GET check and uses
   /api/check-link (Cloudflare Pages Function) to avoid CORS/HEAD issues.
   Drop at the end of public/assets/app.js. It will monkey-patch the
   old verifier if one exists (verifyLinkStatus / verifyLink / checkLink).
============================================================================ */

(function () {
  // ---- Helpers ------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  // Try to find the badge element used in the left card.
  function locateStatusBadge() {
    // preferred explicit id or data-attr
    return (
      $("#status-badge") ||
      $("[data-status-badge]") ||
      // common fallbacks near a "Status" label
      $(".status .badge") ||
      $(".badge.status") ||
      // last resort: the first badge inside the left panel
      $(".left .badge") ||
      $(".badge")
    );
  }

  function setBadge(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("badge-ok", "badge-warn", "badge-fail");
    el.classList.add(kind === "ok" ? "badge-ok" : kind === "warn" ? "badge-warn" : "badge-fail");
  }

  // Normalize host comparison to registrable domain.
  const registrable = (host) => (host || "").split(".").filter(Boolean).slice(-2).join(".");

  // ---- New verifier -------------------------------------------------------
  async function verifyLinkStatus_v2(url, expectedHost) {
    const statusEl = locateStatusBadge();
    if (!url) { setBadge(statusEl, "No data", "warn"); return; }

    try {
      const r = await fetch(`/api/check-link?url=${encodeURIComponent(url)}`, { method: "GET" });
      const data = await r.json();

      // Network/CORS/SSL issues between our edge and the board => WARN
      if (data.status === 0) {
        setBadge(statusEl, "Unverified (network/CORS)", "warn");
        return;
      }

      const status   = Number(data.status);
      const finalUrl = data.finalUrl || url;
      const finalHost = new URL(finalUrl).hostname;

      const expectedReg = registrable(expectedHost || new URL(url).hostname);
      const finalReg    = registrable(finalHost);

      const isOkStatus =
        (status >= 200 && status <= 206) ||
        [300, 301, 302, 303, 307, 308].includes(status);

      if (!isOkStatus) {
        if ([401, 403, 429].includes(status)) {
          setBadge(statusEl, `Limited (${status})`, "warn");
        } else if ([404, 410, 451].includes(status) || status >= 500) {
          setBadge(statusEl, `Verification failed (${status})`, "fail");
        } else {
          setBadge(statusEl, `Unverified (${status})`, "warn");
        }
        return;
      }

      if (finalReg !== expectedReg) {
        setBadge(statusEl, `Redirected to ${finalHost}`, "warn");
        return;
      }

      setBadge(statusEl, "OK", "ok");
    } catch {
      setBadge(statusEl, "Unverified (edge error)", "warn");
    }
  }

  // ---- Monkey-patch any existing checker ---------------------------------
  const patchTargets = ["verifyLinkStatus", "verifyLink", "checkLink", "updateLinkStatus"];
  for (const name of patchTargets) {
    if (typeof window[name] === "function") {
      const old = window[name];
      window[name] = function (url, expectedHost) {
        // Call new verifier; ignore old network/CORS-affected logic.
        return verifyLinkStatus_v2(url, expectedHost);
      };
      // Only patch one to avoid multiple calls.
      break;
    }
  }

  // ---- Safety net: attach to common UI events if verifier isn’t called ----
  // This is harmless if your existing code already calls the checker.
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t) return;

    // State select or board radio changes
    const isStateSelect = t.matches("select[name='state'], #state, [data-role='state-select']");
    const isBoardRadio  = t.matches("input[type='radio'][name='board'], [data-role='board-radio']");

    if (isStateSelect || isBoardRadio) {
      // Derive selected URL and expected host from visible UI
      const selectedRadio = document.querySelector("input[type='radio'][name='board']:checked");
      const url = selectedRadio?.value || selectedRadio?.dataset?.url || $("#board-url")?.value;

      // Try to read the rendered "Host" value if present
      let expectedHost = null;
      const hostRow = document.querySelector("[data-role='host'], .host, #host");
      if (hostRow) {
        // Prefer data attribute; otherwise, text content
        expectedHost = hostRow.dataset?.host || hostRow.textContent?.trim() || null;
      }

      if (url) verifyLinkStatus_v2(url, expectedHost);
    }
  });

  // Run once on load (in case a default state/board is preselected)
  window.addEventListener("DOMContentLoaded", () => {
    const selectedRadio = document.querySelector("input[type='radio'][name='board']:checked");
    if (selectedRadio) {
      const url = selectedRadio.value || selectedRadio.dataset?.url;
      let expectedHost = null;
      const hostRow = document.querySelector("[data-role='host'], .host, #host");
      if (hostRow) expectedHost = hostRow.dataset?.host || hostRow.textContent?.trim() || null;
      if (url) verifyLinkStatus_v2(url, expectedHost);
    }
  });

})();
