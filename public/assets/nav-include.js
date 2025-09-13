// Top nav: centered menu + persistent active underline + perf preconnect
(function () {
  // Warm TLS for Turnstile (when used)
  try {
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head && !head.querySelector('link[rel="preconnect"][href="https://challenges.cloudflare.com"]')) {
      const l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = 'https://challenges.cloudflare.com';
      l.crossOrigin = '';
      head.appendChild(l);
    }
  } catch {}

  const root = document.getElementById('nav-root');

  // Render our canonical nav (NO Complaint Portal)
  if (root) {
    root.innerHTML = `
      <div class="top">
        <div class="inner">
          <div></div>
          <nav aria-label="Primary">
            <a href="/">Home</a>
            <a href="/about.html">About Us</a>
            <a href="/our-story.html">Our Story</a>
            <a href="/why-report.html">Why Report</a>
            <a href="/who-can-report.html">Who Can Report</a>
            <a href="/references.html">References</a>
            <a href="/donate.html">Donate</a>
          </nav>
          <div></div>
        </div>
      </div>
    `;
  }

  // Helpers
  const norm = (p) => {
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname.toLowerCase();
      path = path.replace(/\/index\.html?$/i, '/'); // index → /
      path = path.replace(/\/$/i, '');              // trim trailing slash
      path = path.replace(/\.html$/i, '');          // trim .html
      return path || '/';
    } catch {
      return p;
    }
  };

  function setActiveUnderline() {
    try {
      const current = norm(location.pathname);
      const links = (root ? root : document).querySelectorAll('.top nav a');
      links.forEach((a) => {
        const hrefNorm = norm(a.getAttribute('href') || '');
        if (hrefNorm === current) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    } catch {}
  }

  // Remove any "Complaint Portal" link from ANY nav (handles legacy partials, late inserts)
  function sanitizeNavs() {
    try {
      const anchors = document.querySelectorAll('nav a');
      anchors.forEach((a) => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        const text = (a.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const textMatch = /complaint\s*-?\s*portal/i.test(text);
        const hrefMatch = /(\/|^)complaint[-]?portal(\.html|\/)?$/i.test(href);
        if (textMatch || hrefMatch) {
          a.remove();
        }
      });
    } catch {}
  }

  // Initial pass
  sanitizeNavs();
  setActiveUnderline();

  // Guard against late DOM mutations adding it back (legacy includes/scripts)
  try {
    const obs = new MutationObserver(() => {
      sanitizeNavs();
      setActiveUnderline();
    });
    obs.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  } catch {}
})();
