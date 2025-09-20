// public/assets/nav-include.js
// Consistent, non-flickering top nav with correct active underline on every page.
// Renders synchronously (no fetch), normalizes clean URLs, and prevents reload
// when clicking the currently active tab. Also normalizes footer/legal links.

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
    let p;
    try {
      p = new URL(input, location.origin).pathname || '/';
    } catch {
      p = input || '/';
    }

    // Collapse multiple slashes
    p = p.replace(/\/{2,}/g, '/');

    // Handle index.html in root or subdirs
    const low = p.toLowerCase();
    if (low.endsWith('/index.html')) {
      p = p.slice(0, -('/index.html'.length));
    } else if (low === '/index.html') {
      p = '/';
    }

    // Strip .html extension (support clean-URL routing)
    if (p.toLowerCase().endsWith('.html')) {
      p = p.slice(0, -('.html'.length));
      if (p === '') p = '/';
    }

    // Remove trailing slash for non-root
    if (p !== '/' && p.endsWith('/')) {
      p = p.slice(0, -1);
    }

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

  // Build nav ASAP (script is included with `defer`)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNav);
  } else {
    renderNav();
  }

  // Normalize footer/legal blocks site-wide to "Privacy · Disclaimer" with spacing
  function normalizeFooterBlocks() {
    // 1) .footer-links (present on some pages) — there may be multiple
    document.querySelectorAll('.footer-links').forEach(foot => {
      const links = foot.querySelectorAll('a');
      if (links.length === 1) {
        foot.innerHTML = '';
        const a1 = document.createElement('a');
        a1.href = '/privacy';
        a1.textContent = 'Privacy';
        const dot = document.createElement('span');
        dot.textContent = '·';
        dot.setAttribute('aria-hidden', 'true');
        const a2 = document.createElement('a');
        a2.href = '/disclaimer';
        a2.textContent = 'Disclaimer';
        foot.append(a1, dot, a2);
      } else if (links.length === 2 && !foot.querySelector('span')) {
        const dot = document.createElement('span');
        dot.textContent = '·';
        dot.setAttribute('aria-hidden', 'true');
        links[0].after(dot);
      }
    });

    // 2) Any “legal” block variant used across pages
    document.querySelectorAll('.page-legal, .legal.center, .legal').forEach(legal => {
      // If it’s a single combined link like "Privacy:Disclaimer", replace it
      const aTags = legal.querySelectorAll('a');
      const textOnly = legal.textContent.trim();
      const looksCombined = /privacy\s*:\s*disclaimer/i.test(textOnly);

      if (aTags.length === 1 || looksCombined) {
        legal.innerHTML = '';
        const a1 = document.createElement('a');
        a1.href = '/privacy';
        a1.textContent = 'Privacy';
        const dot = document.createElement('span');
        dot.textContent = '·';
        dot.setAttribute('aria-hidden', 'true');
        const a2 = document.createElement('a');
        a2.href = '/disclaimer';
        a2.textContent = 'Disclaimer';
        legal.append(a1, dot, a2);
      } else if (aTags.length === 2 && !legal.querySelector('span')) {
        const dot = document.createElement('span');
        dot.textContent = '·';
        dot.setAttribute('aria-hidden', 'true');
        aTags[0].after(dot);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeFooterBlocks);
  } else {
    normalizeFooterBlocks();
  }
})();

