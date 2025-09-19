// public/assets/js/references-page.js
// Renders inside the existing "Loading..." card. Keeps your layout/styles intact.
// Adds: robust "Last checked" + category grouping (uses item.category or inference).

const $ = (s, r = document) => r.querySelector(s);

/* ---------- helpers to find the right nodes already on your page ---------- */
function findStatusAndMount() {
  // Find the "Loading..." element
  let status =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references-status") ||
    $(".status");

  if (!status) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (tw.nextNode()) {
      const t = (tw.currentNode.textContent || "").trim().toLowerCase();
      if (t === "loading..." || t === "loading…") {
        status = tw.currentNode;
        break;
      }
    }
  }

  // Mount point = the card that controls centering/padding/shadow
  let mount = null;
  if (status) {
    if (status.nextElementSibling && status.nextElementSibling.children.length === 0) {
      mount = status.nextElementSibling; // empty sibling after status
    } else {
      mount = status.parentElement;      // render in same card
    }
  }
  return { status, mount };
}

const lastCheckedNode = () =>
  $("[data-ref-lastchecked]") ||
  $("#last-checked") ||
  document.querySelector('time[datetime][data-role="last-checked"]');

/* -------------------------- fetch utilities -------------------------- */
async function getJSON(url, noStore = true) {
  const res = await fetch(url, noStore ? { cache: "no-store" } : undefined);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}
async function head(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.headers;
}
async function firstJSON(urls) {
  let lastErr;
  for (const u of urls) {
    try { return await getJSON(u); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all candidates failed");
}

/* --------------------- Last-checked resolution ---------------------- */
async function resolveLastChecked() {
  // 1) Try health artifact(s) with several common field names
  try {
    const health = await firstJSON([
      "/assets/health/references.json",
      "/assets/health/references/index.json",
      "/assets/health/references/latest.json"
    ]);
    const candidate =
      health.lastChecked ||
      health.generated_at ||
      health.generatedAt ||
      health.updated ||
      health.date ||
      null;
    if (candidate) return new Date(candidate);
  } catch {/* ignore and fall through */}

  // 2) Fall back to Last-Modified of the health artifact or references.json
  const headFirst = async (cands) => {
    for (const u of cands) {
      try {
        const h = await head(u);
        const lm = h.get("last-modified");
        if (lm) return new Date(lm);
      } catch {}
    }
    return null;
  };
  return (
    (await headFirst([
      "/assets/health/references.json",
      "/assets/health/references/index.json",
      "/assets/references.json"
    ])) || null
  );
}

/* ------------------------ Category grouping ------------------------ */
function inferCategory(item) {
  if (item.category) return item.category; // explicit wins

  const title = (item.title || item.name || "").toLowerCase();
  const source = (item.source || "").toLowerCase();
  const host = (() => {
    try { return new URL(item.url).hostname.toLowerCase(); } catch { return ""; }
  })();

  // very light heuristics; tweak as needed
  if (host.includes("nejm") || host.includes("jama") || host.includes("thelancet") || host.includes("nature"))
    return "Peer-reviewed Literature";
  if (host.includes("fda") || host.includes("cdc") || host.includes("who") || host.includes("whitehouse") || host.includes("supremecourt"))
    return "Government & Legal";
  if (host.includes("nbme") || host.includes("usmle") || title.includes("ethics"))
    return "Medical Education & Ethics";
  if (host.includes("researchgate") || source.includes("preprint"))
    return "Preprints & Working Papers";
  return "General References";
}

function groupByCategory(items) {
  const map = new Map();
  for (const it of items) {
    const c = inferCategory(it);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  // sort categories alphabetically, and within each, keep existing order
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* ---------------------------- Render ------------------------------- */
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
  const { status, mount } = findStatusAndMount();
  if (!mount) return; // nothing to do if page structure changes

  // Last checked
  try {
    const d = await resolveLastChecked();
    const node = lastCheckedNode();
    if (node) node.textContent = d ? d.toLocaleString() : "—";
  } catch {
    const node = lastCheckedNode();
    if (node) node.textContent = "—";
  }

  // Load references
  try {
    const items = await firstJSON([
      "/assets/references.json",
      "/assets/data/references.json",
      "/assets/references/index.json"
    ]);

    if (status && status.parentElement) status.remove();

    if (!Array.isArray(items) || items.length === 0) {
      mount.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    // Group by category → render each as a heading + UL (inherits your styles)
    const groups = groupByCategory(items);
    for (const [cat, arr] of groups) {
      mount.appendChild(el("h2", {}, cat));

      const ul = el("ul", { role: "list" });
      for (const r of arr) {
        const title = r.title || r.name || r.url || "Untitled";
        const url = r.url || "#";
        const metaBits = [];
        if (r.source) metaBits.push(r.source);
        if (r.date) metaBits.push(r.date);
        const meta = metaBits.join(" · ");

        const li = el("li", {}, [
          el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
          meta ? el("div", { class: "muted" }, meta) : null,
          r.description ? el("p", {}, r.description) : null
        ]);
        ul.appendChild(li);
      }
      mount.appendChild(ul);
    }
  } catch (err) {
    if (status) status.textContent = "Failed to load references. Please try again later.";
    console.error("[references] fetch error:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}

