/* public/assets/js/references-page.js (final restore)
   Desktop (>=981px):
     - Grid has THREE equal rows.
     - Bottom (5th) card spans both columns and is fully visible.
     - Page body is locked; each card scrolls internally.
   Mobile:
     - Natural page scroll; no forced heights.

   Safe: only runs on references.html (checks for .ref-board).
*/
(function(){
  const SEL = {
    board: '.ref-board',
    panel: '.ref-panel',
    title: '.ref-panel__title',
    scroll: '.ref-panel__scroll',
    header: 'header.top, .site-header, .top, header',
    legal:  '.ref-footerlinks, .page-legal, .legal-links'
  };

  const DESKTOP_MIN = 981;
  const isDesktop = () => window.innerWidth >= DESKTOP_MIN;
  const px = n => `${Math.max(0, Math.floor(n))}px`;
  const h = el => el ? el.getBoundingClientRect().height : 0;

  function size(){
    const board = document.querySelector(SEL.board);
    if (!board) return;

    // Reset before measuring (important on breakpoint changes)
    document.body.style.overflow = '';
    board.style.height = '';
    board.querySelectorAll(SEL.panel).forEach(p => p.style.height = '');
    board.querySelectorAll(SEL.scroll).forEach(s => s.style.maxHeight = '');

    if (!isDesktop()) return; // mobile/tablet: natural flow

    const headerH = h(document.querySelector(SEL.header));
    const legalH  = h(document.querySelector(SEL.legal));
    const gap     = parseInt(getComputedStyle(board).gap || '24', 10);

    // Total viewport slice we can use for the board
    const available = Math.max(
      600,                                      // floor
      Math.min(1100, window.innerHeight - headerH - legalH - 24) // cap
    );

    // *** IMPORTANT: The board has THREE rows on desktop. ***
    // Solve for uniform row height given 2 gaps between rows.
    const rowH = Math.floor((available - (gap * 2)) / 3);
    const boardH = (rowH * 3) + (gap * 2);

    // Lock page scroll; board occupies a fixed viewport slice
    document.body.style.overflow = 'hidden';
    board.style.height = px(boardH);

    // Each card consumes one row worth of height
    board.querySelectorAll(SEL.panel).forEach(panel => {
      panel.style.height = px(rowH);

      const title   = panel.querySelector(SEL.title);
      const scroller= panel.querySelector(SEL.scroll);
      if (!scroller) return;

      const cs = getComputedStyle(panel);
      const chrome = (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) +
                     (title ? title.getBoundingClientRect().height : 0) + 6;

      scroller.style.maxHeight = px(Math.max(120, rowH - chrome));
    });
  }

  let raf = 0;
  function onResize(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(size);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector(SEL.board)) return; // run only on the References page
    size();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize).catch(()=>{});
    }
  });
})();
