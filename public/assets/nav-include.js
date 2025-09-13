// Injects the top nav and marks the current page so the underline is persistent.
(function () {
  const root = document.getElementById('nav-root');
  if (!root) return;

  // Render nav (removed the left dot; restored centered spacing)
  root.innerHTML = `
    <div class="top">
      <div class="inner">
        <div class="brand">
          <a href="/" class="title" style="text-decoration:none">COVID Accountability Now</a>
        </div>
        <nav aria-label="Primary">
          <a href="/">Home</a>
          <a href="/about.html">About Us</a>
          <a href="/our-story.html">Our Story</a>
          <a href="/why-report.html">Why Report</a>
          <a href="/who-can-report.html">Who Can Report</a>
          <a href="/references.html">References</a>
          <a href="/donate.html">Donate</a>
        </nav>
        <div></div> <!-- spacer for centered nav -->
      </div>
    </div>
  `;

  // Normalize paths so both "/about" and "/about.html" (and trailing "/") match
  const norm = (p) => {
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname.toLowerCase();
      path = path.replace(/\/index\.html?$/i, "/"); // index → /
      path = path.replace(/\/$/i, "");              // remove trailing slash
      path = path.replace(/\.html$/i, "");          // remove .html
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
      a.setAttribute('aria-current', 'page'); // triggers underline via CSS
    }
  }
})();
