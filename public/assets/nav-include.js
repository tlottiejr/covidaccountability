// Minimal nav include: render canonical links (NO "Complaint Portal") and set active underline.
(function () {
  const root = document.getElementById('nav-root');

  const links = [
    ['/', 'Home'],
    ['/about.html', 'About Us'],
    ['/our-story.html', 'Our Story'],
    ['/why-report.html', 'Why Report'],
    ['/who-can-report.html', 'Who Can Report'],
    ['/references.html', 'References'],
    ['/donate.html', 'Donate'],
  ];

  const norm = (p) => {
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname.toLowerCase();
      path = path.replace(/\/index\.html?$/i, '/'); // index → /
      path = path.replace(/\/$/i, '');              // trim trailing slash
      path = path.replace(/\.html$/i, '');          // trim .html
      return path || '/';
    } catch { return p; }
  };

  const current = norm(location.pathname);
  const navInner = links.map(([href, label]) => {
    const active = norm(href) === current ? ' aria-current="page"' : '';
    return `<a href="${href}"${active}>${label}</a>`;
  }).join('');

  const bar = `
    <div class="top">
      <div class="inner">
        <div></div>
        <nav aria-label="Primary">${navInner}</nav>
        <div></div>
      </div>
    </div>
  `;

  // Preferred: render into #nav-root
  if (root) {
    root.innerHTML = bar;
    return;
  }

  // Fallback: replace any existing top nav content
  const existing = document.querySelector('.top nav') || document.querySelector('nav[aria-label="Primary"]');
  if (existing) {
    existing.innerHTML = navInner;
  }
})();
