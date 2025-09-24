// public/assets/nav-include.js (REPLACEMENT)
// Renders top nav, adds a trust strip under the header, and conditionally
// loads homepage helpers. Keeps hard edges and active tab underline.

(function () {
  function canonicalizePath(input) {
    let p = (input || '/').trim();
    try { p = new URL(p, location.origin).pathname; } catch {}
    p = p.replace(/\/{2,}/g, '/').replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  // Build logo with color accents: "COVIDA" + trailing "N" in brand blue
  function wordmarkHTML() {
    const base = 'COVIDAccountabilityNow';
    return `
      <span class="logo-wordmark" style="font-weight:700; font-size:18px; letter-spacing:.2px;">
        <span style="color:#2563eb;">COVIDA</span>ccountabilityNo<span style="color:#2563eb;">w</span>
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

    const container = document.createElement('div');
    container.className = 'container';
    header.appendChild(container);

    const logo = document.createElement('a');
    logo.className = 'logo';
    logo.href = '/';
    logo.innerHTML = wordmarkHTML();
    container.appendChild(logo);

    const nav = document.createElement('nav');
    nav.className = 'nav';
    container.appendChild(nav);

    NAV_LINKS.forEach(link => {
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.label;
      if (link.contact) a.setAttribute('data-open-contact', '');
      else if (canonicalizePath(link.href) === current) {
        a.setAttribute('aria-current', 'page');
        a.addEventListener('click', ev => { ev.preventDefault(); });
      }
      nav.appendChild(a);
    });

    mount.innerHTML = '';
    mount.appendChild(header);
  }

  // Trust strip right under header (slim; out of the way)
  async function renderTrustStrip() {
    const host = document.querySelector('.site-header');
    if (!host) return;

    const strip = document.createElement('div');
    strip.className = 'trust-strip';
    const inner = document.createElement('div');
    inner.className = 'container';

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
      <div class="trust-item"><b>Local-only PDF</b></div>
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

    // Always-on helpers
    loadOnce('/assets/links-newtab.js', 'links-newtab-js');
    loadOnce('/assets/contact.js', 'contact-js');

    // Home-only timeline
    const p = canonicalizePath(location.pathname);
    if (p === '/') {
      loadOnce('/assets/home-timeline.js', 'home-timeline-js');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
