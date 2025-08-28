// /public/assets/nav.js
document.addEventListener('DOMContentLoaded', () => {
  // If already present, bail.
  if (document.querySelector('.topnav-wrap')) return;

  const wrap = document.createElement('div');
  wrap.className = 'topnav-wrap';
  wrap.innerHTML = `
    <nav class="topnav" aria-label="Primary">
      <a href="/"                 data-path="^/$">Home</a>
      <a href="/complaint-portal.html" data-path="/complaint-portal\\.html$">Portal</a>
      <a href="/about.html"       data-path="/about\\.html$">About</a>
      <a href="/who-can-report.html" data-path="/who-can-report\\.html$">Who can report</a>
      <a href="/why-report.html"  data-path="/why-report\\.html$">Why report</a>
      <a href="/our-story.html"   data-path="/our-story\\.html$">Our story</a>
      <a href="/privacy.html"     data-path="/privacy\\.html$">Privacy</a>
      <a href="/disclaimer.html"  data-path="/disclaimer\\.html$">Disclaimer</a>
    </nav>
  `;
  document.body.prepend(wrap);

  // Mark the active link
  const here = location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.topnav a').forEach(a => {
    const rx = new RegExp(a.dataset.path);
    if (rx.test(here)) a.classList.add('active');
  });
});
