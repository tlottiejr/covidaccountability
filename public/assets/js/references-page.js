// public/assets/js/references-page.js
// Renders inside the existing "Loading..." card. Keeps layout/styles intact.
// Hides the "Last checked" line and shows references in two columns per category.

const $ = (s, r = document) => r.querySelector(s);

/* ---------- locate nodes already on the page ---------- */
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

function hideLastChecked() {
  const node =
    $("[data-ref-lastchecked]") ||
    $("#last-checked") ||
    document.querySelector('time[datetime][data-role="last-checked"]');
  if (node) {
    const parent = node.closest("p, div, span") || node;
    parent.style.display = "none";
  }
}

/* ------------------------ data helpers ------------------------ */
async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}
async function firstJSON(candidates) {
  let lastErr;
  for (const u of candidates) {
    try { return await getJSON(u); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all candidates failed");
}

/* -------------------- category grouping ---------------------- */
function inferCategory(item) {
  if (item.category) return item.category;

  const title = (item.title || item.name || "").toLowerCase();
  const source = (item.source || "").toLowerCase();
  const host = (() => { try { return new URL(item.url).hostname.toLowerCase(); } catch { return ""; } })();

  if (host.includes("nejm") || host.includes("jama") || host.includes("thelancet") || host.includes("nature"))
    return "Peer-reviewed Literature";
  if (host.includes("fda") || host.includes("cdc") || host.includes("who") || host.includes("whitehouse") || host.includes("supremecourt"))
    return "Government & Legal";
  if (host.includes("nbme") || host.includes("usmle") || title.includes("ethics") || source.includes("ethics"))
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
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* --------------------------- render --------------------------- */
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

function splitIntoColumns(arr, cols = 2) {
  const buckets = Array.from({ length: cols }, () => []);
  arr.forEach((item, i) => buckets[i % cols].push(item));
  return buckets;
}

async function render() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return;

  // Hide the "Last checked" line entirely
  hideLastChecked();

  try {
    const items = await firstJSON([
      "/assets/references.json",
      "/assets/data/references.json",
      "/assets/references/index.json"
    ]);

    // Remove just the status line; keep the card container and its padding/shadow
    if (status && status.parentElement) status.remove();

    if (!Array.isArray(items) || items.length === 0) {
      mount.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    const groups = groupByCategory(items);

    for (const [cat, arr] of groups) {
      // Category header (inherits your h2 styles)
      mount.appendChild(el("h2", { class: "ref-cat" }, cat));

      // Two-column layout using CSS grid; each column is a <ul>
      const grid = el("div", { class: "ref-grid" });

      splitIntoColumns(arr, 2).forEach((bucket) => {
        const ul = el("ul", { class: "ref-col", role: "list" });
        bucket.forEach((r) => {
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
        });
        grid.appendChild(ul);
      });

      mount.appendChild(grid);
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
