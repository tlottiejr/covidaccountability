// public/assets/home-timeline.js (REPLACEMENT)
// Timeline rail + player. Robust Rumble parsing and prevents stale iframes.

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
      title: 'YouTube Feature',
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

      // Rumble:
      //  - watch URL: /v<ID>-title.html or /video/<ID>
      //  - embed URL: /embed/v<ID>/
      if (/rumble\.com$/i.test(u.hostname)) {
        const path = u.pathname;
        const m =
          path.match(/\/v([a-z0-9]+)(?:-|\.|$)/i) ||
          path.match(/\/video\/([a-z0-9]+)/i);
        if (m && m[1]) {
          const id = m[1];
          return `https://rumble.com/embed/v${id}/`;
        }
        if (path.includes('/embed/')) return u.toString();
      }
    } catch {}
    return null;
  }

  function renderRail(root, items, onSelect) {
    const rail = document.createElement('div');
    rail.className = 'video-rail';
    rail.innerHTML = '<div class="container"></div>';
    const track = rail.firstElementChild;

    items.forEach((it, idx) => {
      const label = new Date(it.date).toLocaleDateString(undefined, { year:'numeric', month:'short' });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item';
      btn.dataset.index = String(idx);
      btn.textContent = label;
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
      <div class="frame"><iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>
    `;
    root.appendChild(wrap);
    return wrap;
  }

  function select(index, items, rail, player) {
    const it = items[index];
    const embed = toEmbed(it.url);

    // set selection state
    rail.querySelectorAll('.rail-item').forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    // update title + link
    const title = player.querySelector('.video-title');
    title.textContent = it.title;
    title.href = it.url;

    // always reset iframe before changing src to avoid ghost frames
    const frame = player.querySelector('iframe');
    frame.removeAttribute('src');

    if (embed) {
      frame.src = embed;
      frame.parentElement.style.background = '#000';
    } else {
      // Not a video: keep a light backdrop; link still works
      frame.parentElement.style.background = '#f8fafc';
    }
  }

  function mount() {
    const host = document.getElementById('home-media');
    if (!host) return;

    const items = ITEMS.slice().sort((a,b)=> (a.date < b.date ? 1 : -1)); // newest first
    const rail = renderRail(host, items, (i) => select(i, items, rail, player));
    const player = renderPlayer(host);

    select(0, items, rail, player); // default to newest
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
