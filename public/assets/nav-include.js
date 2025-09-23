// public/assets/nav-include.js
// Consistent, non-flickering top nav with correct active underline on every page.
// Renders synchronously (no fetch), normalizes clean URLs, and prevents reload
// when clicking the currently active tab. Also normalizes footer/legal links.
// This version adds a "Contact" link and loads helper scripts once per page.

(function () {
  /**
   * Canonicalize a path so that:
   *   - /index.html        -> /
   *   - /dir/index.html    -> /dir
   *   - /about.html        -> /about
   *   - trailing slashes removed for non-root
   *   - multiple slashes collapsed
   */
  function canonicalizePath(input) {
    let p = (input || '/').trim();
    try {
      // Accept full URLs too
      const u = new URL(p, location.origin);
      p = u.pathname;
    } catch {
      // ignore
    }
    p = p.replace(/\/{2,}/g, '/'); // collapse multiple slashes

    // Remove index.html
    p = p.replace(/\/index\.html$/i, '/');

    // Remove .html extension (e.g., /about.html -> /about)
    p = p.replace(/\.html$/i, '');

    // Remove trailing slash for non-root
    if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);

    if (!p) p = '/';
    return p;
  }

  // Define the nav links (extension-less so they match clean URLs)
  const NAV_LINKS = [
    { label: 'Home',            href: '/' },
    { label: 'About Us',        href: '/about' },
    { label: 'Our Story',       href: '/our-story' },
    { label: 'Why Report',      href: '/why-report' },
    { label: 'Who Can Report',  href: '/who-can-report' },
    { label: 'References',      href: '/references' },
    { label: 'Donate',          href: '/donate' },
    // Contact modal (handled by assets/contact.js)
    { label: 'Contact',         href: '#contact', contact: true },
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
      a.href = link.href; // keep #contact for the modal trigger
      a.textContent = link.label;

      if (link.contact) {
        a.setAttribute('data-open-contact', '');
      } else {
        // Correct underline for the current page
        if (canonHref === current) {
          a.setAttribute('aria-current', 'page');
          // Don’t reload if the user clicks the active tab
          a.addEventListener('click', ev => {
            ev.preventDefault();
            return false;
          });
        }
      }

      inner.appendChild(a);
    });

    top.appendChild(inner);
    mount.innerHTML = '';
    mount.appendChild(top);
  }

  // --- Footer normalization: ensure "Privacy · Disclaimer · Contact" ---
  function normalizeFooterBlocks() {
    // These pages have <footer class="container">…</footer>
    document.querySelectorAll('footer.container').forEach(foot => {
      const hasContact = foot.querySelector('[data-open-contact]');
      const links = foot.querySelectorAll('a');
      const text = foot.textContent || '';

      // Normalize only once
      if (hasContact) return;

      // Build standardized footer
      foot.innerHTML = '';

      const a1 = document.createElement('a');
      a1.href = '/privacy';
      a1.textContent = 'Privacy';

      const dot1 = document.createElement('span');
      dot1.textContent = '   ·   ';
      dot1.setAttribute('aria-hidden', 'true');

      const a2 = document.createElement('a');
      a2.href = '/disclaimer';
      a2.textContent = 'Disclaimer';

      const dot2 = document.createElement('span');
      dot2.textContent = '   ·   ';
      dot2.setAttribute('aria-hidden', 'true');

      const a3 = document.createElement('a');
      a3.href = '#contact';
      a3.textContent = 'Contact';
      a3.setAttribute('data-open-contact', '');

      foot.append(a1, dot1, a2, dot2, a3);
    });

    // Back-compat: existing variants the site might use
    // 1) .footer-links (present on some pages)
    document.querySelectorAll('.footer-links').forEach(foot => {
      const hasContact = foot.querySelector('[data-open-contact]');
      if (hasContact) return;

      const links = foot.querySelectorAll('a');
      foot.innerHTML = '';
      const a1 = document.createElement('a');
      a1.href = '/privacy';
      a1.textContent = 'Privacy';
      const dot1 = document.createElement('span');
      dot1.textContent = ' · ';
      dot1.setAttribute('aria-hidden', 'true');
      const a2 = document.createElement('a');
      a2.href = '/disclaimer';
      a2.textContent = 'Disclaimer';
      const dot2 = document.createElement('span');
      dot2.textContent = ' · ';
      dot2.setAttribute('aria-hidden', 'true');
      const a3 = document.createElement('a');
      a3.href = '#contact';
      a3.textContent = 'Contact';
      a3.setAttribute('data-open-contact', '');
      foot.append(a1, dot1, a2, dot2, a3);
    });

    // 2) Any “legal” block variant used across pages
    document.querySelectorAll('.page-legal, .legal.center, .legal').forEach(legal => {
      if (legal.querySelector('[data-open-contact]')) return;
      legal.innerHTML = '';
      const a1 = document.createElement('a'); a1.href = '/privacy';    a1.textContent = 'Privacy';
      const dot1 = document.createElement('span'); dot1.textContent = ' · '; dot1.setAttribute('aria-hidden', 'true');
      const a2 = document.createElement('a'); a2.href = '/disclaimer'; a2.textContent = 'Disclaimer';
      const dot2 = document.createElement('span'); dot2.textContent = ' · '; dot2.setAttribute('aria-hidden', 'true');
      const a3 = document.createElement('a'); a3.href = '#contact';    a3.textContent = 'Contact'; a3.setAttribute('data-open-contact', '');
      legal.append(a1, dot1, a2, dot2, a3);
    });
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

  // Build nav ASAP (script is included with `defer`)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderNav();
      normalizeFooterBlocks();
      loadOnce('/assets/links-newtab.js', 'links-newtab-js');
      loadOnce('/assets/contact.js', 'contact-js');
    });
  } else {
    renderNav();
    normalizeFooterBlocks();
    loadOnce('/assets/links-newtab.js', 'links-newtab-js');
    loadOnce('/assets/contact.js', 'contact-js');
  }
})();
