// public/assets/references.js
(() => {
  const $  = (s) => document.querySelector(s);
  const status = $('#refsStatus');
  const list   = $('#refsList');

  const SOURCES = ['/api/references', '/assets/references.json'];

  function setStatus(msg, danger=false) {
    status.className = 'card small' + (danger ? ' danger' : '');
    status.textContent = msg;
  }

  async function fetchText(url, timeout=10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(t); }
  }

  function parseJson(text) {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  }

  async function loadRefs() {
    for (const src of SOURCES) {
      try {
        const text = await fetchText(src);
        if (/^\s*</.test(text)) continue; // HTML (e.g., Access page)
        const json = parseJson(text);
        const items = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
        if (items.length) { setStatus(`Loaded ${items.length} references (${src})`); return items; }
      } catch (e) { /* try next */ }
    }
    setStatus('No references found (check /api/references or /assets/references.json).', true);
    return [];
  }

  const isYouTube = (u) => {
    try { const x = new URL(u); return x.hostname.includes('youtube.com') || x.hostname.includes('youtu.be'); }
    catch { return false; }
  };
  const ytEmbed = (u) => {
    try {
      const x = new URL(u);
      if (x.hostname.includes('youtu.be')) return `https://www.youtube-nocookie.com/embed/${x.pathname.slice(1)}`;
      const id = x.searchParams.get('v'); return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
    } catch { return ''; }
  };

  const isVimeo = (u) => {
    try { const x = new URL(u); return x.hostname.includes('vimeo.com'); }
    catch { return false; }
  };
  const vimeoEmbed = (u) => {
    try { const x = new URL(u); const id = x.pathname.split('/').filter(Boolean).pop(); return id ? `https://player.vimeo.com/video/${id}` : ''; }
    catch { return ''; }
  };

  function cardHTML(item) {
    const title = item.title || item.name || 'Untitled';
    const url   = item.url || item.link || '';
    const src   = item.source || item.publisher || '';
    const date  = item.date || item.publishedAt || item.updatedAt || '';
    const desc  = item.description || '';

    let embed = '';
    if (url && isYouTube(url)) embed = ytEmbed(url);
    else if (url && isVimeo(url)) embed = vimeoEmbed(url);

    return `
      <article class="card">
        <h3>${title}</h3>
        ${src || date ? `<div class="small">${[src, date].filter(Boolean).join(' · ')}</div>` : ''}
        ${desc ? `<p>${desc}</p>` : ''}
        ${embed ? `<div class="embed"><iframe src="${embed}" title="${title}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : ''}
        ${url ? `<p><a href="${url}" target="_blank" rel="noopener">Open source</a></p>` : ''}
      </article>
    `;
  }

  function render(items) {
    list.innerHTML = items.map(cardHTML).join('');
  }

  (async () => { render(await loadRefs()); })();
})();

