// public/assets/nav-include.js (REPLACEMENT)

(function () {
  function canonicalizePath(input) {
    let p = (input || '/').trim();
    try { p = new URL(p, location.origin).pathname; } catch {}
    p = p.replace(/\/{2,}/g, '/').replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  // Wordmark: "COVIDA" blue + "N" in Now blue; "ow" remains black; NOT a link
  function wordmarkHTML() {
    return `
      <span class="logo-wordmark" aria-label="COVIDAccountabilityNow">
        <span class="accent">COVIDA</span>ccountability<span class="accent">N</span>ow
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
        <div class="logo" role="img">${wordmarkHTML()}</div>
        <nav class="nav" aria-label="Primary"></nav>
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
        a.addEventListener('click', (ev) => ev.preventDefault());
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

  function renderFooter() {
    document.querySelectorAll('footer.container').forEach((foot) => {
      if (foot.__standardized) return;
      foot.__standardized = true;
      foot.innerHTML = '';
      const mkSep = () => {
        const s = document.createElement('span');
        s.className = 'sep';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = '·';
        return s;
      };
      const a1 = Object.assign(document.createElement('a'), { href: '/privacy.html', textContent: 'Privacy' });
      const a2 = Object.assign(document.createElement('a'), { href: '/disclaimer.html', textContent: 'Disclaimer' });
      const a3 = Object.assign(document.createElement('a'), { href: '#contact', textContent: 'Contact' });
      a3.setAttribute('data-open-contact', '');
      foot.append(a1, mkSep(), a2, mkSep(), a3);
    });
  }

  function init() {
    renderNav();
    renderTrustStrip();
    renderFooter();

    // global helpers
    const p = canonicalizePath(location.pathname);
    const load = (src, id) => { if (!document.getElementById(id)) { const s=document.createElement('script'); s.id=id; s.src=src; s.defer=true; document.body.appendChild(s);} };
    load('/assets/links-newtab.js', 'links-newtab-js');
    load('/assets/contact.js', 'contact-js');

    // home-only timeline
    if (p === '/') load('/assets/home-timeline.js', 'home-timeline-js');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
