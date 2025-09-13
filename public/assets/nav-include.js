// Injects the top nav and marks the current page so the underline is persistent.
(function () {
  const root = document.getElementById('nav-root');
  if (!root) return;

  // Render nav
  root.innerHTML = `
    <div class="top">
      <div class="inner">
        <div class="brand">
          <span class="dot" aria-hidden="true"></span>
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
      </div>
    </div>
  `;

  // Set aria-current="page" on the active link (normalizes / and /index.html)
  const path = (location.pathname || '/').replace(/\/index\.html?$/i, '/');
  const links = root.querySelectorAll('nav a');

  for (const a of links) {
    try {
      const href = new URL(a.getAttribute('href'), location.origin).pathname
        .replace(/\/index\.html?$/i, '/');
      if (href === path) {
        a.setAttribute('aria-current', 'page');
      }
    } catch { /* no-op */ }
  }
})();
