<script>
(() => {
  const NAV = [
    { href: "/",                      label: "Home" },
    { href: "/complaint-portal.html", label: "Portal" },
    { href: "/about.html",            label: "About" },
    { href: "/who-can-report.html",   label: "Who can report" },
    { href: "/why-report.html",       label: "Why report" },
    { href: "/our-story.html",        label: "Our story" },
    { href: "/privacy.html",          label: "Privacy" },
    { href: "/disclaimer.html",       label: "Disclaimer" },
  ];

  const same = (a,b)=> (a||'/').replace(/\/+$/,'') === (b||'/').replace(/\/+$/,'');

  async function tryFetch(url){
    try{
      const r = await fetch(url,{cache:'no-store'});
      if(!r.ok) throw 0;
      return await r.text();
    }catch{ return null }
  }

  function headerHTML(){
    const items = NAV.map(n=>`<a href="${n.href}" ${same(location.pathname,n.href)?'aria-current="page"':''}>${n.label}</a>`).join('');
    return `
      <div class="site-header">
        <div class="header-inner">
          <a class="brand" href="/">COVIDAccountabilityNow <small>beta</small></a>
          <button class="nav-toggle" aria-expanded="false" aria-controls="global-nav">Menu</button>
          <nav id="global-nav" class="nav" aria-label="Primary">${items}</nav>
        </div>
      </div>`;
  }

  function footerHTML(){
    const y = new Date().getFullYear();
    return `
      <div class="site-footer">
        <div class="footer-inner">
          <div class="muted">© ${y} COVIDAccountabilityNow</div>
          <div class="footer-links">
            <a href="/privacy.html">Privacy</a>
            <a href="/disclaimer.html">Disclaimer</a>
            <a href="/complaint-portal.html">Report portal</a>
          </div>
        </div>
      </div>`;
  }

  function wireMenu(root){
    const btn = root.querySelector(".nav-toggle");
    const nav = root.querySelector(".nav");
    btn?.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }

  async function mountHeader(){
    const slot = document.querySelector("header#site-header");
    if(!slot) return;
    const frag = await tryFetch("/partials/header.html");
    slot.innerHTML = frag || headerHTML();
    // If fragment didn’t contain nav items, fill now:
    if(!slot.querySelector("#global-nav") || !slot.querySelector("#global-nav").children.length){
      const nav = slot.querySelector("#global-nav");
      if(nav) nav.innerHTML = headerHTML().match(/<nav[^>]*>([\s\S]*)<\/nav>/)[1];
    }
    // ensure current page is highlighted
    slot.querySelectorAll(".nav a").forEach(a=>{
      if(same(a.getAttribute("href"), location.pathname)) a.setAttribute("aria-current","page");
    });
    wireMenu(slot);
  }

  async function mountFooter(){
    const slot = document.querySelector("footer#site-footer");
    if(!slot) return;
    const frag = await tryFetch("/partials/footer.html");
    slot.innerHTML = frag || footerHTML();
  }

  function mountBreadcrumb(){
    const bc = document.getElementById("breadcrumbs");
    if(!bc) return;
    const match = NAV.find(n=>same(n.href, location.pathname));
    const label = match ? match.label : (document.title||"");
    bc.innerHTML = `<a href="/">Home</a> <span class="sep">/</span> <span aria-current="page">${label}</span>`;
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    await Promise.all([mountHeader(), mountFooter()]);
    mountBreadcrumb();
  });
})();
</script>
