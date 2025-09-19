/* references-page.js
 * Makes each card internally scrollable and prevents the page itself from scrolling,
 * while keeping the top nav visible and the footer links centered in the gradient.
 */

(function () {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  const header = qs('.site-header');
  const wrap = qs('.ref-wrap');
  const board = qs('.ref-board');
  const panels = qsa('.ref-panel');
  const footLinks = qs('.ref-footerlinks');

  function px(n) { return `${Math.max(0, Math.floor(n))}px`; }

  function layout() {
    if (!wrap || !board || !panels.length) return;

    const vh = window.innerHeight;
    const headerH = header ? header.getBoundingClientRect().height : 0;

    // Target area for the board + footer within the gradient
    const available = vh - headerH;

    // We want the board to fill most of that area and the footer links to sit at the bottom
    const footerH = footLinks ? footLinks.getBoundingClientRect().height : 0;
    const boardGap = 24; // grid gap & breathing room
    const boardTarget = Math.max(320, available - footerH - boardGap);

    // Lock the main wrapper to viewport (no page scroll)
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';

    // Constrain the references wrapper
    wrap.style.minHeight = px(available);
    wrap.style.maxHeight = px(available);
    wrap.style.overflow = 'hidden';
    wrap.style.display = 'block';

    // Size the board
    board.style.height = px(boardTarget);
    board.style.maxHeight = px(boardTarget);
    board.style.overflow = 'hidden';

    // For each panel, compute internal scroll height
    panels.forEach(panel => {
      const title = panel.querySelector('.ref-panel__title');
      const scroller = panel.querySelector('.ref-panel__scroll');
      if (!scroller) return;

      const panelRect = panel.getBoundingClientRect();
      // Reserve padding + title space (16 top + title + some spacing)
      const titleH = title ? title.getBoundingClientRect().height : 0;
      const PADDING = 32; // padding/rounding allowance

      const innerMax = panelRect.height - titleH - PADDING;
      scroller.style.height = px(innerMax);
      scroller.style.maxHeight = px(innerMax);
      scroller.style.overflow = 'auto';
      scroller.style.webkitOverflowScrolling = 'touch';
    });

    // Center footer links under the board, inside the gradient
    if (footLinks) {
      const boardRect = board.getBoundingClientRect();
      const used = headerH + boardRect.height;
      const remain = vh - used;
      // add a little offset so it kisses the gradient nicely
      footLinks.style.marginTop = px(Math.max(8, remain - 8));
    }
  }

  // Reflow on load and resize (debounced)
  let rafId = 0;
  function onResize() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(layout);
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('load', layout, { once: true });
  document.addEventListener('DOMContentLoaded', layout, { once: true });
})();
