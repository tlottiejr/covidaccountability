// public/assets/home-timeline.js (REPLACEMENT)
// Timeline rail as BUTTONS labeled with TITLES (not dates). Robust Rumble embeds,
// and we rebuild the iframe on each selection to avoid ghost overlays.

(() => {
  const ITEMS = [
    {
      title: 'PSI: Hearing Voices of the Vaccine Injured',
      url: 'https://rumble.com/v6w6cqw-psi-hearing-voices-of-the-vaccine-injured.html',
      date: '2025-09-01'
    },
    {
      title: 'How Healers Become Killers — Vera Sharav',
      url: 'https://rumble.com/v6s6ddn-how-healers-become-killers-vera-sharav.html?e9s=src_v1_s%2Csrc_v1_s_o',
      date: '2025-08-15'
    },
    {
      title: 'Premiere: Inside mRNA Vaccines',
      url: 'https://www.youtube.com/watch?v=BZrJraN2nOQ',
      date: '2025-07-20'
    }
  ];

  function toEmbed(url) {
    try {
      const u = new URL(url, location.href);

      // YouTube
      if (/youtube\.com$/i.test(u.hostname)) {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (/youtu\.be$/i.test(u.hostname)) {
        const id = u.pathname.split('/').pop();
        if (id) return `https://www.youtube.com/embed/${id}`;
      }

      // Rumble -> canonical embed with ?pub=4 (most reliable)
      if (/rumble\.com$/i.test(u.hostname)) {
        const m = u.pathname.match(/\/v([a-z0-9]+)(?:-|\.|$)/i) || u.pathname.match(/\/video\/([a-z0-9]+)/i);
        if (m && m[1]) return `https://rumble.com/embed/v${m[1]}/?pub=4`;
        if (u.pathname.includes('/embed/')) return u.toString().includes('?') ? u.toString() : `${u.toString()}?pub=4`;
      }
    } catch {}
    return null;
  }

  function renderRail(root, items, onSelect) {
    const rail = document.createElement('div');
    rail.className = 'video-rail';
    rail.innerHTML = '<div class="container" role="tablist" aria-label="Media timeline"></div>';
    const track = rail.firstElementChild;

    items.forEach((it, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item';
      btn.dataset.index = String(idx);
      btn.textContent = it.title;          // << titles instead of dates
      btn.title = it.title;                // tooltip for long titles
      btn.addEventListener('click', () => onSelect(idx));
      track.appendChild(btn);
    });

    root.appendChild(rail);
    return rail;
  }

  function renderPlayer(root) {
    const wrap = document.createElement('div');
    wrap.className = 'video-player';
    wrap.innerHTML = `
      <div class="title"><a class="video-title" href="#" target="_blank" rel="noopener"></a></div>
      <div class="frame"></div>
    `;
    root.appendChild(wrap);
    return wrap;
  }

  function iframeNode(src) {
    const f = document.createElement('iframe');
    f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen', 'true');
    f.setAttribute('loading', 'lazy');
    if (src) f.src = src;
    return f;
  }

  function select(index, items, rail, player) {
    const it = items[index];
    const embed = toEmbed(it.url);

    // mark active button
    rail.querySelectorAll('.rail-item').forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    // title above player links to source
    const title = player.querySelector('.video-title');
    title.textContent = it.title;
    title.href = it.url;

    // rebuild iframe to avoid stale overlays/ghost frames
    const frameHost = player.querySelector('.frame');
    frameHost.innerHTML = '';
    frameHost.appendChild(iframeNode(embed));
    frameHost.style.background = embed ? '#000' : '#f8fafc';
  }

  function mount() {
    const host = document.getElementById('home-media');
    if (!host) return;

    const items = ITEMS.slice().sort((a,b)=> (a.date < b.date ? 1 : -1)); // newest first
    const rail = renderRail(host, items, (i) => select(i, items, rail, player));
    const player = renderPlayer(host);
    select(0, items, rail, player);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
