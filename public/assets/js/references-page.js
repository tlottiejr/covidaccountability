// public/assets/js/references-page.js — v9.0 (no inner scroll, footer reachable, descriptions + author styling)

const $ = (s, r = document) => r.querySelector(s);

/* -------------------- page mount -------------------- */
function findMount() {
  // Grid container is #ref-board
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
const el = (tag, attrs = {}, ...children) => {
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
};

/* -------------------- light enrichment for missing descriptions -------------------- */
/* This does not mutate your JSON file; it only fills in when the JSON lacks "description". */
const ENRICH_BY_TITLE_SUBSTR = [
  [
    "First Aid for the USMLE Step 1",
    "Board-review overview of epidemiology and biostatistics concepts used in evidence appraisal."
  ],
  [
    "Relative risk reduction: misinformative measure",
    "Methodology commentary highlighting limitations of relative risk when communicating clinical trial results."
  ],
  [
    "Communicating Risks & Benefits",
    "Practical guide on presenting quantitative risk information to patients, including NNT/NNH."
  ],
  [
    "NFIB v. OSHA",
    "SCOTUS opinion addressing OSHA’s COVID-19 vaccination/testing ETS."
  ],
  [
    "Safety and Efficacy of the BNT162b2",
    "Pivotal randomized trial reporting early efficacy and safety outcomes for BNT162b2 (Pfizer-BioNTech)."
  ],
  [
    "USMLE® Content Outline — Biostatistics",
    "Official outline describing tested competencies in statistics, population health, and interpreting medical literature."
  ],
  [
    "USMLE® Content Outline — Social Sciences",
    "Defines examined social science domains for medical practice, professionalism, and ethics."
  ],
  [
    "COVID-19 vaccine-associated mortality in the Southern Hemisphere",
    "Working paper exploring associations between vaccination and mortality during the Southern Hemisphere data period."
  ],
  [
    "Worldwide Bayesian Causal Impact Analysis",
    "Large-scale causal impact analysis exploring relationships across 145 countries."
  ]
];

function enrichDescription(title, currentDesc) {
  if (currentDesc && String(currentDesc).trim()) return currentDesc;
  const t = (title || "").toLowerCase();
  for (const [needle, desc] of ENRICH_BY_TITLE_SUBSTR) {
    if (t.includes(needle.toLowerCase())) return desc;
  }
  return currentDesc || ""; // leave blank if we have nothing reasonable
}

/* -------------------- normalization + bucketing -------------------- */
function normalize(row) {
  if (!row || typeof row !== "object") return null;
  const title = row.title || row.name || "";
  return {
    title,
    url: row.url || row.href || "",
    source: row.source || row.publisher || row.org || "",
    year: row.year || (row.date ? String(row.date).slice(0, 4) : ""),
    date: row.date || "",
    description: enrichDescription(title, row.description || row.note || ""),
    category: row.category || row.cat || "",
  };
}

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
  const metaParts = [];
  if (it.source) metaParts.push(it.source);
  if (it.year || it.date) metaParts.push(it.year || it.date);

  return el("li", { class: "ref-panel__item" },
    el("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title || it.url),
    metaParts.length ? el("div", { class: "ref-meta small" }, metaParts.join(" · ")) : null,
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

/* -------------------- main -------------------- */
(async function main() {
  try {
    const mount = findMount();
    if (!mount) return;

    const rows = await getJSON("/assets/references.json");
    const buckets = bucketize(rows);
    renderPanels(mount, PANEL_ORDER, buckets);

    // Reveal after render (prevents any flash)
    mount.classList.add("is-ready");

    // IMPORTANT: Do not lock body scroll; page must be scrollable to footer.
    // (We intentionally removed any previous overflow-hidden and fixed-height logic.)
  } catch (e) {
    console.warn(e);
  }
})();

