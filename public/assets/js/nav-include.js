// public/assets/nav-include.js
// Safe nav include: ONLY renders when #nav-root exists. It will NOT touch pages that
// already have their own header/nav markup.
(function () {
  const root = document.getElementById('nav-root');
  if (!root) return; // <-- key change: do nothing unless page opted in

  const links = [
    ['/', 'Home'],
    ['/about.html', 'About Us'],
    ['/our-story.html', 'Our Story'],
    ['/why-report.html', 'Why Report'],
    ['/who-can-report.html', 'Who Can Report'],
    ['/references.html', 'References'],
    ['/donate.html', 'Donate'],
  ];

  const norm = (p) => p.replace(/index\.html$/, '');

  const navInner = `
    <ul class="nav__list">
      ${links.map(([href, label]) => {
        const active = norm(location.pathname) === norm(href);
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
