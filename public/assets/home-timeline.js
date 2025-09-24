// public/assets/home-timeline.js (REPLACEMENT)
// Title buttons that swap the main player. No extra title bar above the player.
// Vera Sharav loads by default on first paint.

(() => {
  // Explicit embed URLs (stable)
  const ITEMS = [
    {
      title: 'PSI: Hearing Voices of the Vaccine Injured',
      url:   'https://rumble.com/v6tzgi2-psi-hearing-voices-of-the-vaccine-injured.html',
      embedSrc: 'https://rumble.com/embed/v6tzgi2/?pub=4',
      date: '2025-09-01'
    },
    {
      title: 'How Healers Become Killers — Vera Sharav',
      url:   'https://rumble.com/v6pzh4t-how-healers-become-killers-vera-sharav.html',
      embedSrc: 'https://rumble.com/embed/v6pzh4t/?pub=4',
      date: '2025-08-15'
    },
    {
      title: 'Premiere: Inside mRNA Vaccines',
      url:   'https://www.youtube.com/watch?v=BZrJraN2nOQ',
      embedSrc: 'https://www.youtube.com/embed/BZrJraN2nOQ',
      date: '2025-07-20'
    }
  ];

  function renderRail(root, items, onSelect) {
    const rail = document.createElement('div');
    rail.className = 'video-rail';
    rail.innerHTML = '<div class="container" role="tablist" aria-label="Featured media"></div>';
    const track = rail.firstElementChild;

    items.forEach((it, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item';
      btn.dataset.index = String(idx);
      btn.textContent = it.title;     // show titles as requested
      btn.title = it.title;
      btn.addEventListener('click', () => onSelect(idx));
      track.appendChild(btn);
    });

    root.appendChild(rail);
    return rail;
  }

  function renderPlayer(root) {
    const wrap = document.createElement('div');
    wrap.className = 'video-player';
    // NOTE: no extra title bar here—only the iframe frame
    wrap.innerHTML = `<div class="frame"></div>`;
    root.appendChild(wrap);
    return wrap;
  }

  function iframeNode(src) {
    const f = document.createElement('iframe');
    f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen', 'true');
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.src = src;
    return f;
  }

  function select(index, items, rail, player) {
    // highlight active button
    rail.querySelectorAll('.rail-item').forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    // rebuild iframe
    const host = player.querySelector('.frame');
    host.innerHTML = '';
    const src = items[index].embedSrc;
    if (src) {
      host.appendChild(iframeNode(src));
      host.style.background = '#000';
    } else {
      host.style.background = '#f8fafc';
    }
  }

  function mount() {
    const host = document.getElementById('home-media');
    if (!host) return;

    // Keep order newest-first for the rail
    const items = ITEMS.slice().sort((a,b)=> (a.date < b.date ? 1 : -1));

    const rail = renderRail(host, items, (i) => select(i, items, rail, player));
    const player = renderPlayer(host);

    // Default to Vera Sharav on load (fall back to first if not found)
    let defaultIndex = items.findIndex(it => /vera\s*sharav/i.test(it.title));
    if (defaultIndex < 0) defaultIndex = 0;
    select(defaultIndex, items, rail, player);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
