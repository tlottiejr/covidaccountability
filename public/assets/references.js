// public/assets/references.js
(() => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const status = $('#refsStatus');
  const list   = $('#refsList');

  const JSON_SOURCES = ['/api/references', '/assets/references.json'];

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

  function parseJsonStrict(text) {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  }

  async function loadData() {
    for (const src of JSON_SOURCES) {
      try {
        const text = await fetchText(src);
        if (/^\s*</.test(text)) { // returned HTML
          console.warn('[refs] HTML at', src);
          continue;
        }
        const json = parseJsonStrict(text);
        if (Array.isArray(json) && json.length) {
          setStatus(`Loaded ${json.length} references (${src})`);
          return json;
        }
        // accept {items:[...]} shape too
        if (json && Array.isArray(json.items) && json.items.length) {
          setStatus(`Loaded ${json.items.length} references (${src})`);
          return json.items;
        }
      } catch (e) {
        console.warn('[refs] failed source', src, e.message || e);
      }
    }
    setStatus('No references found (check /api/references or /assets/references.json).', true);
    return [];
  }

  function isYouTube(u) {
    try {
      const x = new URL(u);
      return x.hostname.includes('youtube.com') || x.hostname.includes('youtu.be');
    } catch { return false; }
  }
  function ytEmbed(u) {
    try {
      const x = new URL(u);
      if (x.hostname.includes('youtu.be')) {
        const id = x.pathname.slice(1);
        return `https://www.youtube-nocookie.com/embed/${id}`;
      }
      // youtube.com/watch?v=...
      const id = x.searchParams.get('v');
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
    } catch { return ''; }
  }

  function isVimeo(u) {
    try {
      const x = new URL(u);
      return x.hostname.includes('vimeo.com');
    } catch { return false; }
  }
  function vimeoEmbed(u) {
    try {
      const x = new URL(u);
      const id = x.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : '';
    } catch { return ''; }
  }

  function cardHTML(item) {
    const title = item.title || item.name || 'Untitled';
    const url   = item.url || item.link || '';
    const src   = item.source || item.publisher || '';
    const date  = item.date || item.publishedAt || item.updatedAt || '';
    const desc  = item.description || '';

    let body = '';
    if (url && isYouTube(url)) {
      const embed = ytEmbed(url);
      if (embed) {
        body = `
          <div class="embed">
            <iframe src="${embed}" title="${title}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
          </div>`;
      }
    } else if (url && isVimeo(url)) {
      const embed = vimeoEmbed(url);
      if (embed) {
        body = `
          <div class="embed">
            <iframe src="${embed}" title="${title}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
          </div>`;
      }
    }

    const meta = [
      src ? `<span class="small">${src}</span>` : '',
      date ? `<span class="small" style="margin-left:8px;">${date}</span>` : ''
    ].join('');

    // If not embeddable or we still want a link, include it under the player
    const linkOut = url ? `<p><a href="${url}" target="_blank" rel="noopener">Open source</a></p>` : '';

    return `
      <article class="card">
        <h3>${title}</h3>
        ${meta ? `<div>${meta}</div>` : ''}
        ${desc ? `<p>${desc}</p>` : ''}
        ${body || ''}
        ${!body ? linkOut : linkOut}
      </article>`;
  }

  function render(items) {
    if (!items.length) return;
    list.innerHTML = items.map(cardHTML).join('');
    // Make iframes responsive using existing site.css `.embed iframe { width:100%; aspect-ratio:16/9; }` style
  }

  (async function init() {
    const items = await loadData();
    render(items);
  })();
})();
