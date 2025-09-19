/* public/assets/js/references-page.js
   - Loads /assets/references.json
   - Groups into 5 categories
   - Alphabetizes each category by title
   - Desktop: 3 equal rows, internal scroll within cards
   - Mobile: natural page scroll
*/
(function(){
  const lists = {
    general:  document.getElementById('ref-list-general'),
    gov:      document.getElementById('ref-list-gov'),
    edu:      document.getElementById('ref-list-edu'),
    peer:     document.getElementById('ref-list-peer'),
    preprint: document.getElementById('ref-list-preprints'),
  };

  const CATEGORY = {
    GENERAL: 'general',
    GOV: 'gov',
    EDU: 'edu',
    PEER: 'peer',
    PREPRINT: 'preprint'
  };

  function inferCategory(item){
    if (item.category) return item.category;
    const t = (item.title||'').toLowerCase();
    const host = (()=>{ try { return new URL(item.url).host.toLowerCase(); } catch(_) { return ''; } })();

    // Government & Legal
    if (/whitehouse\.gov|supremecourt\.gov|hhs\.gov|aspr\.hhs\.gov|federalregister\.gov|ag\.ks\.gov|attorneygeneral|texasattorneygeneral/.test(host)) return CATEGORY.GOV;
    if (/fact sheet|supreme court|complaint|report on lessons|prep act|questions & answers|misinformation policy|disinformation policy/.test(t)) return CATEGORY.GOV;

    // Medical Education & Ethics
    if (/usmle|first aid|mksap|ethics manual|ama code|shared decision|nic[e] guidelines/i.test(t)) return CATEGORY.EDU;
    if (/acpjournals\.org|ama-assn\.org|aafp\.org|usmle\.org/.test(host)) return CATEGORY.EDU;

    // Peer-reviewed
    if (/nejm|lancet|vaccine|jamanetwork|dialogues in health|g med sci/i.test(t)) return CATEGORY.PEER;
    if (/nejm\.org|thelancet\.com|jamanetwork|sciencedirect\.com|doi\.org|thegms\.co|thegms\.org/.test(host)) return CATEGORY.PEER;

    // Preprints & Working Papers
    if (/researchgate|correlation-canada/.test(host)) return CATEGORY.PREPRINT;

    // General
    return CATEGORY.GENERAL;
  }

  function renderItem(item){
    const metaBits = [];
    if (item.source) metaBits.push(item.source);
    if (item.year)   metaBits.push(item.year);
    const meta = metaBits.length ? `<br/><span class="ref-meta">${metaBits.join(' · ')}</span>` : '';
    const note = item.description ? `<p class="ref-note">${item.description}</p>` : '';
    return `<li>
      <a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>${meta}${note}
    </li>`;
  }

  function sortAlpha(a,b){ return a.title.localeCompare(b.title, undefined, {sensitivity:'base'}); }

  async function load(){
    const resp = await fetch('/assets/references.json', {cache:'no-store'});
    const all = await resp.json();

    const buckets = {
      [CATEGORY.GENERAL]: [],
      [CATEGORY.GOV]: [],
      [CATEGORY.EDU]: [],
      [CATEGORY.PEER]: [],
      [CATEGORY.PREPRINT]: [],
    };

    all.forEach(it => {
      const c = inferCategory(it);
      buckets[c].push(it);
    });

    // Alphabetize per bucket
    Object.keys(buckets).forEach(k => buckets[k].sort(sortAlpha));

    // Render
    const map = {
      [CATEGORY.GENERAL]: lists.general,
      [CATEGORY.GOV]: lists.gov,
      [CATEGORY.EDU]: lists.edu,
      [CATEGORY.PEER]: lists.peer,
      [CATEGORY.PREPRINT]: lists.preprint
    };
    Object.keys(map).forEach(k => {
      map[k].innerHTML = buckets[k].map(renderItem).join('');
    });
  }

  // --- sizing logic (3 equal rows on desktop) ---
  const DESKTOP_MIN = 981;
  const isDesktop = () => window.innerWidth >= DESKTOP_MIN;
  const px = n => `${Math.max(0, Math.floor(n))}px`;
  const h = el => el ? el.getBoundingClientRect().height : 0;

  function size(){
    const board = document.querySelector('.ref-board');
    if (!board) return;

    // reset
    document.body.style.overflow='';
    board.style.height='';
    board.querySelectorAll('.ref-panel').forEach(p=>p.style.height='');
    board.querySelectorAll('.ref-panel__scroll').forEach(s=>s.style.maxHeight='');

    if (!isDesktop()) return; // mobile: natural flow

    const header = document.querySelector('header.top, .site-header, header');
    const footer = document.querySelector('.page-legal, .legal-links, .ref-footerlinks');
    const headerH = h(header);
    const footerH = h(footer);
    const gap     = parseInt(getComputedStyle(board).gap || '24', 10);

    const available = Math.max(600, Math.min(1100, window.innerHeight - headerH - footerH - 24));
    const rowH = Math.floor((available - (gap * 2)) / 3); // 3 rows
    const boardH = (rowH * 3) + (gap * 2);

    document.body.style.overflow = 'hidden';
    board.style.height = px(boardH);

    board.querySelectorAll('.ref-panel').forEach(panel => {
      panel.style.height = px(rowH);
      const title = panel.querySelector('.ref-panel__title');
      const scroll = panel.querySelector('.ref-panel__scroll');
      if (!scroll) return;
      const cs = getComputedStyle(panel);
      const chrome = (parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)) +
                     (title ? title.getBoundingClientRect().height : 0) + 6;
      scroll.style.maxHeight = px(Math.max(120, rowH - chrome));
    });
  }

  let raf=0; const onResize=()=>{cancelAnimationFrame(raf); raf=requestAnimationFrame(size);};

  document.addEventListener('DOMContentLoaded', async ()=>{
    await load();
    size();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});
  });
})();

