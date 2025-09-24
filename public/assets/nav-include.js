// public/assets/nav-include.js (REPLACEMENT)

(function () {
  function canonicalizePath(input) {
    let p = (input || '/').trim();
    try { p = new URL(p, location.origin).pathname; } catch {}
    p = p.replace(/\/{2,}/g, '/').replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  // Wordmark: "COVIDA" and the trailing "N" in blue
  function wordmarkHTML() {
    // "COVIDAccountabilityNow" -> accent "COVIDA" + "N"
    return `
      <span class="logo-wordmark">
        <span class="accent">COVIDA</span>ccountabilityNo<span class="accent">n</span>
      </span>
    `;
  }

  const NAV_LINKS = [
    { label: 'Home',            href: '/' },
    { label: 'About Us',        href: '/about' },
    { label: 'Our Story',       href: '/our-story' },
    { label: 'Why Report',      href: '/why-report' },
    { label: 'Who Can Report',  href: '/who-can-report' },
    { label: 'References',      href: '/references' },
    { label: 'Donate',          href: '/donate' },
    { label: 'Contact',         href: '#contact', contact: true },
  ];

  function renderNav() {
    const mount = document.getElementById('nav-root');
    if (!mount) return;
    const current = canonicalizePath(location.pathname);

    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="container header-flex">
        <a class="logo" href="/"> ${wordmarkHTML()} </a>
        <nav class="nav"></nav>
      </div>
    `;

    const nav = header.querySelector('.nav');
    NAV_LINKS.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.label;
      if (link.contact) a.setAttribute('data-open-contact', '');
      if (!link.contact && canonicalizePath(link.href) === current) {
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', ev => ev.preventDefault());
      }
      nav.appendChild(a);
    });

    mount.innerHTML = '';
    mount.appendChild(header);
  }

  async function renderTrustStrip() {
    const host = document.querySelector('.site-header');
    if (!host) return;

    const strip = document.createElement('div');
    strip.className = 'trust-strip';
    const inner = document.createElement('div');
    inner.className = 'container trust-grid';

    // states/territories count (from state-links.json)
    let countText = 'States & territories covered';
    try {
      const res = await fetch('/assets/state-links.json', { cache: 'reload' });
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data.states) ? data.states.length
                    : Array.isArray(data) ? data.length : null;
        if (count) countText = `${count} states & territories covered`;
      }
    } catch {}

    inner.innerHTML = `
      <div class="trust-item"><b>${countText}</b></div>
      <div class="trust-item"><b>No data collected</b></div>
    `;
    strip.appendChild(inner);
    host.insertAdjacentElement('afterend', strip);
  }

  function loadOnce(src, id) {
    if (id && document.getElementById(id)) return;
    if ([...document.scripts].some(s => s.src.endsWith(src))) return;
    const s = document.createElement('script');
    if (id) s.id = id;
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  }

  function init() {
    renderNav();
    renderTrustStrip();

    // global helpers
    loadOnce('/assets/links-newtab.js', 'links-newtab-js');
    loadOnce('/assets/contact.js', 'contact-js');

    // home-only timeline
    if (canonicalizePath(location.pathname) === '/') {
      loadOnce('/assets/home-timeline.js', 'home-timeline-js');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
