// public/assets/js/references-page.js
// Runs on references page; robust to existing markup (no HTML changes needed).

const $ = (s) => document.querySelector(s);

function pickStatusEl() {
  return (
    $("[data-ref-status]") ||
    $(".status") ||
    $("#status") ||
    // fallback: first element that currently shows "Loading..."
    Array.from(document.querySelectorAll("div, p, span")).find(
      (n) => (n.textContent || "").trim().toLowerCase() === "loading..."
    ) ||
    null
  );
}

function pickListEl() {
  return (
    $("[data-ref-list]") ||
    $("#references-list") ||
    $("#refList") ||
    // fallback: an empty container after the status
    (pickStatusEl() && pickStatusEl().nextElementSibling) ||
    null
  );
}

function pickLastCheckedEl() {
  return (
    $("[data-ref-lastchecked]") ||
    $("#last-checked") ||
    document.querySelector('time[datetime][data-role="last-checked"]') ||
    null
  );
}

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  ([]).concat(children).forEach((c) =>
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c)
  );
  return n;
}

async function render() {
  const statusEl = pickStatusEl();
  const listEl = pickListEl();
  const lastCheckedEl = pickLastCheckedEl();

  if (!statusEl || !listEl) return; // graceful no-op

  // Last-checked badge (best effort)
  try {
    const health = await getJSON("/assets/health/references.json");
    const ts = health?.lastChecked || health?.generated_at || health?.generatedAt || null;
    if (lastCheckedEl) lastCheckedEl.textContent = ts ? new Date(ts).toLocaleString() : "—";
  } catch {
    if (lastCheckedEl) lastCheckedEl.textContent = "—";
  }

  try {
    const items = await getJSON("/assets/references.json");
    // Clear “Loading…”
    statusEl.remove();

    if (!Array.isArray(items) || items.length === 0) {
      listEl.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    // Build list that inherits your existing page styles
    const ul = el("ul", { class: "ref-list", role: "list" });
    items.forEach((r) => {
      const title = r.title || r.name || r.url || "Untitled";
      const url = r.url || "#";
      const metaBits = [];
      if (r.source) metaBits.push(r.source);
      if (r.date) metaBits.push(r.date);
      const meta = metaBits.join(" · ");
      const li = el("li", { class: "ref-card" }, [
        el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
        meta ? el("div", { class: "ref-meta" }, meta) : null,
        r.description ? el("p", { class: "ref-desc" }, r.description) : null,
      ]);
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
  } catch (err) {
    statusEl.textContent = "Failed to load references. Please try again later.";
    // Keep one console line for diagnostics; does not affect users.
    console.error("[references] fetch error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
