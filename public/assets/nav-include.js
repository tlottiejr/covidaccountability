// public/assets/nav-include.js
// Build a consistent, non-flickering top nav and normalize footer links.
// No fetches, no partials – renders synchronously to avoid "reload" feel.

(function () {
  /** Canonicalize a path:
   * - keep only pathname
   * - collapse multiple slashes
   * - /index.html -> /
   * - /dir/index.html -> /dir/
   * - strip trailing slash for non-root
   */
  function canonicalizePath(p) {
    try {
      p = new URL(p, location.origin).pathname || '/';
    } catch {
      p = p || '/';
    }
    p = p.replace(/\/{2,}/g, '/');
    if (p.toLowerCase().endsWith('/index.html')) {
      p = p.slice(0, -('/index.html'.length)) || '/';
      if (p !== '/' && !p.endsWith('/')) p += '/';
    } else if (p.toLowerCase() === '/index.html') {
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

    // Build markup in-memory (no network)
    const inner = document.createElement('div');
    inner.className = 'inner';

    NAV_LINKS.forEach(link => {
      const a = document.createElement('a');
      const canonHref = canonicalizePath(link.href);
      a.href = canonHref;
      a.textContent = link.label;

      if (canonHref === current) {
        a.setAttribute('aria-current', 'page');
        // If user clicks the already-active tab, don't navigate (prevents flicker)
        a.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); });
      }

      inner.appendChild(a);
    });

    const top = document.createElement('div');
    top.className = 'top';
    top.appendChild(inner);

    mount.innerHTML = '';
    mount.appendChild(top);
  }

  // Render ASAP (script is loaded with defer)
  renderNav();

  // --- Footer normalization: ensure "Privacy · Disclaimer" is consistent ---
  document.addEventListener('DOMContentLoaded', () => {
    const fl = document.querySelector('.footer-links');
    if (!fl) return;
    const links = fl.querySelectorAll('a');

    // Case 1: one combined link like "Privacy:Disclaimer"
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
      return;
    }

    // Case 2: already two links but missing the dot separator
    if (links.length === 2 && !fl.querySelector('span')) {
      const dot = document.createElement('span');
      dot.textContent = '·';
      dot.setAttribute('aria-hidden', 'true');
      links[0].after(dot);
    }
  });
})();
