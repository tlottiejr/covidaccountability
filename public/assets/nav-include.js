// Top nav: centered menu, no brand link on the left, persistent active underline
(function () {
  const root = document.getElementById('nav-root');
  if (!root) return;

  // Render: spacer • centered nav • spacer
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

  // Normalize paths so "/about", "/about/", and "/about.html" all match
  const norm = (p) => {
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname.toLowerCase();
      path = path.replace(/\/index\.html?$/i, "/"); // index → /
      path = path.replace(/\/$/i, "");              // trim trailing slash
      path = path.replace(/\.html$/i, "");          // trim .html
      return path || "/";
    } catch {
      return p;
    }
  };

  const current = norm(location.pathname);
  const links = root.querySelectorAll('nav a');

  for (const a of links) {
    const hrefNorm = norm(a.getAttribute('href'));
    if (hrefNorm === current) {
      a.setAttribute('aria-current', 'page'); // CSS draws the underline
    }
  }
})();
