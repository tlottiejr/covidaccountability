/* public/assets/js/references-page.js (restored stable)
   Restores the 'before' layout:
   - Desktop (>=981px): two rows of cards; last card spans both columns; each card has an internal scroll.
   - Mobile: natural page scroll, no JS sizing.
   The code is **scoped** to references.html only (presence of .ref-board).
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

    // Reset first (important on breakpoint changes)
    document.body.style.overflow = '';
    board.style.height = '';
    board.querySelectorAll(SEL.panel).forEach(p => p.style.height = '');
    board.querySelectorAll(SEL.scroll).forEach(s => s.style.maxHeight = '');

    if (!isDesktop()) return; // mobile/tablet: let the page scroll normally

    const gap = parseInt(getComputedStyle(board).gap || '24', 10);
    const available = Math.max(
      560, // minimum total board height
      Math.min(
        920, // cap to avoid comically tall cards on big screens
        window.innerHeight - h(document.querySelector(SEL.header)) - h(document.querySelector(SEL.legal)) - 24
      )
    );

    // Match the old behavior: page doesn’t scroll; cards scroll inside
    document.body.style.overflow = 'hidden';
    board.style.height = px(available);

    // Two rows: each row is half the board (minus the grid gap)
    const rowH = Math.floor((available - gap) / 2);

    board.querySelectorAll(SEL.panel).forEach(panel => {
      panel.style.height = px(rowH);

      const title = panel.querySelector(SEL.title);
      const scroll = panel.querySelector(SEL.scroll);
      if (!scroll) return;

      const cs = getComputedStyle(panel);
      const chrome = (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) +
                     (title ? title.getBoundingClientRect().height : 0) + 6;

      scroll.style.maxHeight = px(Math.max(140, rowH - chrome));
    });
  }

  let raf = 0;
  function onResize(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(size);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector(SEL.board)) return; // only run on references.html
    size();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize).catch(()=>{});
    }
  });
})();
