// public/assets/nav-include.js
// Injects the shared nav and normalizes footer links sitewide.

(async function () {
  // Mount top nav from partial
  try {
    const mount = document.getElementById('nav-root');
    if (mount) {
      const res = await fetch('/partials/nav.html', { cache: 'no-store' });
      if (res.ok) {
        mount.innerHTML = await res.text();
        // Highlight active link
        const path = location.pathname.replace(/\/+$/, '') || '/';
        document.querySelectorAll('.top .inner a[href]').forEach(a => {
          try {
            const href = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/, '') || '/';
            if (href === path) a.setAttribute('aria-current', 'page');
          } catch {}
        });
      }
    }
  } catch (e) {
    // silent fail – nav is non-critical
    console.warn('nav include failed', e);
  }

  // Normalize footer links: turn "Privacy:Disclaimer" into "Privacy · Disclaimer"
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
