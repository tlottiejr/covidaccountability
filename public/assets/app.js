(() => {
  const $ = s => document.querySelector(s);

  // ---------- Toast ----------
  function toast(msg, ms = 2200) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- JSON helper that tolerates HTML/Access ----------
  async function safeJson(res) {
    const txt = await res.text();
    try { return JSON.parse(txt); } catch {
      if (/<html|<!doctype/i.test(txt)) return null; // Access/HTML error
      return null;
    }
  }

  // ---------- Durable States Loader (D1 → assets → last-good) ----------
  async function loadStatesDurable() {
    // 1) D1 API
    try {
      const r = await fetch('/api/states', { headers: { 'accept': 'application/json' }, cache: 'no-store' });
      if (r.ok) {
        const j = await safeJson(r);
        if (Array.isArray(j) && j.length) {
          console.info('[states] from /api/states', j.length);
          localStorage.setItem('states:last', JSON.stringify({ at: Date.now(), list: j }));
          return j;
        }
      } else {
        console.warn('[states] /api/states ->', r.status);
      }
    } catch (e) { console.warn('[states] /api/states error', e); }

    // 2) Static file
    try {
      const r2 = await fetch('/assets/states.json', { headers: { 'accept': 'application/json' }, cache: 'no-store' });
      if (r2.ok) {
        const j2 = await safeJson(r2);
        if (Array.isArray(j2) && j2.length) {
          console.info('[states] from /assets/states.json', j2.length);
          localStorage.setItem('states:last', JSON.stringify({ at: Date.now(), list: j2 }));
          return j2;
        }
      }
    } catch (e) { console.warn('[states] assets fallback error', e); }

    // 3) last-good
    try {
      const raw = localStorage.getItem('states:last');
      if (raw) {
        const obj = JSON.parse(raw);
        // expire after 24h
        if (Date.now() - obj.at < 24 * 60 * 60 * 1000 && Array.isArray(obj.list)) {
          console.info('[states] from last-good cache', obj.list.length);
          return obj.list;
        }
      }
    } catch {}

    return [];
  }

  // ---------- Populate UI ----------
  function showBoardPanel(item) {
    const panel = $('#boardPanel');
    const name  = $('#boardName');
    const urlEl = $('#boardUrl');
    const btn   = $('#openBoard');

    if (!item) {
      panel.classList.add('hidden');
      name.textContent = '—';
      urlEl.textContent = '—'; urlEl.href = '#';
      btn.disabled = true;
      return;
    }

    panel.classList.remove('hidden');
    name.textContent = item.board_name || item.name || item.code;
    urlEl.textContent = item.link || '—';
    urlEl.href = item.link || '#';
    btn.disabled = !item.link || !!item.unavailable;

    btn.onclick = () => {
      if (item.link) window.open(item.link, '_blank', 'noopener');
    };
  }

  async function populateStates() {
    const sel = $('#state'), err = $('#stateError');
    sel.innerHTML = `<option value="">Loading states…</option>`;

    const list = await loadStatesDurable();

    if (!list.length) {
      sel.innerHTML = `<option value="">Failed to load states (open console)</option>`;
      err.textContent = 'Could not load state list. Check /api/states and /assets/states.json.';
      return;
    }

    sel.innerHTML = `<option value="">Select your state…</option>`;
    for (const s of list) {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = s.name || s.code;
      opt.dataset.link = s.link || '';
      opt.dataset.unavailable = String(!!s.unavailable);
      opt.dataset.boardName = s.board_name || '';
      if (s.unavailable) opt.textContent += ' (temporarily unavailable)';
      if (s.unavailable) opt.disabled = true;
      sel.appendChild(opt);
    }

    sel.addEventListener('change', () => {
      err.textContent = sel.value ? '' : 'Please choose your state.';
      const o = sel.selectedOptions[0];
      if (!o) return showBoardPanel(null);
      showBoardPanel({
        code: sel.value,
        name: o.textContent,
        board_name: o.dataset.boardName,
        link: o.dataset.link,
        unavailable: o.dataset.unavailable === 'true'
      });
    });
  }

  // ---------- Turnstile verify ----------
  async function verifyTurnstile({ timeoutMs = 12000 } = {}) {
    const status = $('#verifyStatus');
    if (!window.turnstile || typeof window.turnstile.getResponse !== 'function') {
      status.textContent = 'Verification script not loaded (check domain / site key).';
      return { success: false };
    }
    const token = window.turnstile.getResponse();
    if (!token) { status.textContent = 'Please complete the verification.'; return { success: false }; }
    status.textContent = 'Verifying…';

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort('timeout'), timeoutMs);

    try {
      const r = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: ctrl.signal
      });
      clearTimeout(to);
      const j = await r.json().catch(() => ({ success: false }));
      status.textContent = j.success ? 'Success!' : 'Verification failed.';
      return j;
    } catch (e) {
      clearTimeout(to);
      status.textContent = e === 'timeout' ? 'Taking longer than usual… try again.' : 'Network error verifying.';
      return { success: false };
    }
  }

  // ---------- Submit ----------
  function wireSubmit() {
    const btn = $('#submitBtn');
    const sel = $('#state');
    const optDL = $('#optDownload');
    const optCP = $('#optCopy');

    btn.addEventListener('click', async () => {
      if (!sel.value) { $('#stateError').textContent = 'Please choose your state.'; return; }
      const v = await verifyTurnstile();
      if (!v.success) { toast('Could not verify.'); return; }

      const o = sel.selectedOptions[0];
      const link = o?.dataset?.link || '';

      if (link) window.open(link, '_blank', 'noopener');

      const payload = {
        state: sel.value,
        name: $('#name').value.trim(),
        email: $('#email').value.trim(),
        details: $('#details').value.trim(),
        ts: new Date().toISOString()
      };

      if (optDL.checked) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `report-${payload.state}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      if (optCP.checked) {
        const txt = `State: ${payload.state}\nName: ${payload.name}\nEmail: ${payload.email}\nDetails:\n${payload.details}`;
        await navigator.clipboard.writeText(txt).catch(() => {});
      }

      toast('Opened official board link.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateStates();
    wireSubmit();
  });
})();



