// Top nav: centered menu, persistent active underline, Turnstile preconnect,
// and HARD removal of any "Complaint Portal" link (past or future inserts).
(function () {
  // --- Perf: warm TLS for Turnstile (when used) ---
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

  // --- Render our canonical nav (NO Complaint Portal) ---
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

  // --- Helper: normalize paths so /about, /about/, /about.html all match ---
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

  // --- Mark the active page in our nav ---
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

  // --- Brutal remover for any Complaint Portal anchors in ANY nav ---
  function isComplaintAnchor(a) {
    const href = (a.getAttribute('href') || '').toLowerCase();
    const txt  = (a.textContent || '').toLowerCase().replace(/\s+/g, '');
    // catch common permutations: complaint-portal, complaintportal, /complaint..., complaint.html, etc.
    const hrefHit =
      href.includes('complaint-portal') ||
      href.includes('complaintportal') ||
      /\/complaint(\.html|\/|$)/.test(href);
    const textHit = /complaintportal/.test(txt) || /complaint\s*portal/.test((a.textContent || '').toLowerCase());
    return hrefHit || textHit;
  }

  function stripComplaintLinks(scope = document) {
    try {
      scope.querySelectorAll('nav a').forEach((a) => {
        if (isComplaintAnchor(a)) a.remove();
      });
    } catch {}
  }

  // Initial pass + active underline
  stripComplaintLinks();
  setActiveUnderline();

  // --- Keep it gone even if something injects it later ---
  try {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              stripComplaintLinks(n);
            }
          });
        }
      }
      setActiveUnderline();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {}
})();
