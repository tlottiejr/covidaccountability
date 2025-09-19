// public/assets/js/references-page.js
// Renders four scrollable panels (one per category) inside the existing card.
// No changes to your HTML layout elsewhere.

const $ = (s, r = document) => r.querySelector(s);

/* ---------- find the existing "Loading..." card & mount ----------- */
function findStatusAndMount() {
  let status =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references-status") ||
    $(".status");

  if (!status) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (tw.nextNode()) {
      const txt = (tw.currentNode.textContent || "").trim().toLowerCase();
      if (txt === "loading..." || txt === "loading…") { status = tw.currentNode; break; }
    }
  }

  let mount = null;
  if (status) {
    if (status.nextElementSibling && status.nextElementSibling.children.length === 0) {
      mount = status.nextElementSibling; // empty sibling after status
    } else {
      mount = status.parentElement;      // render in the same card
    }
  }
  return { status, mount };
}

/* ---------------------- small util helpers ------------------------ */
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

/* ---------------------- hide "Last checked" ----------------------- */
function hideLastChecked() {
  const cand = [
    $("[data-ref-lastchecked]"),
    $("#last-checked"),
    document.querySelector('time[datetime][data-role="last-checked"]'),
  ].find(Boolean);
  if (cand) (cand.closest("p,div,span") || cand).style.display = "none";

  // fallback textual match
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const s = (tw.currentNode.nodeValue || "").trim().toLowerCase();
    if (s.startsWith("last checked")) {
      const eln = tw.currentNode.parentElement;
      if (eln) (eln.closest("p,div,span") || eln).style.display = "none";
      break;
    }
  }
}

/* ----------------- grouping (explicit or inferred) ---------------- */
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
  const wantedOrder = [
    "General References",
    "Government & Legal",
    "Medical Education & Ethics",
    "Peer-reviewed Literature",
    "Preprints & Working Papers",
  ];
  const map = new Map();
  for (const it of items) {
    const c = inferCategory(it);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  // sort categories by the preferred order first, then alpha
  return [...map.entries()].sort((a, b) => {
    const ia = wantedOrder.indexOf(a[0]); const ib = wantedOrder.indexOf(b[0]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a[0].localeCompare(b[0]);
  });
}

/* ------------------------------ render ---------------------------- */
function renderPanel(category, items) {
  const panel = el("section", { class: "ref-panel", "aria-label": category });
  panel.appendChild(el("h2", { class: "ref-panel__title" }, category));

  const scroll = el("div", { class: "ref-panel__scroll", tabindex: "0" });
  const ul = el("ul", { class: "ref-panel__list", role: "list" });

  items.forEach((r) => {
    const title = r.title || r.name || r.url || "Untitled";
    const url = r.url || "#";
    const meta = [r.source, r.date].filter(Boolean).join(" · ");

    const li = el("li", { class: "ref-panel__item" }, [
      el("a", { href: url, target: "_blank", rel: "noopener nofollow" }, title),
      meta ? el("div", { class: "muted" }, meta) : null,
      r.description ? el("p", { class: "ref-panel__desc" }, r.description) : null,
    ]);
    ul.appendChild(li);
  });

  scroll.appendChild(ul);
  panel.appendChild(scroll);
  return panel;
}

async function render() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return;

  hideLastChecked();

  try {
    const items = await firstJSON([
      "/assets/references.json",
      "/assets/data/references.json",
      "/assets/references/index.json",
    ]);

    if (status && status.parentElement) status.remove();
    if (!Array.isArray(items) || items.length === 0) {
      mount.appendChild(el("p", { class: "muted" }, "No references available."));
      return;
    }

    const groups = groupByCategory(items);

    // Grid holding up to 4 panels (2x2). If more categories exist, they wrap.
    const board = el("div", { class: "ref-board" });
    groups.forEach(([cat, arr]) => board.appendChild(renderPanel(cat, arr)));

    mount.appendChild(board);
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
