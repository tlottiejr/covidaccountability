// public/assets/js/references-page.js — v7.2 (height/spacing tuned to match target)

const $ = (s, r = document) => r.querySelector(s);

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
  return { status, mount };
}

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

function itemRow(it) {
  const meta = [];
  if (it.source) meta.push(it.source);
  if (it.year || it.date) meta.push(it.year || it.date);

  return el("li", { class: "ref-item" },
    el("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title || it.url),
    meta.length ? el("div", { class: "ref-meta" }, meta.join(" · ")) : null,
    it.description ? el("p", { class: "ref-note" }, it.description) : null,
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
  if (/usmle|ethic|code of medical|first aid|acp|ama|annals/.test(t) ||
      /ama-assn|acpjournals|mheducation|annals\.org|usmle|nbme/.test(host)) return "edu";
  if (/nejm|lancet|jama|dialogues in health|vaccine|trial|efficacy/.test(t) ||
      /nejm\.org|thelancet\.com|jamanetwork|sciencedirect|doi\.org|thegms/.test(host)) return "peer";
  if (/researchgate|preprint|working paper/.test(host + " " + t)) return "preprint";
  return "general";
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
        el("div", { class: "ref-panel__title" }, conf.title),
        el("div", { class: "ref-panel__scroll" },
          el("ul", { class: "ref-list" }, ...items.map(itemRow))
        )
      )
    );
  });
  return wrap;
}

/* Desktop sizing: keep whole page fixed height; panels scroll internally */
function sizeBoard(board) {
  if (!board) return;

  const header = document.querySelector("header.top") || document.querySelector("header");
  const footer = document.querySelector(".page-legal") || document.querySelector("footer");

  const headerH = header ? header.getBoundingClientRect().height : 0;
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  const isDesktop = window.innerWidth >= 980;
  document.body.style.overflow = isDesktop ? "hidden" : "";

  if (!isDesktop) {
    board.style.height = "";
    board.querySelectorAll(".ref-panel__scroll").forEach(s => s.style.maxHeight = "");
    return;
  }

  // Tuned to the target screenshot: 3 rows with generous card height
  const paddingAround = 32;
  const avail = clamp(window.innerHeight - headerH - footerH - paddingAround, 640, 1400);
  const rowGap = 20;
  const rows = 3;
  const rowH = Math.floor((avail - rowGap * (rows - 1)) / rows);

  board.style.height = px(avail);

  board.querySelectorAll(".ref-panel").forEach(panel => {
    panel.style.height = px(rowH);

    const title = panel.querySelector(".ref-panel__title");
    const scroll = panel.querySelector(".ref-panel__scroll");
    const cs = getComputedStyle(panel);
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      (title ? title.getBoundingClientRect().height : 0) + 10;

    scroll.style.maxHeight = px(Math.max(120, rowH - chrome));
  });
}

(async function main() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return;

  try {
    const rows = await getJSON("/assets/references.json");
    const buckets = { general: [], gov: [], edu: [], peer: [], preprint: [] };

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


