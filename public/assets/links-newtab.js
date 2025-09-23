// public/assets/links-newtab.js
// External links => new tab. Internal links unchanged.

(() => {
  function apply(root) {
    const { origin } = window.location;
    (root || document).querySelectorAll('a[href]').forEach((a) => {
      if (a.hasAttribute('data-no-blank')) return; // opt-out
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let url;
      try { url = new URL(href, location.href); } catch { return; }
      if (url.origin !== origin) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(document));
  } else {
    apply(document);
  }
  new MutationObserver((muts) => muts.forEach((m) => apply(m.target)))
    .observe(document.documentElement, { childList: true, subtree: true });
})();
