// /assets/nav.js
(() => {
  const items = [
    { href: "/",                       label: "Home" },
    { href: "/complaint-portal.html",  label: "Portal" },
    { href: "/about.html",             label: "About" },
    { href: "/who-can-report.html",    label: "Who can report" },
    { href: "/why-report.html",        label: "Why report" },
    { href: "/our-story.html",         label: "Our story" },
    { href: "/privacy.html",           label: "Privacy" },
    { href: "/disclaimer.html",        label: "Disclaimer" },
  ];
  const normalize = p => p.replace(/\/index\.html?$/, "/");
  const here = normalize(location.pathname);
  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML = items.map(i => {
    const active = normalize(i.href) === here ? ' class="active" aria-current="page"' : "";
    return `<a href="${i.href}"${active}>${i.label}</a>`;
  }).join("");

  const bar = document.createElement("div");
  bar.className = "site-nav-wrap";
  bar.appendChild(nav);

  // Prepend inside your main .container if present, else body
  (document.querySelector(".container") || document.body).prepend(bar);
})();
