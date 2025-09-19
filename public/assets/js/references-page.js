/* public/assets/js/references-page.js
   References page behavior: keep the header visible, prevent page scroll,
   and size each panel’s inner scroller so the 4 cards fit the viewport.
*/
(function () {
  const SELECTORS = {
    board: '.ref-board',
    panel: '.ref-panel',
    title: '.ref-panel__title',
    scroll: '.ref-panel__scroll',
    legal: '.legal-links, .page-legal, .ref-footerlinks',
    header: 'header.top, .site-header, .top, header'
  };

  const isNarrow = () => window.innerWidth <= 980;

  function getHeaderHeight() {
    const header = document.querySelector(SELECTORS.header);
    return header ? header.getBoundingClientRect().height : 0;
  }

  function getLegalHeight() {
    const el = document.querySelector(SELECTORS.legal);
    return el ? el.getBoundingClientRect().height : 0;
  }

  function sizeBoard() {
    const board = document.querySelector(SELECTORS.board);
    if (!board) return;

    // On narrow/mobile, let the whole page scroll naturally.
    if (isNarrow()) {
      document.body.style.overflow = '';
      board.style.height = '';
      // remove fixed heights on scroll regions
      board.querySelectorAll(SELECTORS.scroll).forEach(sc => {
        sc.style.maxHeight = '';
      });
      return;
    }

    // Desktop: no page scroll; board fits viewport.
    const vh = window.innerHeight;
    const headerH = getHeaderHeight();
    const legalH = getLegalHeight();
    const paddings = 16; // breathing room
    const boardH = Math.max(320, vh - headerH - legalH - paddings);

    // lock the page scroll and set the board’s height
    document.body.style.overflow = 'hidden';
    board.style.height = boardH + 'px';

    // Each panel should stretch to board height; inner scroller = panel minus title/padding.
    // (Panels use consistent paddings in CSS, so we can safely subtract ~28–36px.)
    board.querySelectorAll(SELECTORS.panel).forEach(panel => {
      const title = panel.querySelector(SELECTORS.title);
      const scroll = panel.querySelector(SELECTORS.scroll);
      if (!scroll) return;

      const titleH = title ? title.getBoundingClientRect().height : 0;
      // Extra chrome/padding/margins inside the card
      const chrome = 28;
      const maxH = boardH - titleH - chrome;

      scroll.style.maxHeight = Math.max(120, maxH) + 'px';
    });
  }

  // Debounce to avoid thrashing on resize
  let raf = 0;
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sizeBoard);
  }

  // Init only on the references page
  document.addEventListener('DOMContentLoaded', () => {
    const board = document.querySelector(SELECTORS.board);
    if (!board) return;

    sizeBoard();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // If fonts load late and change metrics, reflow once more
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize).catch(() => {});
    }
  });
})();
