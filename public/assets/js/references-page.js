/* public/assets/js/references-page.js */
(function(){
  const SEL = {
    board: '.ref-board',
    panel: '.ref-panel',
    title: '.ref-panel__title',
    scroll: '.ref-panel__scroll',
    header: 'header.top, .site-header, header',
    legal:  '.page-legal, .legal-links, .ref-footerlinks'
  };
  const DESKTOP_MIN = 981;
  const isDesktop = () => window.innerWidth >= DESKTOP_MIN;
  const px = n => `${Math.max(0, Math.floor(n))}px`;
  const h = el => el ? el.getBoundingClientRect().height : 0;

  function size(){
    const board = document.querySelector(SEL.board);
    if (!board) return;
    document.body.style.overflow=''; board.style.height='';
    board.querySelectorAll(SEL.panel).forEach(p=>p.style.height='');
    board.querySelectorAll(SEL.scroll).forEach(s=>s.style.maxHeight='');

    if (!isDesktop()) return;

    const headerH = h(document.querySelector(SEL.header));
    const legalH  = h(document.querySelector(SEL.legal));
    const gap     = parseInt(getComputedStyle(board).gap || '24', 10);

    const available = Math.max(600, Math.min(1100, window.innerHeight - headerH - legalH - 24));
    const rowH = Math.floor((available - (gap * 2)) / 3);  // THREE rows on desktop
    const boardH = (rowH * 3) + (gap * 2);

    document.body.style.overflow = 'hidden';
    board.style.height = px(boardH);

    board.querySelectorAll(SEL.panel).forEach(panel => {
      panel.style.height = px(rowH);
      const title = panel.querySelector(SEL.title);
      const scroll = panel.querySelector(SEL.scroll);
      if (!scroll) return;
      const cs = getComputedStyle(panel);
      const chrome = (parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)) +
                     (title ? title.getBoundingClientRect().height : 0) + 6;
      scroll.style.maxHeight = px(Math.max(120, rowH - chrome));
    });
  }

  let raf=0; const onResize=()=>{cancelAnimationFrame(raf); raf=requestAnimationFrame(size);};
  document.addEventListener('DOMContentLoaded', ()=>{
    if (!document.querySelector(SEL.board)) return;
    size(); window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});
  });
})();

