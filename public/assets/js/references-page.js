// public/assets/js/references-page.js
// Final layout fitter for References panels.

function isMobile() {
  return window.matchMedia('(max-width:980px)').matches;
}

function fitReferencePanels() {
  const board = document.querySelector('.ref-board');
  if (!board) return;

  const scrollAreas = board.querySelectorAll('.ref-panel__scroll');

  // Mobile: normal page flow & scrolling.
  if (isMobile()) {
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';
    scrollAreas.forEach(el => {
      const panel = el.closest('.ref-panel');
      if (panel) panel.style.height = '';
      el.style.maxHeight = '';
    });
    return;
  }

  // Desktop: lock page scroll so we don't get the white blip.
  document.documentElement.style.overflowY = 'hidden';
  document.body.style.overflowY = 'hidden';

  // Compute max card height available in the viewport.
  const boardRect = board.getBoundingClientRect();

  // Reserve space for the footer/legal links if present.
  const legal = document.querySelector('.page-legal, .legal-links');
  const legalReserve = legal ? (legal.getBoundingClientRect().height + 24) : 40;

  // Extra breathing room under the grid.
  const bottomGap = 12;

  const viewport = window.innerHeight;
  const maxPanelHeight = Math.max(
    240,
    viewport - boardRect.top - legalReserve - bottomGap
  );

  scrollAreas.forEach(el => {
    const panel = el.closest('.ref-panel');
    if (!panel) return;

    // Set the panel’s overall height.
    panel.style.height = `${maxPanelHeight}px`;

    // Calculate how tall the inner scroll area can be (panel minus title/padding).
    const panelStyle = getComputedStyle(panel);
    const paddingTop = parseFloat(panelStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(panelStyle.paddingBottom) || 0;

    // Sum siblings' heights (title, etc.)
    let siblingsHeight = 0;
    panel.childNodes.forEach(node => {
      if (node.nodeType === 1 && node !== el) {
        const r = node.getBoundingClientRect();
        siblingsHeight += r.height;
      }
    });

    const inner = maxPanelHeight - siblingsHeight - paddingTop - paddingBottom;
    el.style.maxHeight = `${Math.max(inner, 120)}px`;
  });
}

// Run on ready + resize
function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
ready(fitReferencePanels);
window.addEventListener('resize', () => { requestAnimationFrame(fitReferencePanels); });
