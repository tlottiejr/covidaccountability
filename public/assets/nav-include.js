// public/assets/nav-include.js
(function () {
  const root = document.getElementById('nav-root');
  if (!root) return;

  const links = [
    ['/', 'Home'],
    ['/about.html', 'About Us'],
    ['/our-story.html', 'Our Story'],
    ['/why-report.html', 'Why Report'],
    ['/who-can-report.html', 'Who Can Report'],
    ['/references.html', 'References'],
    ['/complaint-portal.html', 'Complaint Portal'],
    ['/donate.html', 'Donate'],
  ];

  const nameOf = (p) => {
    try {
      const u = new URL(p, location.origin);
      let n = u.pathname;
      if (n.endsWith('/')) n += 'index.html';
      const parts = n.split('/');
      return parts[parts.length - 1];
    } catch { return p; }
  };
  const current = nameOf(location.pathname || '/');

  const navInner = `
    <ul class="nav__list">
      ${links.map(([href, label]) => {
        const active = nameOf(href) === current;
        return `<li class="nav__item${active ? ' is-active' : ''}">
          <a href="${href}" ${active ? 'aria-current="page"' : ''}>${label}</a>
        </li>`;
      }).join('')}
    </ul>
  `;

  root.innerHTML = `
    <header class="top">
      <div class="wrap">
        <nav aria-label="Primary">${navInner}</nav>
      </div>
    </header>
  `;
})();
