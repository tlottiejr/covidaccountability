// public/assets/js/references-page.js — v7.4 (layout sizing tuned to match target screenshot)

const $ = (s, r = document) => r.querySelector(s);

/* -------------------- mount discovery -------------------- */
function findStatusAndMount() {
  let status =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references .status") ||
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
      mount = status.nextElementSibling;
    } else {
      mount = status.parentElement;
    }
  }
  // Fallback for this page (no visible status element): render into #ref-board
  if (!mount) {
    mount = $("#ref-board") || $(".ref-board") || $("#references-card") || $("#main");
  }
  return { status, mount };
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
  general:   { title: "General References" },
  gov:       { title: "Government & Legal" },
  edu:       { title: "Medical Education & Ethics" },
  peer:      { title: "Peer-reviewed Literature" },
  preprint:  { title: "Preprints & Working Papers" },
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
  for (const k of Object.keys(buckets)) {
    buckets[k].sort(byTitle);
  }
  return buckets;
}

function renderPanels(mount, order, buckets) {
  const wrap = el("div", { class: "ref-board" });
  mount.innerHTML = "";
  mount.appendChild(wrap);

  order.forEach(key => {
    const conf = PANEL_CONFIG[key];
    const items = (buckets[key] || []).slice();
    wrap.appendChild(
      el("section", { class: "ref-panel" },
        el("h3", {}, conf.title),
        el("div", { class: "ref-panel__scroll" },
          el("ul", { class: "ref-panel__list" }, ...items.map(itemRow))
        )
      )
    );
  });
  return wrap;
}

/* -------------------- desktop sizing -------------------- */
/**
 * Make the board fill the viewport from the board's top to the footer,
 * split that space into 3 equal rows with a small gap, and give each
 * panel an internal scroll area. On mobile (<980px) we remove sizing.
 */
function sizeBoard(board) {
  if (!board) return;

  const isDesktop = window.innerWidth >= 980;

  // On mobile, let the page flow naturally.
  if (!isDesktop) {
    document.body.style.overflow = "";
    board.style.height = "";
    board.querySelectorAll(".ref-panel").forEach(p => p.style.height = "");
    board.querySelectorAll(".ref-panel__scroll").forEach(s => s.style.maxHeight = "");
    return;
  }

  // Desktop: lock page scroll and compute exact available height
  document.body.style.overflow = "hidden";

  const footer = document.querySelector("footer");
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  // Distance from the top of the board to the bottom of the viewport
  const boardTop = board.getBoundingClientRect().top;
  const viewportBottom = window.innerHeight;
  // Small breathing room so the card shadows show nicely
  const margin = 24;

  // Available pixels for the entire board
  const avail = clamp(viewportBottom - boardTop - footerH - margin, 700, 1600);

  // 3 equal rows with a grid-like feel
  const rows = 3;
  const rowGap = 20; // match CSS-ish spacing
  const rowH = Math.floor((avail - rowGap * (rows - 1)) / rows);

  board.style.height = px(avail);

  // Compute each panel's inner scroll height precisely from its padding + title height
  board.querySelectorAll(".ref-panel").forEach(panel => {
    panel.style.height = px(rowH);

    const cs = window.getComputedStyle(panel);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

    const title = panel.querySelector("h3");
    const titleH = title ? title.getBoundingClientRect().height : 0;

    const scroll = panel.querySelector(".ref-panel__scroll");
    // leave a little extra room for the UL top margin, etc.
    const extra = 10;
    const maxH = rowH - padY - titleH - extra;

    scroll.style.maxHeight = px(Math.max(160, maxH));
  });
}

/* -------------------- main -------------------- */
(async function main() {
  try {
    const { status, mount } = findStatusAndMount();
    if (!mount) return;

    const rows = await getJSON("/assets/references.json");
    const buckets = bucketize(rows);
    const board = renderPanels(mount, PANEL_ORDER, buckets);

    sizeBoard(board);

    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => sizeBoard(board)); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});
  } catch (e) {
    // Non-blocking error surface; page remains usable
    console.warn(e);
  }
})();

