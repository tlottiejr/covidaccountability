// public/assets/js/references-page.js (v6 — 5 fixed panels, desktop lock)
// Matches OLDWORKING look/feel with the new baseline styles.
// - 5 panels in a 2-col grid (desktop), each panel scrolls internally.
// - Mobile uses normal page scroll.
// - Uses category on each item if present; otherwise falls back to heuristics.
// - Preserves your desired category order and titles exactly.

const $ = (s, r = document) => r.querySelector(s);

/* ---------- page anchors: find status + mount ----------- */
function findStatusAndMount() {
  let status =
    $("[data-ref-status]") ||
    $("#references-status") ||
    $(".references .status") ||
    $(".status");

  if (!status) {
    // Fallback: find a node that literally says "Loading..." (or …)
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (tw.nextNode()) {
      const txt = (tw.currentNode.textContent || "").trim().toLowerCase();
      if (txt === "loading..." || txt === "loading…") { status = tw.currentNode; break; }
    }
  }

  // Prefer the empty sibling after the status as the mount (your HTML has this),
  // otherwise render into the same container as a safe fallback.
  let mount = null;
  if (status) {
    if (status.nextElementSibling && status.nextElementSibling.children.length === 0) {
      mount = status.nextElementSibling;
    } else {
      mount = status.parentElement;
    }
  }
  return { status, mount };
}

/* ---------------------- helpers ------------------------ */
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
  return A.localeCompare(B);
}

/* -------------------- presentation --------------------- */
function itemRow(it) {
  const metaBits = [];
  if (it.source) metaBits.push(it.source);
  if (it.year || it.date) metaBits.push(it.year || it.date);

  return el("li", { class: "ref-item" },
    el("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title || it.url),
    metaBits.length ? el("div", { class: "ref-meta" }, metaBits.join(" · ")) : null,
    it.description ? el("p", { class: "ref-note" }, it.description) : null,
  );
}

function renderPanels(mount, orderedPanels, buckets) {
  const wrap = el("div", { class: "ref-board" });
  mount.innerHTML = "";
  mount.appendChild(wrap);

  orderedPanels.forEach(key => {
    const conf = PANEL_CONFIG[key];
    const items = (buckets[key] || []).slice(); // copy
    wrap.appendChild(el("section", { class: "ref-panel" },
      el("div", { class: "ref-panel__title" }, conf.title),
      el("div", { class: "ref-panel__scroll" },
        el("ul", { class: "ref-list" }, ...items.map(itemRow))
      )
    ));
  });

  return wrap;
}

/* ----------------- sizing (desktop lock) ---------------- */
// Desktop: lock body scroll; each panel scrolls internally.
// Mobile: normal page scroll.
function sizeBoard(board) {
  if (!board) return;

  const header = $("header.top");
  const footer = $(".page-legal") || $("footer");
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  const isDesktop = window.innerWidth >= 980;
  document.body.style.overflow = isDesktop ? "hidden" : "";

  if (!isDesktop) {
    // Let content flow naturally on small screens.
    board.style.height = "";
    board.querySelectorAll(".ref-panel").forEach(p => {
      const scroll = p.querySelector(".ref-panel__scroll");
      scroll.style.maxHeight = "";
    });
    return;
  }

  // Desktop: 2 cols grid; compute target heights so the whole board fits viewport
  const padding = 24; // top/btm padding inside main content wrapper
  const avail = clamp(window.innerHeight - headerH - footerH - padding, 580, 1400);

  // layout: 3 rows (to comfortably fit 5 cards like your screenshot)
  const rowGap = 16;
  const targetBoardH = avail;
  const rowH = Math.floor((targetBoardH - (rowGap * 2)) / 3);

  board.style.height = px(targetBoardH);

  board.querySelectorAll(".ref-panel").forEach(panel => {
    panel.style.height = px(rowH);

    const title = panel.querySelector(".ref-panel__title");
    const scroll = panel.querySelector(".ref-panel__scroll");
    const cs = getComputedStyle(panel);
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      (title ? title.getBoundingClientRect().height : 0) + 8;

    const maxH = Math.max(120, rowH - chrome);
    scroll.style.maxHeight = px(maxH);
  });
}

/* -------------- categorization & order ----------------- */
// Exact titles and order you asked for (5 cards).
const PANEL_CONFIG = {
  general:   { title: "General References" },
  gov:       { title: "Government & Legal" },
  edu:       { title: "Medical Education & Ethics" },
  peer:      { title: "Peer-reviewed Literature" },
  preprint:  { title: "Preprints & Working Papers" },
};
const PANEL_ORDER = ["general", "gov", "edu", "peer", "preprint"];

// Use item.category if present; otherwise infer by host/title.
function assignCategory(it) {
  const c = (it.category || "").toLowerCase();
  if (c.includes("general"))   return "general";
  if (c.includes("gov") || c.includes("legal")) return "gov";
  if (c.includes("edu") || c.includes("ethic")) return "edu";
  if (c.includes("peer"))      return "peer";
  if (c.includes("preprint") || c.includes("working")) return "preprint";

  // Heuristics fallback (kept conservative)
  const t = (it.title || "").toLowerCase();
  const host = (() => { try { return new URL(it.url).host.toLowerCase(); } catch { return ""; } })();

  if (/whitehouse|supremecourt|hhs\.gov|cdc\.gov|fda\.gov|congress|\.gov\b/.test(host) ||
      /supreme court|federal register|attorney general|congressional|fact sheet/.test(t)) return "gov";

  if (/usmle|code of medical ethics|ama |acp |first aid/.test(t) ||
      /ama-assn|acpjournals|mheducation|usmle|nbme|aafp|annals\.org/.test(host)) return "edu";

  if (/nejm|lancet|jama|dialogues in health|vaccine|trial|efficacy/.test(t) ||
      /nejm\.org|thelancet\.com|jamanetwork|sciencedirect|doi\.org|thegms/.test(host)) return "peer";

  if (/researchgate|working paper|preprint/.test(host + " " + t)) return "preprint";

  return "general";
}

/* -------------------------- main ----------------------- */
(async function main() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return;

  try {
    const rows = await getJSON("/assets/references.json");

    // Group into fixed buckets; always render 5 panels (even if some empty).
    const buckets = {
      general:  [],
      gov:      [],
      edu:      [],
      peer:     [],
      preprint: [],
    };

    rows.forEach(r => buckets[assignCategory(r)].push(r));
    Object.keys(buckets).forEach(k => buckets[k].sort(byTitle));

    if (status) status.remove();
    const board = renderPanels(mount, PANEL_ORDER, buckets);
    sizeBoard(board);

    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => sizeBoard(board)); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});
  } catch (e) {
    if (status) status.textContent = "Failed to load references.";
    console.warn(e);
  }
})();
