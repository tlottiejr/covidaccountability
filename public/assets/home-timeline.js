// public/assets/home-timeline.js
// Homepage: clickable timeline rail + main player. Title links to original source.

(() => {
  // Seed items (add more later)
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
      const u = new URL(url);
      // YouTube
      if (/youtube\.com$/.test(u.hostname)) {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (/youtu\.be$/.test(u.hostname)) {
        const id = u.pathname.split('/').pop();
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      // Rumble
      if (/rumble\.com$/.test(u.hostname)) {
        const m = u.pathname.match(/\/v([a-z0-9]+)(?:-|\.|$)/i) || u.pathname.match(/\/video\/([a-z0-9]+)/i);
        if (m) return `https://rumble.com/embed/v${m[1]}/?pub=4`;
        if (u.pathname.includes('/embed/')) return u.toString();
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
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'rail-item';
      a.dataset.index = String(idx);
      a.innerHTML = `<span>${label}</span>`;
      a.addEventListener('click', () => onSelect(idx));
      track.appendChild(a);
    });

    root.appendChild(rail);
    return rail;
  }

  function renderPlayer(root) {
    const wrap = document.createElement('div');
    wrap.className = 'video-player';
    wrap.innerHTML = `
      <div class="title"><a class="video-title" href="#" target="_blank" rel="noopener"></a></div>
      <div class="frame"><iframe allowfullscreen loading="lazy"></iframe></div>
    `;
    root.appendChild(wrap);
    return wrap;
  }

  function select(index, items, rail, player) {
    const it = items[index];
    const embed = toEmbed(it.url);
    const buttons = rail.querySelectorAll('.rail-item');
    buttons.forEach(b => b.removeAttribute('aria-current'));
    const active = rail.querySelector(`.rail-item[data-index="${index}"]`);
    if (active) active.setAttribute('aria-current', 'true');

    const title = player.querySelector('.video-title');
    const frame = player.querySelector('iframe');
    frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');

    title.textContent = it.title;
    title.href = it.url;

    if (embed) {
      frame.src = embed;
      frame.parentElement.style.background = '#000';
    } else {
      // Not a video; show blank frame with link only
      frame.removeAttribute('src');
      frame.parentElement.style.background = '#f8fafc';
    }
  }

  function mount() {
    const host = document.getElementById('home-media');
    if (!host) return;

    const items = ITEMS.slice().sort((a,b)=> (a.date < b.date ? 1 : -1)); // newest first
    const rail = renderRail(host, items, (i) => select(i, items, rail, player));
    const player = renderPlayer(host);

    // Inline steps list already in HTML beneath #home-media

    // Default: first item (newest)
    select(0, items, rail, player);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
