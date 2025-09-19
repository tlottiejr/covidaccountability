// public/assets/nav-include.js
// Consistent, non-flickering top nav with correct active underline.
// Builds synchronously (no fetch), canonicalizes paths, and prevents reload
// when clicking the currently active tab.

(function () {
  function canonicalizePath(p) {
    try {
      p = new URL(p, location.origin).pathname || '/';
    } catch {
      p = p || '/';
    }
    p = p.replace(/\/{2,}/g, '/'); // collapse // -> /
    const low = p.toLowerCase();
    if (low.endsWith('/index.html')) {
      p = p.slice(0, -('/index.html'.length)) || '/';
      if (p !== '/' && !p.endsWith('/')) p += '/';
    } else if (low === '/index.html') {
      p = '/';
    }
    if (p !== '/' && !p.endsWith('.html') && p.endsWith('/')) p = p.slice(0, -1);
    if (!p) p = '/';
    return p;
  }

  const NAV_LINKS = [
    { label: 'Home',            href: '/' },
    { label: 'About Us',        href: '/about.html' },
    { label: 'Our Story',       href: '/our-story.html' },
    { label: 'Why Report',      href: '/why-report.html' },
    { label: 'Who Can Report',  href: '/who-can-report.html' },
    { label: 'References',      href: '/references.html' },
    { label: 'Donate',          href: '/donate.html' },
  ];

  function renderNav() {
    const mount = document.getElementById('nav-root');
    if (!mount) return;

    const current = canonicalizePath(location.pathname);

    const top = document.createElement('div');
    top.className = 'top';

    const inner = document.createElement('div');
    inner.className = 'inner';

    NAV_LINKS.forEach(link => {
      const a = document.createElement('a');
      const canonHref = canonicalizePath(link.href);
      a.href = canonHref;
      a.textContent = link.label;

      // Correct underline for the current page
      if (canonHref === current) {
        a.setAttribute('aria-current', 'page');
        // Don’t reload if the user clicks the active tab
        a.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
        });
      }

      inner.appendChild(a);
    });

    top.appendChild(inner);
    mount.innerHTML = '';
    mount.appendChild(top);
  }

  // Build nav immediately (script should be loaded with defer)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNav);
  } else {
    renderNav();
  }

  // Normalize footer “Privacy · Disclaimer” sitewide
  function normalizeFooter() {
    const fl = document.querySelector('.footer-links');
    if (!fl) return;
    const links = fl.querySelectorAll('a');

    // One combined link -> split into two with dot
    if (links.length === 1) {
      fl.innerHTML = '';
      const a1 = document.createElement('a');
      a1.href = '/privacy.html';
      a1.textContent = 'Privacy';
      const dot = document.createElement('span');
      dot.textContent = '·';
      dot.setAttribute('aria-hidden', 'true');
      const a2 = document.createElement('a');
      a2.href = '/disclaimer.html';
      a2.textContent = 'Disclaimer';
      fl.append(a1, dot, a2);
    } else if (links.length === 2 && !fl.querySelector('span')) {
      const dot = document.createElement('span');
      dot.textContent = '·';
      dot.setAttribute('aria-hidden', 'true');
      links[0].after(dot);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeFooter);
  } else {
    normalizeFooter();
  }
})();
