// public/assets/home-timeline.js (REPLACEMENT)
// Title buttons that swap the main player. Uses explicit EMBED URLs for reliability.

(() => {
  // IMPORTANT: Use explicit embedSrc for each item to avoid parsing/redirect issues.
  const ITEMS = [
    {
      title: 'PSI: Hearing Voices of the Vaccine Injured',
      url:   'https://rumble.com/v6w6cqw-psi-hearing-voices-of-the-vaccine-injured.html',
      embedSrc: 'https://rumble.com/embed/v6w6cqw/?pub=4',
      date: '2025-09-01'
    },
    {
      title: 'How Healers Become Killers — Vera Sharav',
      url:   'https://rumble.com/v6s6ddn-how-healers-become-killers-vera-sharav.html?e9s=src_v1_s%2Csrc_v1_s_o',
      embedSrc: 'https://rumble.com/embed/v6s6ddn/?pub=4',
      date: '2025-08-15'
    },
    {
      title: 'YouTube Feature',
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
      btn.textContent = it.title;    // titles (not dates)
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
    f.setAttribute('referrerpolicy', 'no-referrer'); // avoids odd referrer-based behavior
    f.src = src;
    return f;
  }

  function select(index, items, rail, player) {
    const it = items[index];

    // highlight active
    rail.querySelectorAll('.rail-item').forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    // title above player links to source
    const title = player.querySelector('.video-title');
    title.textContent = it.title;
    title.href = it.url;

    // rebuild iframe from explicit embedSrc (no parsing)
    const frameHost = player.querySelector('.frame');
    frameHost.innerHTML = '';
    if (it.embedSrc) {
      frameHost.appendChild(iframeNode(it.embedSrc));
      frameHost.style.background = '#000';
    } else {
      frameHost.style.background = '#f8fafc';
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
