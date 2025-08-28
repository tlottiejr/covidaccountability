<script>
(() => {
  const NAV = [
    { href: "/", label: "Home" },
    { href: "/complaint-portal.html", label: "Portal" },
    { href: "/about.html", label: "About" },
    { href: "/who-can-report.html", label: "Who can report" },
    { href: "/why-report.html", label: "Why report" },
    { href: "/our-story.html", label: "Our story" },
    { href: "/privacy.html", label: "Privacy" },
    { href: "/disclaimer.html", label: "Disclaimer" },
  ];

  function isActive(href){
    const here = location.pathname.replace(/\/+$/,'') || '/';
    const there = href.replace(/\/+$/,'') || '/';
    return here === there;
  }

  async function inject(selector, url){
    const el = document.querySelector(selector);
    if(!el) return null;
    const res = await fetch(url, {cache:'no-store'});
    el.innerHTML = await res.text();
    return el;
  }

  function enhanceHeader(root){
    const nav = root.querySelector('#global-nav');
    if(nav){
      // Fill nav from NAV map
      nav.innerHTML = NAV.map(l =>
        `<a href="${l.href}" ${isActive(l.href) ? 'aria-current="page"' : ''}>${l.label}</a>`
      ).join('');
    }
    const btn = root.querySelector(".nav-toggle");
    const navEl = root.querySelector(".nav");
    btn?.addEventListener("click", () => {
      const open = navEl.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  function renderBreadcrumb(){
    const bc = document.getElementById('breadcrumbs');
    if(!bc) return;
    const here = location.pathname.replace(/\/+$/,'') || '/';
    const home = `<a href="/">Home</a>`;
    const match = NAV.find(n => (n.href.replace(/\/+$/,'')||'/') === here);
    const current = match ? match.label : document.title || 'Page';
    bc.innerHTML = `${home} <span class="sep">/</span> <span aria-current="page">${current}</span>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const header = await inject('header#site-header', '/partials/header.html');
    if(header) enhanceHeader(header);
    await inject('footer#site-footer', '/partials/footer.html');
    renderBreadcrumb();
  });
})();
</script>
