// public/assets/home-timeline.js (REPLACEMENT)
// Title buttons that swap the main player. Uses explicit embedSrc when allowed,
// otherwise shows a clear fallback card with the reason (Premium/disabled).

(() => {
  // If you get an embeddable mirror later, just fill embedSrc and remove the note.
  const ITEMS = [
    {
      title: 'PSI: Hearing Voices of the Vaccine Injured',
      url:   'https://rumble.com/v6w6cqw-psi-hearing-voices-of-the-vaccine-injured.html',
      embedSrc: null, // premium -> no embed
      note: 'This video is Rumble Premium, which cannot be embedded. Opening on Rumble…',
      date: '2025-09-01'
    },
    {
      title: 'How Healers Become Killers — Vera Sharav',
      url:   'https://rumble.com/v6s6ddn-how-healers-become-killers-vera-sharav.html?e9s=src_v1_s%2Csrc_v1_s_o',
      embedSrc: null, // publisher blocks/unstable embed -> no embed
      note: 'Embedding is disabled by the publisher. Opening the original on Rumble…',
      date: '2025-08-15'
    },
    {
      title: 'YouTube Feature',
      url:   'https://www.youtube.com/watch?v=BZrJraN2nOQ',
      embedSrc: 'https://www.youtube.com/embed/BZrJraN2nOQ',
      note: '',
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
      btn.textContent = it.title;
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
      <div class="embed-note" aria-live="polite" hidden></div>
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

  function fallbackCard(it) {
    const div = document.createElement('div');
    div.className = 'embed-fallback';
    div.innerHTML = `
      <p>${it.note || 'This video can’t be embedded here.'}</p>
      <a class="btn" target="_blank" rel="noopener" href="${it.url}">
        Open on ${/rumble\.com/i.test(it.url) ? 'Rumble' : 'source'}
      </a>
    `;
    return div;
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

    // swap content
    const host = player.querySelector('.frame');
    const note = player.querySelector('.embed-note');
    host.innerHTML = '';
    note.hidden = true;
    note.textContent = '';

    if (it.embedSrc) {
      host.appendChild(iframeNode(it.embedSrc));
      host.style.background = '#000';
    } else {
      host.appendChild(fallbackCard(it));
      host.style.background = '#f8fafc';
      if (it.note) {
        note.hidden = false;
        note.textContent = it.note;
      }
    }
  }

  function mount() {
    const host = document.getElementById('home-media');
    if (!host) return;
    const items = ITEMS.slice().sort((a,b)=> (a.date < b.date ? 1 : -1));
    const rail = renderRail(host, items, (i) => select(i, items, rail, player));
    const player = renderPlayer(host);
    select(0, items, rail, player);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
