// public/assets/js/references-page.js
// Externalized from the old inline module so CSP can stay enforced.

const qs = (sel) => document.querySelector(sel);

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function render() {
  const status = qs('[data-ref-status]');
  const list = qs('[data-ref-list]');
  if (!status || !list) return;

  // Last-checked badge (best-effort)
  try {
    const health = await fetchJSON("/assets/health/references.json");
    const ts = health?.lastChecked || health?.generated_at || health?.generatedAt || null;
    setText(qs('[data-ref-lastchecked]'), ts ? new Date(ts).toLocaleString() : "—");
  } catch {
    setText(qs('[data-ref-lastchecked]'), "—");
  }

  // Load references
  try {
    const items = await fetchJSON("/assets/references.json");

    // Clear “Loading…”
    status.remove();

    if (!Array.isArray(items) || items.length === 0) {
      list.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    // Build accessible list
    const ul = el("ul", { class: "ref-list", role: "list" });
    items.forEach((r) => {
      const title = r.title || r.name || r.url || "Untitled";
      const url = r.url || "#";
      const metaBits = [];
      if (r.source) metaBits.push(r.source);
      if (r.date) metaBits.push(r.date);
      const meta = metaBits.join(" · ");

      const card = el("li", { class: "ref-card" }, [
        el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
        meta ? el("div", { class: "ref-meta" }, meta) : null,
        r.description ? el("p", { class: "ref-desc" }, r.description) : null,
      ]);
      ul.appendChild(card);
    });

    list.appendChild(ul);
  } catch (err) {
    setText(status, "Failed to load references. Please try again later.");
    console.error(err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
