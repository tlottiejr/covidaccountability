// public/assets/nav-include.js
// Injects the shared nav and normalizes hrefs so active-state + navigation are consistent sitewide.

(function () {
  // Normalize a path to a canonical form:
  // - drop query/hash
  // - collapse multiple slashes
  // - /index.html => /
  // - /foo/index.html => /foo/
  // - strip trailing slash except for root
  function canonicalizePath(p) {
    try {
      // ensure only pathname is processed
      const u = new URL(p, location.origin);
      p = u.pathname || '/';
    } catch {
      // treat raw path
      p = (p || '/');
    }
    // collapse multi slashes
    p = p.replace(/\/{2,}/g, '/');

    // handle index.html at root or in subdirs
    if (p.toLowerCase().endsWith('/index.html')) {
      p = p.slice(0, -('/index.html'.length)) || '/';
      if (p !== '/' && !p.endsWith('/')) p += '/';
    } else if (p.toLowerCase() === '/index.html') {
      p = '/';
    }

    // ensure trailing slash removed for non-root, non-html paths
    if (p !== '/' && !p.endsWith('.html') && p.endsWith('/')) {
      p = p.slice(0, -1);
    }

    // empty string safety
    if (!p) p = '/';
    return p;
  }

  async function mountNav() {
    const mount = document.getElementById('nav-root');
    if (!mount) return;

    try {
      const res = await fetch('/partials/nav.html', { cache: 'no-store' });
      if (!res.ok) return;
      mount.innerHTML = await res.text();
    } catch (e) {
      console.warn('nav include failed', e);
      return;
    }

    const current = canonicalizePath(location.pathname);

    // Normalize each nav link href and set active state
    const links = mount.querySelectorAll('.top .inner a[href]');
    links.forEach(a => {
      const original = a.getAttribute('href');
      if (!original) return;

      // compute canonical href
      const canonHref = canonicalizePath(original);

      // Write the canonical back into the DOM so future clicks use it
      try {
        const full = new URL(canonHref, location.origin);
        a.setAttribute('href', full.pathname); // keep it path-only
      } catch {
        a.setAttribute('href', canonHref);
      }

      // Set active underline consistently
      if (canonHref === current) {
        a.setAttribute('aria-current', 'page');

        // Prevent navigating to the same page (avoids flicker/reload)
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        }, { once: true });
      }
    });
  }

  // Run immediately; DOM is safe for #nav-root
  mountNav();

  // Footer normalization kept from previous version (if present)
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
