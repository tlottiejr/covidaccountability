// public/assets/js/references-page.js — v7.8
// Key fix: render panels as DIRECT children of #ref-board (grid container).
// Result: exact 2×2 + bottom-left grid placement matches the target screenshot.

const $ = (s, r = document) => r.querySelector(s);

/* -------------------- mount discovery -------------------- */
function findMount() {
  // Page uses #ref-board as the grid container
  const mount = $("#ref-board") || $(".ref-board") || $("#references-card") || $("#main");
  return mount;
}

/* -------------------- helpers -------------------- */
async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return await res.json();
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const px = (n) => `${Math.round(n)}px`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function byTitle(a, b) {
  const A = (a.title || "").toLowerCase();
  const B = (b.title || "").toLowerCase();
  return A < B ? -1 : A > B ? 1 : 0;
}

function normalize(row) {
  if (!row || typeof row !== "object") return null;
  return {
    title: row.title || row.name || "",
    url: row.url || row.href || "",
    source: row.source || row.publisher || row.org || "",
    year: row.year || (row.date ? String(row.date).slice(0, 4) : ""),
    date: row.date || "",
    description: row.description || row.note || "",
    category: row.category || row.cat || "",
  };
}

/* -------------------- rendering -------------------- */
function itemRow(it) {
  const meta = [];
  if (it.source) meta.push(it.source);
  if (it.year || it.date) meta.push(it.year || it.date);

  return el("li", { class: "ref-panel__item" },
    el("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title || it.url),
    meta.length ? el("div", { class: "small" }, meta.join(" · ")) : null,
    it.description ? el("p", { class: "ref-panel__desc" }, it.description) : null,
  );
}

const PANEL_CONFIG = {
  general:   { title: "General References",             cls: "panel--general"  },
  gov:       { title: "Government & Legal",             cls: "panel--gov"      },
  edu:       { title: "Medical Education & Ethics",     cls: "panel--edu"      },
  peer:      { title: "Peer-reviewed Literature",       cls: "panel--peer"     },
  preprint:  { title: "Preprints & Working Papers",     cls: "panel--preprint" },
};
const PANEL_ORDER = ["general", "gov", "edu", "peer", "preprint"];

function assignCategory(it) {
  const c = (it.category || "").toLowerCase();
  if (c.includes("general")) return "general";
  if (c.includes("gov") || c.includes("legal")) return "gov";
  if (c.includes("edu") || c.includes("ethic")) return "edu";
  if (c.includes("peer")) return "peer";
  if (c.includes("preprint") || c.includes("working")) return "preprint";

  const t = (it.title || "").toLowerCase();
  const host = (() => { try { return new URL(it.url).host.toLowerCase(); } catch { return ""; } })();
  if (/\.gov\b|whitehouse|supremecourt|federalregister|house\.gov/.test(host) ||
      /supreme court|federal register|congressional|fact sheet|attorney general/.test(t)) return "gov";
  if (/nejm|jama|lancet|bmj|nature|science|medrxiv|researchgate/.test(host) ||
      /randomized|efficacy|trial|meta-analysis|review/.test(t)) return "peer";
  return "general";
}

function bucketize(rows) {
  const buckets = { general: [], gov: [], edu: [], peer: [], preprint: [] };
  rows.forEach(r => {
    const it = normalize(r);
    if (!it || !it.url) return;
    const cat = assignCategory(it);
    buckets[cat].push(it);
  });
  for (const k of Object.keys(buckets)) buckets[k].sort(byTitle);
  return buckets;
}

/**
 * IMPORTANT: Panels are appended directly to the mount (#ref-board)
 * so they are DIRECT grid items, allowing grid placement via CSS classes.
 */
function renderPanels(mount, order, buckets) {
  // Ensure the mount has the ref-board class
  mount.classList.add("ref-board");
  mount.innerHTML = "";

  order.forEach(key => {
    const conf = PANEL_CONFIG[key];
    const items = (buckets[key] || []).slice();
    mount.appendChild(
      el("section", { class: `ref-panel ${conf.cls}` },
        el("h3", {}, conf.title),
        el("div", { class: "ref-panel__scroll" },
          el("ul", { class: "ref-panel__list" }, ...items.map(itemRow))
        )
      )
    );
  });
  return mount;
}

/* -------------------- desktop sizing -------------------- */
function sizeBoard(board) {
  if (!board) return;
  const isDesktop = window.innerWidth >= 980;

  if (!isDesktop) {
    document.body.style.overflow = "";
    board.style.height = "";
    board.querySelectorAll(":scope > .ref-panel").forEach(p => p.style.height = "");
    board.querySelectorAll(".ref-panel__scroll").forEach(s => s.style.maxHeight = "");
    return;
  }

  // Desktop: internal panel scroll; page itself doesn't scroll
  document.body.style.overflow = "hidden";

  const boardTop = board.getBoundingClientRect().top;
  const viewportBottom = window.innerHeight;
  const margin = 12;

  const avail = clamp(viewportBottom - boardTop - margin, 760, 1700);

  const rows = 3;
  const rowGap = 20; // matches grid gap in CSS
  const rowH = Math.floor((avail - rowGap * (rows - 1)) / rows);

  board.style.height = px(avail);

  board.querySelectorAll(":scope > .ref-panel").forEach(panel => {
    panel.style.height = px(rowH);

    const cs = window.getComputedStyle(panel);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const title = panel.querySelector("h3");
    const titleH = title ? title.getBoundingClientRect().height : 0;

    const scroll = panel.querySelector(".ref-panel__scroll");
    const extra = 10;
    const maxH = rowH - padY - titleH - extra;

    const MIN_SCROLL = 210;
    scroll.style.maxHeight = px(Math.max(MIN_SCROLL, maxH));
  });
}

/* -------------------- main -------------------- */
(async function main() {
  try {
    const mount = findMount();
    if (!mount) return;

    const rows = await getJSON("/assets/references.json");
    const buckets = bucketize(rows);
    const board = renderPanels(mount, PANEL_ORDER, buckets);

    sizeBoard(board);

    // Reveal after render (prevents any flash)
    mount.classList.add("is-ready");

    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => sizeBoard(board)); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});
  } catch (e) {
    console.warn(e);
  }
})();
