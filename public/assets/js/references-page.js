// public/assets/js/references-page.js
// Robust references renderer that works with the existing markup & styling.
// No HTML changes needed.

const $ = (s, root = document) => root.querySelector(s);

// ---- pickers are generous so we don't depend on specific IDs/classes ----
function pickStatusEl() {
  // preferred hooks if present
  const hook =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references-status") ||
    $(".status");
  if (hook) return hook;

  // fallback: the first element whose text contains "loading"
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const t = (n.textContent || "").toLowerCase();
    if (t.includes("loading")) return n;
  }
  return null;
}

function pickLastCheckedEl() {
  return (
    $("[data-ref-lastchecked]") ||
    $("#last-checked") ||
    $("time[datetime][data-role='last-checked']") ||
    // fallback: a span immediately after text "Last checked:"
    (() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if ((walker.currentNode.nodeValue || "").trim().toLowerCase().startsWith("last checked")) {
          const el = walker.currentNode.parentElement;
          if (el) {
            // look for a following span/time in the same parent
            const cands = el.querySelectorAll("span, time");
            if (cands.length) return cands[cands.length - 1];
          }
        }
      }
      return null;
    })()
  );
}

function pickListMount(statusEl) {
  // preferred hook
  const hook = $("[data-ref-list]") || $("#references-list") || $("#refList");
  if (hook) return hook;

  // fallback: an empty div right after status element, else the status' parent
  if (statusEl && statusEl.nextElementSibling && statusEl.nextElementSibling.children.length === 0) {
    return statusEl.nextElementSibling;
  }
  return statusEl ? statusEl.parentElement : document.body;
}

async function getJSONwithFallback(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error(`${u} -> ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all URLs failed");
}

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

async function render() {
  const statusEl = pickStatusEl();
  const listMount = pickListMount(statusEl);
  const lastCheckedEl = pickLastCheckedEl();

  // Update "Last checked" from any of the known artifact shapes
  try {
    const health = await getJSONwithFallback([
      "/assets/health/references.json",
      "/assets/health/references/index.json",
      "/assets/health/references/latest.json"
    ]);
    const ts = health?.lastChecked || health?.generated_at || health?.generatedAt || health?.date || null;
    if (lastCheckedEl) lastCheckedEl.textContent = ts ? new Date(ts).toLocaleString() : "—";
  } catch {
    if (lastCheckedEl) lastCheckedEl.textContent = "—";
  }

  try {
    // Try the canonical file first, then common alternates
    const items = await getJSONwithFallback([
      "/assets/references.json",
      "/assets/data/references.json",
      "/assets/references/index.json"
    ]);

    // Remove the "Loading..." node if we found one
    if (statusEl && statusEl.parentElement) statusEl.remove();

    if (!Array.isArray(items) || items.length === 0) {
      listMount.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    // Build a UL that inherits your page styles (no new CSS needed)
    const ul = el("ul", { class: "ref-list", role: "list" });
    for (const r of items) {
      const title = r.title || r.name || r.url || "Untitled";
      const url = r.url || "#";
      const metaBits = [];
      if (r.source) metaBits.push(r.source);
      if (r.date) metaBits.push(r.date);
      const meta = metaBits.join(" · ");

      const li = el("li", { class: "ref-card" }, [
        el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
        meta ? el("div", { class: "ref-meta" }, meta) : null,
        r.description ? el("p", { class: "ref-desc" }, r.description) : null
      ]);
      ul.appendChild(li);
    }
    listMount.appendChild(ul);
  } catch (err) {
    if (statusEl) statusEl.textContent = "Failed to load references. Please try again later.";
    console.error("[references] fetch error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
