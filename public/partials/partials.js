(async () => {
  async function inject(where, url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const html = await res.text();
      const el = document.createElement("div");
      el.innerHTML = html;
      if (where === "header") document.body.prepend(el.firstElementChild);
      else document.body.append(el.firstElementChild);
    } catch {}
  }

  // If a header/footer isn't present, inject them automatically
  if (!document.querySelector("header.site")) await inject("header", "/partials/header.html");
  if (!document.querySelector("footer.site")) await inject("footer", "/partials/footer.html");

  // Mark current nav item
  const path = location.pathname.replace(/\/+$/, "") || "/";
  document.querySelectorAll('nav.main a[href]').forEach(a => {
    const href = a.getAttribute("href").replace(/\/+$/, "") || "/";
    if (href === path) a.setAttribute("aria-current", "page");
  });
})();
