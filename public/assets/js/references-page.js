// public/assets/js/references-page.js — v11.0
// - Page scroll stays enabled (like other pages).
// - Inner scrollers on ALL viewports, sized so they never clip or overlap.
// - No custom footer math; we rely on .container spacing for consistency.

const $ = (s, r = document) => r.querySelector(s);

/* -------------------- mount -------------------- */
function findMount() {
  return document.querySelector("#ref-board")
      || document.querySelector(".ref-board")
      || document.querySelector("#references-card")
      || document.querySelector("#main");
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

/* -------------------- categorization & fallbacks (same behavior you have) -------------------- */
const CATEGORY_BY_HOST = [
  [/usmle|nbme|fsmb/, "edu"],
  [/ama-assn|acponline/, "general"],
  [/whitehouse|fda\.gov|hhs|ahrq|cdc\.gov|supremecourt|federalregister|attorneygeneral|ag\./, "gov"],
  [/nejm|jama|thelancet|bmj|nature|science|dialoguesinhealth/, "peer"],
  [/medrxiv|researchgate|preprint/i, "preprint"],
];
const CATEGORY_BY_TITLE = [
  [/content outline|usmle|ethics.*first aid|biostatistics|epidemiology/i, "edu"],
  [/supreme court|opinion|complaint|attorney general|white house|federal register|fact sheet|prep act/i, "gov"],
  [/randomized|trial|efficacy|meta-analysis|journal|vaccine|dialogues in health/i, "peer"],
  [/preprint|working paper|researchgate/i, "preprint"],
  [/ethics manual|ama code|acp|decision making/i, "general"]
];
function fallbackDesc(title, url){
  let host = ""; try { host = new URL(url).host.toLowerCase(); } catch {}
  if (host.includes("ama-assn")) return "AMA ethical guidance or policy resource.";
  if (host.includes("usmle"))  return "Official USMLE outline or reference content.";
  if (/nejm|jama|thelancet|bmj/.test(host)) return "Peer-reviewed journal article.";
  if (/whitehouse|fda\.gov|hhs|ahrq|supremecourt|federalregister|ag\./.test(host)) return "Government or legal document.";
  if (host.includes("researchgate")) return "Research preprint or working paper.";
  return "Reference material related to COVID accountability.";
}
function normalize(row) {
  if (!row || typeof row !== "object") return null;
  const title = row.title || row.name || "";
  const url   = row.url || row.href || "";
  return {
    title,
    url,
    source: row.source || row.publisher || row.org || "",
    year:   row.year || (row.date ? String(row.date).slice(0, 4) : ""),
    date:   row.date || "",
    description: (row.description && String(row.description).trim()) || fallbackDesc(title, url),
    category: row.category || row.cat || "",
  };
}
function assignCategory(it) {
  const c = (it.category || "").toLowerCase();
  if (c) return (c.includes("gov")||c.includes("legal"))?"gov":
             (c.includes("edu")||c.includes("ethic"))?"edu":
             (c.includes("peer"))?"peer":
             (c.includes("preprint")||c.includes("working"))?"preprint":"general";
  const host = (()=>{ try { return new URL(it.url).host.toLowerCase(); } catch { return ""; } })();
  for (const [re, cat] of CATEGORY_BY_HOST) if (re.test(host)) return cat;
  const t = (it.title||"");
  for (const [re, cat] of CATEGORY_BY_TITLE) if (re.test(t)) return cat;
  return "general";
}
const PANEL_CONFIG = {
  general:   { title: "General References",             cls: "panel--general"  },
  gov:       { title: "Government & Legal",             cls: "panel--gov"      },
  edu:       { title: "Medical Education & Ethics",     cls: "panel--edu"      },
  peer:      { title: "Peer-reviewed Literature",       cls: "panel--peer"     },
  preprint:  { title: "Preprints & Working Papers",     cls: "panel--preprint" },
};
const PANEL_ORDER = ["general", "gov", "edu", "peer", "preprint"];
function bucketize(rows) {
  const buckets = { general: [], gov: [], edu: [], peer: [], preprint: [] };
  rows.forEach(r => {
    const it = normalize(r);
    if (!it || !it.url) return;
    buckets[assignCategory(it)].push(it);
  });
  for (const k of Object.keys(buckets)) buckets[k].sort((a,b) => (a.title||'').localeCompare(b.title||''));
  return buckets;
}

/* -------------------- rendering -------------------- */
function itemRow(it) {
  const meta = [];
  if (it.source) meta.push(it.source);
  if (it.year || it.date) meta.push(it.year || it.date);
  return el("li", { class: "ref-panel__item" },
    el("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title || it.url),
    meta.length ? el("div", { class: "ref-meta small" }, meta.join(" · ")) : null,
    it.description ? el("p", { class: "ref-panel__desc" }, it.description) : null,
  );
}
function renderPanels(mount, order, buckets) {
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

/* -------------------- sizing (same behavior across viewports) -------------------- */
/**
 * We size a target panel height so inner lists get a solid maxHeight:
 * - On >=1200px: compute from viewport so 3 rows fit comfortably.
 * - On 768–1199px: derive a similar target (still inner-scrolling).
 * - On <768px: use a stable height so each card scrolls, and the page can also scroll.
 * Page scroll remains enabled at all widths.
 */
function sizePanels(board) {
  if (!board) return;

  const vw = window.innerWidth;

  // Measure available height from board top to viewport bottom minus a small breathing room
  const boardTop = board.getBoundingClientRect().top;
  const viewportH = window.innerHeight;
  const breath = 24; // leave some air before the footer region

  // Decide rows-per-view and target panel height
  let targetH;
  if (vw >= 1200) {
    // 3 equal rows
    const avail = clamp(viewportH - boardTop - breath, 700, 1800);
    const rowGap = 20;
    targetH = Math.floor((avail - rowGap * 2) / 3);
    targetH = clamp(targetH, 280, 440);
  } else if (vw >= 768) {
    // 3-ish rows feel right on most laptops; keep inner scroll consistent
    const avail = clamp(viewportH - boardTop - breath, 640, 1600);
    const rowGap = 16;
    targetH = Math.floor((avail - rowGap * 2) / 3);
    targetH = clamp(targetH, 260, 400);
  } else {
    // Phones: keep a comfortable, scrollable card height
    targetH = 320; // consistent behavior; page can still scroll
  }

  board.querySelectorAll(":scope > .ref-panel").forEach(panel => {
    panel.style.height = px(targetH);

    const cs = window.getComputedStyle(panel);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const title = panel.querySelector("h3");
    const titleH = title ? title.getBoundingClientRect().height : 0;

    const scroll = panel.querySelector(".ref-panel__scroll");
    const extra = 10; // UL margin etc.
    const maxH = targetH - padY - titleH - extra;

    const MIN_SCROLL = 220;
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
    renderPanels(mount, PANEL_ORDER, buckets);

    // We keep page scroll normal; only inner lists scroll.
    const onResize = () => sizePanels(mount);
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});

    mount.classList.add("is-ready");
  } catch (e) {
    console.warn(e);
  }
})();
