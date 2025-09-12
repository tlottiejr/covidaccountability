/* eslint-disable no-console */
(() => {
  const el = (sel, root = document) => root.querySelector(sel);
  const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Elements
  const stateSelect = el('#state');
  const details = {
    name: el('#boardName'),
    url: el('#boardUrl'),
    host: el('#boardHost'),
    status: el('#boardStatus'),
  };
  const openBtn = el('#openBoard');
  const turnstileContainer = el('#turnstile-block');
  const form = el('#portalForm');

  // Helpers
  const setText = (node, text) => { if (node) node.textContent = text ?? ''; };
  const setStatus = (ok, msg = '') => {
    if (!details.status) return;
    details.status.className = ok ? 'status ok' : 'status error';
    setText(details.status, msg);
  };
  const getHost = (url) => {
    try { return new URL(url).hostname.split('.').filter(Boolean).slice(-2).join('.'); } catch { return ''; }
  };

  const stash = {
    state: null,
    states: [],
    selected: null,
  };

  const enableOpen = (enabled) => {
    if (!openBtn) return;
    openBtn.disabled = !enabled;
    openBtn.setAttribute('aria-disabled', String(!enabled));
  };

  const fetchJson = async (path, opts) => {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const loadStatesFromApi = async () => {
    // Primary: API endpoint (D1-backed)
    try {
      const data = await fetchJson('/api/states', { headers: { 'cache-control': 'no-store' } });
      if (Array.isArray(data) && data.length) return data;
    } catch (e) {
      console.warn('API /api/states failed, falling back to static JSON', e);
    }

    // Fallback: shipped JSON
    try {
      const data = await fetchJson('/assets/state-links.json', { headers: { 'cache-control': 'no-store' } });
      // support both {states:[...]} and flat array
      if (Array.isArray(data?.states) && data.states.length) return data.states;
      if (Array.isArray(data) && data.length) return data;
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

  const updateDetails = (state) => {
    stash.selected = state;
    const primary = state ? pickPrimaryLink(state.links) : null;

    // NOTE: this is the original behavior (boardName shows the STATE name)
    setText(details.name, state?.name || '—');
    setText(details.url, primary?.url || '—');
    setText(details.host, primary?.url ? getHost(primary.url) : '—');

    enableOpen(Boolean(primary?.url));
    setStatus(true, state ? 'Ready' : '—');
  };

  const onStateChange = () => {
    const code = stateSelect.value || '';
    const state = stash.states.find((s) => s.code === code) || null;
    updateDetails(state);
  };

  const initTurnstile = () => {
    if (!turnstileContainer) return;
    // Turnstile auto-renders via script tag in HTML; nothing to do here
  };

  const verifyTurnstile = async () => {
    try {
      const token = window.turnstile?.getResponse?.();
      if (!token) return false;
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return Boolean(data?.success);
    } catch (e) {
      console.error('turnstile verify failed', e);
      return false;
    }
  };

  const onOpen = async (ev) => {
    ev.preventDefault();
    if (!stash.selected) return;
    const primary = pickPrimaryLink(stash.selected.links);
    if (!primary?.url) return;

    setStatus(true, 'Verifying…');
    const ok = await verifyTurnstile();
    if (!ok) {
      setStatus(false, 'Verification failed. Try again.');
      return;
    }

    setStatus(true, 'Opening…');
    window.open(primary.url, '_blank', 'noopener');
  };

  const main = async () => {
    enableOpen(false);
    initTurnstile();

    stash.states = await loadStatesFromApi();
    renderStates(stash.states);

    stateSelect?.addEventListener('change', onStateChange);
    openBtn?.addEventListener('click', onOpen);
  };

  document.addEventListener('DOMContentLoaded', main);
})();
