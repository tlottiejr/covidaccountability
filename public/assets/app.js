/* eslint-disable no-console */
(() => {
  const el = (sel, root = document) => root.querySelector(sel);

  // DOM elements (keep IDs consistent with your existing HTML)
  const stateSelect = el('#state');
  const details = {
    name: el('#boardName'),
    url: el('#boardUrl'),
    host: el('#boardHost'),
    status: el('#boardStatus'),
  };
  const openBtn = el('#openBoard');

  // container to list ALL links for the selected state (we create it if missing)
  const getLinksContainer = () => {
    let c = document.getElementById('boardLinks');
    if (!c) {
      c = document.createElement('div');
      c.id = 'boardLinks';
      c.style.marginTop = '12px';
      // insert after status line if possible
      const statusEl = details.status;
      (statusEl?.parentElement || document.body).appendChild(c);
    }
    return c;
  };

  // Turnstile tracking (no HTML changes required)
  let turnstileToken = null;
  let tokenAt = 0; // ms
  const TOKEN_MAX_AGE_MS = 110 * 1000; // ~110s to stay under 120s TTL

  const isTokenFresh = () =>
    !!turnstileToken && (Date.now() - tokenAt) < TOKEN_MAX_AGE_MS;

  // Observe the widget without editing your HTML:
  // poll for token presence/changes; disable when expired/cleared
  const startTurnstileWatcher = () => {
    const tick = () => {
      try {
        const t = window.turnstile?.getResponse?.() || '';
        if (t && t !== turnstileToken) {
          turnstileToken = t;
          tokenAt = Date.now();
          if (stash.selected) {
            enableOpen(canOpen());
            setStatus(true, 'Verified');
          }
        } else if (!t && turnstileToken) {
          // token cleared/expired
          turnstileToken = null;
          tokenAt = 0;
          enableOpen(false);
          setStatus(false, 'Verification expired. Please verify again.');
        } else if (turnstileToken && !isTokenFresh()) {
          // stale
          turnstileToken = null;
          tokenAt = 0;
          enableOpen(false);
          setStatus(false, 'Verification expired. Please verify again.');
        }
      } catch {
        /* ignore */
      } finally {
        window.setTimeout(tick, 1000);
      }
    };
    tick();
  };

  // util helpers
  const setText = (node, text) => { if (node) node.textContent = text ?? ''; };
  const setStatus = (ok, msg = '') => {
    if (!details.status) return;
    details.status.className = ok ? 'status ok' : 'status error';
    setText(details.status, msg);
  };
  const getHost = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

  const stash = { states: [], selected: null };

  const fetchJson = async (path, opts) => {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const loadStates = async () => {
    // Try API first
    try {
      const a = await fetchJson('/api/states', { headers: { 'cache-control': 'no-store' } });
      if (Array.isArray(a) && a.length) return a;
    } catch (e) {
      console.warn('API /api/states failed; using static JSON', e);
    }
    // Fallback to shipped JSON (supports {states:[...]} or flat array)
    try {
      const j = await fetchJson('/assets/state-links.json', { headers: { 'cache-control': 'no-store' } });
      if (Array.isArray(j?.states)) return j.states;
      if (Array.isArray(j)) return j;
    } catch (e) {
      console.error('Failed to load /assets/state-links.json', e);
    }
    return [];
  };

  const renderStates = (states) => {
    if (!stateSelect) return;
    stateSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a state';
    stateSelect.appendChild(ph);

    states.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = s.name;
      stateSelect.appendChild(opt);
    });
  };

  const pickPrimaryLink = (links) => Array.isArray(links) ? (links.find(l=>l.primary) || links[0] || null) : null;

  const renderAllLinks = (state) => {
    const c = getLinksContainer();
    c.innerHTML = ''; // minimal, no fancy styling to keep consistent look

    if (!state || !Array.isArray(state.links) || state.links.length === 0) {
      c.textContent = '';
      return;
    }

    const title = document.createElement('div');
    title.style.margin = '6px 0';
    title.style.fontSize = '14px';
    title.style.opacity = '0.85';
    title.textContent = 'Other board links for this state:';
    c.appendChild(title);

    const ul = document.createElement('ul');
    ul.style.margin = '6px 0';
    ul.style.paddingLeft = '18px';

    state.links.forEach((lnk) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = (lnk.board || 'Board') + ' — Open';
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await guardedOpen(lnk.url);
      });
      // small URL/host hint
      const hint = document.createElement('span');
      hint.style.marginLeft = '8px';
      hint.style.opacity = '0.8';
      hint.style.fontSize = '12px';
      hint.textContent = `${lnk.url} (${getHost(lnk.url) || '—'})${lnk.primary ? ' [Primary]' : ''}`;

      li.appendChild(btn);
      li.appendChild(hint);
      ul.appendChild(li);
    });

    c.appendChild(ul);
  };

  const updateDetails = (state) => {
    stash.selected = state || null;
    const primary = stash.selected ? pickPrimaryLink(stash.selected.links) : null;

    // Show the **board** name (not the state)
    setText(details.name, primary?.board || '—');
    setText(details.url, primary?.url || '—');
    setText(details.host, primary?.url ? getHost(primary.url) : '—');

    renderAllLinks(stash.selected);
    enableOpen(canOpen());
    setStatus(!!stash.selected, stash.selected ? (isTokenFresh() ? 'Verified' : 'Select state & verify') : '—');
  };

  const onStateChange = () => {
    const code = stateSelect.value || '';
    const s = stash.states.find(x => x.code === code) || null;
    updateDetails(s);
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

  const verifyTurnstile = async () => {
    try {
      if (!isTokenFresh()) {
        setStatus(false, 'Please verify to continue.');
        // try to reset if available (won’t hurt if missing)
        window.turnstile?.reset?.();
        return false;
      }
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const data = await res.json();
      return !!data?.success;
    } catch (e) {
      console.error('verify-turnstile failed', e);
      return false;
    }
  };

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
    // initial button state
    enableOpen(false);

    // load states
    stash.states = await loadStates();
    renderStates(stash.states);

    // hook UI
    stateSelect?.addEventListener('change', onStateChange);
    openBtn?.addEventListener('click', onOpenPrimary);

    // start token watcher (no HTML changes required)
    startTurnstileWatcher();
  };

  document.addEventListener('DOMContentLoaded', main);
})();
