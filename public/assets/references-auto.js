// public/assets/references-auto.js
// Coexists with any existing references.js. No-ops if content already present.
(() => {
  const $ = (sel) => document.querySelector(sel);

  async function getJSON(url) {
    const r = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function getText(url) {
    const r = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  // Render curated references from /assets/references.json
  async function renderReferences() {
    const root = $('#referencesRoot');
    if (!root || root.hasChildNodes() || root.dataset.noAuto === '1') return; // respect existing content
    try {
      const data = await getJSON('/assets/references.json');
      if (!data?.categories?.length) { root.innerHTML = '<p>No references available.</p>'; return; }
      const frag = document.createDocumentFragment();
      data.categories.forEach(cat => {
        const h = document.createElement('h3');
        h.textContent = cat.name || 'References';
        frag.appendChild(h);
        const ul = document.createElement('ul');
        (cat.items || []).forEach(it => {
          const li = document.createElement('li');
          if (it.url) {
            const a = document.createElement('a');
            a.href = it.url; a.rel = 'noopener'; a.textContent = it.title || it.url;
            li.appendChild(a);
          } else {
            li.textContent = it.title || '';
          }
          if (it.note) {
            const small = document.createElement('small');
            small.style.marginLeft = '4px';
            small.textContent = ' — ' + it.note;
            li.appendChild(small);
          }
          ul.appendChild(li);
        });
        frag.appendChild(ul);
      });
      root.innerHTML = '';
      root.appendChild(frag);
    } catch { /* silent */ }
  }

  // Inject the generated board index HTML if #boardsRoot is present and empty
  async function renderBoards() {
    const root = $('#boardsRoot');
    if (!root || root.hasChildNodes() || root.dataset.noAuto === '1') return;
    try {
      const html = await getText('/assets/board-index.html');
      root.innerHTML = html;
    } catch { /* silent */ }
  }

  (async function init() {
    await renderReferences();
    await renderBoards();
  })();
})();
