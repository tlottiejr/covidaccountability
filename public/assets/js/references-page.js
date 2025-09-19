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
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return await res.json();
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const px = (n) => `${Math.round(n)}px`;

/* ---------------- data -> dom helpers ---------------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null) return;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  children.forEach(c => {
    if (c == null) return;
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

function byTitle(a, b) {
  const A = (a.title || "").toLowerCase();
  const B = (b.title || "").toLowerCase();
  return A.localeCompare(B);
}

function pill(text) {
  return el("span", { class: "pill" }, text);
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

/* ------------- render layout (4 panels) --------------- */
function renderPanels(mount, buckets) {
  const wrap = el("div", { class: "ref-board" },
    panel("General", buckets.general),
    panel("Government / Legal", buckets.gov),
    panel("Education / Ethics", buckets.edu),
    panel("Peer-reviewed & Preprints", [...buckets.peer, ...buckets.preprint]),
  );
  mount.innerHTML = "";
  mount.appendChild(wrap);
  return wrap;

  function panel(title, items) {
    return el("section", { class: "ref-panel" },
      el("div", { class: "ref-panel__title" }, title),
      el("div", { class: "ref-panel__scroll" },
        el("ul", { class: "ref-list" }, ...items.map(itemRow))
      )
    );
  }
}

/* ------------- sizing (desktop fixed height) ---------- */
function sizeBoard(board) {
  if (!board) return;
  const header = $("header.top");
  const footer = $(".page-legal") || $("footer");
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  const gap = 12;
  const available = clamp(window.innerHeight - headerH - footerH - 24, 580, 1100);
  const rowH = Math.floor((available - (gap * 2)) / 3);
  const boardH = (rowH * 3) + (gap * 2);

  document.body.style.overflow = window.innerWidth >= 980 ? "hidden" : "";
  board.style.height = px(boardH);

  board.querySelectorAll(".ref-panel").forEach(panel => {
    panel.style.height = px(rowH);
    const title = panel.querySelector(".ref-panel__title");
    const scroll = panel.querySelector(".ref-panel__scroll");
    const cs = getComputedStyle(panel);
    const chrome = (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) +
                   (title ? title.getBoundingClientRect().height : 0) + 6;
    scroll.style.maxHeight = px(Math.max(120, rowH - chrome));
  });
}

/* ----------------------- main ------------------------- */
(async function main() {
  const { status, mount } = findStatusAndMount();
  if (!mount) return;

  try {
    const rows = await getJSON("/assets/references.json");
    const buckets = {
      general:   [],
      gov:       [],
      edu:       [],
      peer:      [],
      preprint:  []
    };

    const infer = (it) => {
      const t = (it.title || "").toLowerCase();
      const host = (() => { try { return new URL(it.url).host.toLowerCase(); } catch { return ""; } })();

      if (/whitehouse|supremecourt|hhs\.gov|cdc\.gov|fda\.gov|gov/.test(host)) return "gov";
      if (/fact sheet|supreme court|complaint|prep act|attorney general|final report/.test(t)) return "gov";

      if (/usmle|ethics manual|ama code|aafp|shared decision/.test(t)) return "edu";
      if (/acpjournals|ama-assn|aafp|usmle/.test(host)) return "edu";

      if (/nejm|lancet|jama|g med sci|dialogues in health|vaccine/.test(t)) return "peer";
      if (/nejm\.org|thelancet\.com|jamanetwork|sciencedirect|doi\.org|thegms/.test(host)) return "peer";

      if (/researchgate|correlation-canada/.test(host)) return "preprint";

      return "general";
    };

    rows.forEach(r => (buckets[infer(r)] || buckets.general).push(r));
    Object.keys(buckets).forEach(k => buckets[k].sort(byTitle));

    if (status) status.remove();
    const board = renderPanels(mount, buckets);
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

