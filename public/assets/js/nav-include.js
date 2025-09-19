// public/assets/nav-include.js
(function () {
  const el = document.getElementById('nav-root');
  if (!el) return;

  const links = [
    { href: '/', label: 'Home', key: '/' },
    { href: '/about.html', label: 'About Us', key: '/about' },
    { href: '/our-story.html', label: 'Our Story', key: '/our-story' },
    { href: '/why-report.html', label: 'Why Report', key: '/why-report' },
    { href: '/who-can-report.html', label: 'Who Can Report', key: '/who-can-report' },
    { href: '/references.html', label: 'References', key: '/references' },
    { href: '/donate.html', label: 'Donate', key: '/donate' }
  ];

  const path = location.pathname.replace(/index\.html$/, '');
  const nav = `
  <header class="top">
    <div class="wrap">
      <nav aria-label="Primary">
        <ul class="nav__list">
          ${links.map(l => {
            const active = path === l.key;
            return `<li class="nav__item${active ? ' is-active' : ''}">
              <a href="${l.href}" ${active ? 'aria-current="page"' : ''}>${l.label}</a>
            </li>`;
          }).join('')}
        </ul>
      </nav>
    </div>
  </header>`;
  el.innerHTML = nav;
})();
