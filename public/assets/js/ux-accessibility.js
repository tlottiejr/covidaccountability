// public/assets/js/ux-accessibility.js
(() => {
  // --- 1) Ensure there is a #main and inject a "Skip to content" link
  const main = document.querySelector('main') || (() => {
    const m = document.createElement('main');
    m.setAttribute('role', 'main');
    document.body.prepend(m);
    return m;
  })();
  if (!main.id) main.id = 'main';

  // Insert skip link at very top of body
  const skip = document.createElement('a');
  skip.href = '#main';
  skip.textContent = 'Skip to content';
  skip.className = 'skip-to-content';
  // Add visually-hidden until focused via CSS (rules appended below)
  document.body.prepend(skip);

  // --- 2) Anchor offset for sticky headers (customize height if needed)
  const header = document.querySelector('header');
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const offset = Math.max(56, Math.ceil(headerHeight)); // sane default
  const style = document.createElement('style');
  style.textContent = `
    :root { --anchor-offset: ${offset}px; }
    /* Skip link styles */
    .skip-to-content {
      position: absolute; left: 0.5rem; top: 0.5rem; z-index: 1000;
      background: #fff; padding: 0.5rem 0.75rem; border-radius: 0.375rem;
      box-shadow: 0 1px 2px rgba(0,0,0,.1); text-decoration: none;
      color: inherit; transform: translateY(-200%); transition: transform .15s ease;
    }
    .skip-to-content:focus { transform: translateY(0); outline: 2px solid #000; }
    /* Anchor offset: when navigating to #hash, create space above target */
    :target::before {
      content: ""; display: block; height: var(--anchor-offset);
      margin-top: calc(var(--anchor-offset) * -1);
    }
  `;
  document.head.appendChild(style);

  // --- 3) Mobile nav focus trap (opt-in by data attribute)
  // Markup expectations (progressive): 
  // <button data-nav-toggle aria-controls="mobile-drawer">Menu</button>
  // <nav id="mobile-drawer" data-mobile-drawer hidden>...</nav>
  const toggleBtn = document.querySelector('[data-nav-toggle]');
  const drawer = document.querySelector('[data-mobile-drawer]');
  if (toggleBtn && drawer) {
    const openDrawer = () => {
      drawer.hidden = false;
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('role', 'dialog');
      drawer.dataset.open = 'true';
      const focusables = drawer.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusables[0] || drawer;
      const last = focusables[focusables.length - 1] || drawer;
      const keyHandler = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
        if (e.key === 'Tab' && focusables.length) {
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      };
      drawer.addEventListener('keydown', keyHandler);
      drawer.dataset.keyHandler = 'true';
      setTimeout(() => first.focus(), 0);
      // click outside to close
      document.addEventListener('click', function outside(e){
        if (!drawer.contains(e.target) && e.target !== toggleBtn) {
          closeDrawer();
          document.removeEventListener('click', outside);
        }
      });
      function closeDrawer(){
        drawer.hidden = true;
        drawer.removeAttribute('aria-modal');
        drawer.removeAttribute('role');
        drawer.dataset.open = 'false';
        toggleBtn.focus();
      }
      drawer.dataset.close = '1';
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.addEventListener('click', closeDrawer, { once: true });
    };
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (drawer.dataset.open === 'true') {
        drawer.hidden = true;
        drawer.dataset.open = 'false';
        toggleBtn.setAttribute('aria-expanded', 'false');
      } else {
        openDrawer();
      }
    });
  }
})();
