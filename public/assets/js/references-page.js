// public/assets/js/references-page.js (v5)
// - Renders 4 scrollable panels.
// - Strong viewport clamp so desktop never scrolls.
// - Mobile keeps normal page scrolling.

const $ = (s, r = document) => r.querySelector(s);

/* ---------- locate status/mount ----------- */
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

/* ---------------------- utils ------------------------ */
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

/* ---------------- hide "Last checked" safety ---------------- */
function hideLastChecked() {
  const cand = [
    $("[data-ref-lastchecked]"),
    $("#last-checked"),
    document.querySelector('time[datetime][data-role="last-checked"]'),
  ].find(Boolean);
  if (cand) (cand.closest("p,div,span") || cand).style.display = "none";

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

/* ---------------- grouping ---------------- */
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
  const order = [
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
  return [...map.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a[0].localeCompare(b[0]);
  });
}

/* ---------------- dynamic sizing + clamp ---------------- */
function baseTargetHeight(board) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const topOffset = board.getBoundingClientRect().top;

  // Height of legal links within gradient
  const legal = document.querySelector('.legal-links');
  const legalH = legal ? legal.getBoundingClientRect().height : 18;

  // Reserve room for gradient + legals + small buffer
  const RESERVE = 240 + Math.ceil(legalH * 1.2);

  let target = Math.floor(vh - topOffset - RESERVE);

  // Clamp per viewport
  const MIN = 170;   // floor
  const MAX = 330;   // ceiling
  target = Math.max(MIN, Math.min(MAX, target));

  if (vw > 1400) target = Math.min(MAX, target + 4);
  if (vw < 1100) target = Math.max(MIN, target - 8);

  return target;
}

function setPanelHeights(px) {
  document.querySelectorAll(".ref-panel__scroll").forEach(sc => {
    sc.style.maxHeight = `${px}px`;
  });
}

/* STRICT clamp: shrink until the page fits the viewport (desktop only) */
function clampToViewport() {
  if (window.matchMedia("(max-width: 979px)").matches) return; // allow mobile page scroll
  const root = document.scrollingElement;
  let tries = 0;

  while (root.scrollHeight > window.innerHeight && tries < 10) {
    tries++;
    const panels = [...document.querySelectorAll(".ref-panel__scroll")];
    if (!panels.length) break;

    const current = parseInt(getComputedStyle(panels[0]).maxHeight || "0", 10) || 280;
    const next = Math.max(140, current - 16); // stronger step and lower floor
    setPanelHeights(next);
  }
}

function sizePanels() {
  const board = document.querySelector(".ref-board");
  if (!board) return;
  const target = baseTargetHeight(board);
  setPanelHeights(target);
  requestAnimationFrame(clampToViewport);
}

function onResizeThrottled() {
  let raf = null;
  return () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; sizePanels(); });
  };
}

/* ---------------- render ---------------- */
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
    const board = el("div", { class: "ref-board" });
    groups.forEach(([cat, arr]) => board.appendChild(renderPanel(cat, arr)));
    mount.appendChild(board);

    sizePanels();
    window.addEventListener("resize", onResizeThrottled(), { passive: true });
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

