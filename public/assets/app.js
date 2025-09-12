/* eslint-disable no-console */
(() => {
  const el = (sel, root = document) => root.querySelector(sel);

  // Elements
  const stateSelect = el('#state');
  const details = {
    name: el('#boardName'),     // board display name for selected link
    url: el('#boardUrl'),
    host: el('#boardHost'),
    status: el('#boardStatus'),
  };
  const openBtn = el('#openBoard');         // primary "Open board page"
  const linksContainer = el('#boardLinks'); // list of all links for the chosen state

  // Turnstile token state
  let turnstileToken = null;
  let tokenAt = 0; // ms since epoch
  const TOKEN_MAX_AGE_MS = 110 * 1000; // refresh a bit before 120s

  // Helpers
  const setText = (node, text) => { if (node) node.textContent = text ?? ''; };
  const setStatus = (ok, msg = '') => {
    if (!details.status) return;
    details.status.className = ok ? 'status ok' : 'status error';
    setText(details.status, msg);
  };
  const getHost = (url) => {
    try { return new URL(url).hostname; } catch { return ''; }
  };
  const isTokenFresh = () => !!turnstileToken && (Date.now() - tokenAt) < TOKEN_MAX_AGE_MS;

  const stash = { states: [], selected: null };

  const fetchJson = async (path, opts) => {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const loadStatesFromApi = async () => {
    // Try API first (D1-backed if present)
    try {
      const data = await fetchJson('/api/states', { headers: { 'cache-control': 'no-store' } });
      if (Array.isArray(data) && data.length) return data;
    } catch (e) {
      console.warn('API /api/states failed, falling back to static JSON', e);
    }
    // Fallback: shipped JSON
    try {
      const j = await fetchJson('/assets/state-links.json', { headers: { 'cache-control': 'no-store' } });
      if (Array.isArray(j?.states) && j.states.length) return j.states;
      if (Array.isArray(j) && j.length) return j; // support flat array shape too
    } catch (e) {
      console.error('Failed to load fallback state-links.json', e);
    }
    return [];
  };

  const renderStates = (states) => {
    if (!stateSelect) return;
    stateSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a state';
    stateSelect.appendChild(placeholder);

    states
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = s.name;
        stateSelect.appendChild(opt);
      });
  };

  const pickPrimaryLink = (links) => {
    if (!Array.isArray(links)) return null;
    return links.find((l) => l.primary) || links[0] || null;
  };

  const canOpen = () => {
    const primary = pickPrimaryLink(stash.selected?.links);
    return Boolean(primary?.url) && isTokenFresh();
  };

  const enableOpen = (enabled) => {
    if (!openBtn) return;
    openBtn.disabled = !enabled;
    openBtn.setAttribute('aria-disabled', String(!enabled));
  };

  const renderAllLinks = (state) => {
    if (!linksContainer) return;
    linksContainer.innerHTML = '';

    if (!state || !Array.isArray(state.links) || state.links.length === 0) {
      linksContainer.innerHTML = '<p>No links available for this state.</p>';
      return;
    }

    const list = document.createElement('div');
    list.setAttribute('role', 'list');

    state.links.forEach((lnk) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      row.className = 'card';
      row.style.marginBottom = '10px';

      const title = document.createElement('div');
      title.style.display = 'flex';
      title.style.justifyContent = 'space-between';
      title.style.alignItems = 'center';
      title.style.gap = '10px';

      const left = document.createElement('div');
      left.innerHTML = `
        <div style="font-weight:600;">${lnk.board || 'Board'}</div>
        <div style="font-size:14px; opacity:.8;">
          <span>${lnk.url}</span>
          <span style="margin-left:8px;">(${getHost(lnk.url) || '—'})</span>
          ${lnk.primary ? '<span style="margin-left:8px; font-weight:600; opacity:.9;">Primary</span>' : ''}
        </div>
      `;

      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open';
      open.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await guardedOpen(lnk.url);
      });

      title.appendChild(left);
      title.appendChild(open);
      row.appendChild(title);
      list.appendChild(row);
    });

    linksContainer.appendChild(list);
  };

  const updateDetails = (state) => {
    stash.selected = state;
    const primary = state ? pickPrimaryLink(state.links) : null;

    // Correct board display (not the state name)
    setText(details.name, primary?.board || '—');
    setText(details.url, primary?.url || '—');
    setText(details.host, primary?.url ? getHost(primary.url) : '—');

    renderAllLinks(state);
    enableOpen(canOpen());
    setStatus(!!state, state ? (isTokenFresh() ? 'Verified' : 'Select state & complete verification') : '—');
  };

  const onStateChange = () => {
    const code = stateSelect.value || '';
    const state = stash.states.find((s) => s.code === code) || null;
    updateDetails(state);
  };

  // Turnstile callbacks (wired via data-* attributes in the HTML)
  window.onTurnstileSuccess = (token) => {
    turnstileToken = token || null;
    tokenAt = Date.now();
    enableOpen(canOpen());
    if (turnstileToken) setStatus(true, 'Verified');
  };
  window.onTurnstileExpired = () => {
    turnstileToken = null;
    tokenAt = 0;
    enableOpen(false);
    setStatus(false, 'Verification expired. Please verify again.');
  };
  window.onTurnstileError = () => {
    turnstileToken = null;
    tokenAt = 0;
    enableOpen(false);
    setStatus(false, 'Verification error. Please retry.');
  };

  const verifyTurnstile = async () => {
    try {
      if (!isTokenFresh()) {
        if (window.turnstile?.reset) window.turnstile.reset();
        setStatus(false, 'Please verify to continue.');
        return false;
      }
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const data = await res.json();
      return Boolean(data?.success);
    } catch (e) {
      console.error('turnstile verify failed', e);
      return false;
    }
  };

  // Used by primary button and each “Open” in the list
  const guardedOpen = async (url) => {
    if (!url) return;
    setStatus(true, 'Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) {
      setStatus(false, 'Verification failed. Please verify and try again.');
      return;
    }
    setStatus(true, 'Opening…');
    window.open(url, '_blank', 'noopener');
  };

  const onOpenPrimary = async (ev) => {
    ev.preventDefault();
    const primary = pickPrimaryLink(stash.selected?.links);
    await guardedOpen(primary?.url);
  };

  const main = async () => {
    openBtn?.setAttribute('aria-disabled', 'true');
    openBtn?.setAttribute('disabled', 'true');

    stash.states = await loadStatesFromApi();
    renderStates(stash.states);

    stateSelect?.addEventListener('change', onStateChange);
    openBtn?.addEventListener('click', onOpenPrimary);
  };

  document.addEventListener('DOMContentLoaded', main);
})();

