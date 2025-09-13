// Top nav: centered menu + persistent active underline + perf preconnect
(function () {
  // --- tiny perf lift: preconnect to Turnstile so TLS is warm when it loads ---
  (function preconnectTurnstile() {
    try {
      const head = document.head || document.getElementsByTagName('head')[0];
      if (!head) return;
      if (!head.querySelector('link[rel="preconnect"][href="https://challenges.cloudflare.com"]')) {
        const l = document.createElement('link');
        l.rel = 'preconnect';
        l.href = 'https://challenges.cloudflare.com';
        l.crossOrigin = '';
        head.appendChild(l);
      }
    } catch {}
  })();

  const root = document.getElementById('nav-root');

  // Normalize paths so "/about", "/about/", and "/about.html" all match
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

  // Build our canonical nav (no Complaint Portal)
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

  // Remove any stray "Complaint Portal" links from ANY nav in the document
  (function sanitizeNavs() {
    try {
      const candidates = document.querySelectorAll('nav a');
      candidates.forEach((a) => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        const text = (a.textContent || '').toLowerCase().trim();
        if (
          href.includes('complaint-portal') ||
          text === 'complaint portal'
        ) {
          a.parentNode && a.parentNode.removeChild(a);
        }
      });
    } catch {}
  })();

  // Mark current page active (underline) on our nav if present
  (function setActive() {
    try {
      const current = norm(location.pathname);
      const links = (root ? root : document).querySelectorAll('.top nav a');
      links.forEach((a) => {
        const hrefNorm = norm(a.getAttribute('href') || '');
        if (hrefNorm === current) a.setAttribute('aria-current', 'page');
      });
    } catch {}
  })();
})();
