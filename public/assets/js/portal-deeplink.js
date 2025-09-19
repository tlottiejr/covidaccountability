// Runs only on Complaint Portal page (safe to load elsewhere; no-ops)
(() => {
  function getParams() {
    const p = new URLSearchParams(window.location.search);
    const state = (p.get('state') || '').toUpperCase();
    const board = p.get('board'); // optional, not used unless your UI exposes it
    const boardIndex = board != null && board !== '' ? parseInt(board, 10) : null;
    return { state, boardIndex };
  }

  function findStateSelect() {
    // Cover the common IDs/names used in this repo
    return (
      document.querySelector('#state-select') ||
      document.querySelector('select[name="state"]') ||
      document.querySelector('#state') ||
      null
    );
  }

  function applyDeepLinkOnce(select, params) {
    if (!select || !params.state) return false;
    const { state, boardIndex } = params;

    // Try to find an option by value or by inner text that ends with (XX)
    const opts = Array.from(select.options || []);
    const match =
      opts.find(o => (o.value || '').toUpperCase() === state) ||
      opts.find(o => (o.textContent || '').trim().endsWith(`(${state})`));

    if (!match) return false;

    // Select and fire change (let your existing app.js render the links)
    select.value = match.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Optional: if your UI exposes board choices with data-board-index, preselect
    if (boardIndex != null) {
      const candidates = document.querySelectorAll('[data-board-index]');
      const target = Array.from(candidates).find(
        el => Number(el.dataset.boardIndex) === boardIndex
      );
      if (target && typeof target.click === 'function') target.click();
    }
    return true;
  }

  function init() {
    const params = getParams();
    if (!params.state) return;

    const select = findStateSelect();
    if (!select) {
      // Wait for app.js to render the select
      const mo = new MutationObserver(() => {
        const sel = findStateSelect();
        if (sel && sel.options && sel.options.length) {
          if (applyDeepLinkOnce(sel, params)) mo.disconnect();
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Also time out after 10s to avoid dangling observer
      setTimeout(() => mo.disconnect(), 10000);
      return;
    }

    // If select exists but may still be empty, watch until options appear
    if (!select.options || select.options.length === 0) {
      const mo = new MutationObserver(() => {
        if (select.options && select.options.length) {
          if (applyDeepLinkOnce(select, params)) mo.disconnect();
        }
      });
      mo.observe(select, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 10000);
      return;
    }

    applyDeepLinkOnce(select, params);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
