/* public/assets/js/references-page.js
   References page behavior (safe, scoped):
   - On desktop (>=981px): lock page scroll, size the board to viewport,
     split the board into two equal rows so each card has an internal scroller.
   - On mobile: do nothing special; page scrolls naturally.
   This script only touches the References page DOM and will not affect other pages.
*/
(function () {
  const S = {
    board: '.ref-board',
    panel: '.ref-panel',
    title: '.ref-panel__title',
    scroll: '.ref-panel__scroll',
    header: 'header.top, .site-header, .top, header',
    legal:  '.legal-links, .page-legal, .ref-footerlinks'
  };

  const DESKTOP_MIN = 981;
  const isDesktop = () => window.innerWidth >= DESKTOP_MIN;
  const px = n => `${Math.max(0, Math.floor(n))}px`;

  function headerH(){
    const el = document.querySelector(S.header);
    return el ? el.getBoundingClientRect().height : 0;
  }
  function legalH(){
    const el = document.querySelector(S.legal);
    return el ? el.getBoundingClientRect().height : 0;
  }

  function sizeBoard(){
    const board = document.querySelector(S.board);
    if (!board) return;

    // Reset before recalculating (important on breakpoint changes)
    board.style.height = '';
    board.querySelectorAll(S.panel).forEach(p => p.style.height = '');
    board.querySelectorAll(S.scroll).forEach(s => s.style.maxHeight = '');

    if (!isDesktop()){
      // Mobile/tablet: let the page scroll normally.
      document.body.style.overflow = '';
      return;
    }

    const gap = parseInt(getComputedStyle(board).gap || '24', 10);
    const viewportH = window.innerHeight;
    const available = Math.max(320, viewportH - headerH() - legalH() - 16);

    // Lock page scroll and set the board’s height to the viewport slice
    document.body.style.overflow = 'hidden';
    board.style.height = px(available);

    // Two rows on desktop → each row gets half (minus the grid gap)
    const rowH = Math.floor((available - gap) / 2);

    // Set each panel to the row height; constrain its inner scroller
    board.querySelectorAll(S.panel).forEach(panel => {
      panel.style.height = px(rowH);

      const title = panel.querySelector(S.title);
      const scroll = panel.querySelector(S.scroll);
      if (!scroll) return;

      const cs = getComputedStyle(panel);
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const titleHeight = title ? title.getBoundingClientRect().height : 0;
      const chrome = padV + titleHeight + 6;

      scroll.style.maxHeight = px(Math.max(120, rowH - chrome));
    });
  }

  let raf = 0;
  function onResize(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sizeBoard);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector(S.board)) return; // only on the references page
    sizeBoard();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize).catch(() => {});
    }
  });
})();
