// Inject shared nav partial and auto-highlight current page
(() => {
  async function inject(selector, url) {
    const host = document.querySelector(selector);
    if (!host) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      host.outerHTML = await res.text();
      highlight();
    } catch (e) {
      console.warn('[nav] include failed:', e);
    }
  }

  function normalize(pathname) {
    // Treat directory index as /index.html for highlight comparison
    return pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  }

  function highlight() {
    const here = normalize(location.pathname);
    document.querySelectorAll('.top .inner a').forEach(a => {
      try {
        const href = new URL(a.getAttribute('href'), location.origin).pathname;
        if (normalize(href) === here) a.setAttribute('aria-current', 'page');
      } catch {}
    });
  }

  // Replace <div id="nav-root"></div> with the partial
  inject('#nav-root', '/partials/nav.html');
})();
