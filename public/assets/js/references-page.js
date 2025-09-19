// public/assets/js/references-page.js
// Fits the 4 references panels so the page itself doesn't scroll (desktop).
// It ONLY uses existing classes already in your repo: .ref-board, .ref-panel, .ref-panel__scroll

(function () {
  // Run only on /references (with or without trailing slash or query)
  var onRefs = /\/references(?:\/|$|\?)/i.test(location.pathname + location.search);
  if (!onRefs) return;

  function fit() {
    var board = document.querySelector('.ref-board');
    if (!board) return;

    // Try to detect your sticky header height (.top) and the legal links row
    var header = document.querySelector('header.top');
    var legal  = document.querySelector('.legal-links, .page-legal');

    var vh       = window.innerHeight;
    var headerH  = header ? header.offsetHeight : 64;
    var legalH   = legal  ? legal.offsetHeight  : 28;
    var pad      = 48;        // breathing room inside the gradient section
    var rowGap   = 16;        // must match CSS grid gap between rows
    var titlePad = 20;        // padding inside each card around the title

    // Total height available for the grid (2 rows)
    var gridH = vh - headerH - legalH - pad;
    if (gridH < 320) gridH = Math.floor(vh * 0.7); // safety lower bound

    // Two rows on desktop; one column on narrow via CSS breakpoint
    var oneCol = window.matchMedia('(max-width: 980px)').matches;

    // Get all scroll areas (your markup already uses .ref-panel__scroll)
    var scrollAreas = Array.from(document.querySelectorAll('.ref-panel__scroll'));
    if (!scrollAreas.length) return;

    if (oneCol) {
      // Mobile: let page scroll naturally; don't force heights
      scrollAreas.forEach(function (el) { el.style.maxHeight = ''; });
      return;
    }

    // Desktop: two rows, subtract a single row gap
    var perRow = (gridH - rowGap) / 2;

    // Compute per-card body height = rowHeight - titleHeight - padding
    scrollAreas.forEach(function (el) {
      var panel  = el.closest('.ref-panel') || el.parentElement;
      var title  = panel ? panel.querySelector('.ref-panel__title, h2') : null;
      var tH     = title ? title.offsetHeight : 28;
      var maxH   = Math.max(160, Math.floor(perRow - tH - titlePad));
      el.style.maxHeight = maxH + 'px';
      // Ensure it's scrollable
      el.style.overflow = 'auto';
    });

    // Guard: clamp once more if the page still overflows by a hair
    var diff = document.scrollingElement.scrollHeight - window.innerHeight;
    if (diff > 0) {
      var step = Math.ceil(diff / scrollAreas.length) + 4;
      scrollAreas.forEach(function (el) {
        var cur = parseInt(getComputedStyle(el).maxHeight || '0', 10) || 280;
        el.style.maxHeight = Math.max(140, cur - step) + 'px';
      });
    }
  }

  function onReady(cb) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
    else cb();
  }

  onReady(fit);
  window.addEventListener('resize', fit);
})();
