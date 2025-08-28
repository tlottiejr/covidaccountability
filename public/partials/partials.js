<script>
(async () => {
  const inject = async (sel, url) => {
    const host = document.querySelector(sel);
    if (!host) return;
    try {
      const r = await fetch(url, { cache: "no-store" });
      host.innerHTML = await r.text();
    } catch (e) {
      console.warn("Partial failed:", url, e);
    }
  };

  await Promise.all([
    inject("#site-header", "/partials/header.html"),
    inject("#site-footer", "/partials/footer.html"),
  ]);

  // Active link highlight
  const path = location.pathname.replace(/\/+$/, "") || "/";
  document.querySelectorAll('a[data-nav]').forEach(a => {
    const href = (a.getAttribute("data-nav") || "").replace(/\/+$/, "") || "/";
    if (href === path) a.classList.add("active");
  });
})();
</script>
