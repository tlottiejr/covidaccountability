// public/assets/home-timeline.js (REPLACEMENT)
// Title buttons that swap the main player. All three items embed inline using
// explicit embed URLs. No external-link fallbacks.

(() => {
  // Your explicit embed URLs
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
      title: ' Premiere: Inside mRNA Vaccines',
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
      btn.textContent = it.title;     // titles (not dates)
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
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.src = src;
    return f;
  }

  function select(index, items, rail, player) {
    const it = items[index];

    // mark active
    rail.querySelectorAll('.rail-item').forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    // title (still links to original source in a new tab)
    const title = player.querySelector('.video-title');
    title.textContent = it.title;
    title.href = it.url;

    // rebuild iframe each time (prevents ghost overlays/random videos)
    const host = player.querySelector('.frame');
    host.innerHTML = '';
    if (it.embedSrc) {
      host.appendChild(iframeNode(it.embedSrc));
      host.style.background = '#000';
    } else {
      // If an item ever lacks an embedSrc, keep a neutral surface
      host.style.background = '#f8fafc';
    }
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
