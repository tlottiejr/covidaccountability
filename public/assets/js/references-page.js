// public/assets/js/references-page.js — v10.0
// Desktop: page does NOT scroll; cards scroll internally; footer remains visible.
// Panels are direct children of #ref-board (grid container). Authors styled, descriptions shown.

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

/* -------------------- descriptions: fill if missing -------------------- */
const DESC_BY_TITLE = new Map([
  ["American College of Physicians Ethics Manual: Seventh Edition",
   "Comprehensive ethical guidance from the ACP covering professionalism, clinical decision-making, research, and public health topics."],
  ["AMA Code of Medical Ethics — Opinion 2.1.1 Informed Consent",
   "AMA guidance on obtaining and documenting informed consent, emphasizing patient comprehension and shared decision making."],
  ["AMA Code of Medical Ethics — Opinion 8.3 Physicians’ Responsibilities in Disaster Response & Preparedness",
   "AMA guidance outlining physicians’ professional duties during disasters and public health emergencies."],
  ["AHRQ: Communicating Numbers to Your Patients (SHARE Approach Tool 5)",
   "Practical tool for discussing absolute and relative risk with patients using plain numbers and visuals."],
  ["ABMS Statement Supporting Role of Medical Professionals in Preventing COVID-19 Misinformation",
   "Statement encouraging clinicians and boards to address health misinformation while upholding professional standards."],
  ["Beattie K. Worldwide Bayesian Causal Impact Analysis of Vaccine Administration (145 Countries)",
   "Large-scale causal analysis exploring associations between vaccination campaigns and outcomes across 145 countries."],
  ["Brown RB. Relative risk reduction: Misinformative measure in clinical trials and COVID-19 vaccine efficacy",
   "Methodological commentary explaining limits of relative risk reduction when communicating vaccine trial results."],
  ["Clinical Decision Making & Interpreting the Medical Literature (MKSAP 19)",
   "Board review material on critical appraisal, diagnostic reasoning, and interpretation of statistical measures."],
  ["Fact Sheet: Actions After Public Health Emergency Transition",
   "White House fact sheet summarizing policy changes as the COVID-19 public health emergency period ends."],
  ["Fagerlin A, et al. Absolute risk, relative risk, and NNT (Communicating Risks & Benefits)",
   "Educational material comparing absolute risk, relative risk, and number needed to treat to support clearer risk communication."],
  ["Final Report on Lessons Learned and the Path Forward",
   "Select Subcommittee report summarizing findings and recommendations related to the pandemic response."],
  ["Fraiman J, et al. Serious adverse events of special interest following mRNA COVID-19 vaccination",
   "Study examining rates of pre-specified adverse events of special interest following mRNA COVID-19 vaccination."],
  ["HHS OSG: Impact of Health Misinformation RFI",
   "Request for information seeking public input on the impacts of health misinformation and approaches to address it."],
  ["Kansas v. Pfizer Inc. (Complaint)",
   "State legal complaint outlining allegations related to representations about COVID-19 vaccines."],
  ["NFIB v. OSHA — Supreme Court Opinion",
   "U.S. Supreme Court opinion addressing OSHA’s emergency temporary standard on vaccination/testing."],
  ["Perlis RH, et al. Trust in Physicians and Hospitals During the COVID-19 Pandemic",
   "Survey study describing trends in public trust in clinicians and hospitals during the pandemic."],
  ["Polack FP, et al. Safety and Efficacy of the BNT162b2 mRNA Covid-19 Vaccine",
   "Pivotal randomized trial reporting early efficacy and safety outcomes of BNT162b2 (Pfizer-BioNTech)."],
  ["PREP Act — Questions & Answers",
   "HHS guidance providing Q&A about liability protections and scope under the PREP Act."],
  ["Public Health Sciences: Epidemiology & Biostatistics (First Aid Step 1)",
   "Board-style summaries of epidemiology and biostatistics concepts used in evidence appraisal."],
  ["Public Health Sciences: Ethics (First Aid Step 1)",
   "Brief review of medical ethics principles and applications for exams and clinical scenarios."],
  ["Rancourt D, et al. COVID-19 vaccine-associated mortality in the Southern Hemisphere",
   "Working paper exploring associations between vaccination and mortality during the Southern Hemisphere period."],
  ["Rancourt D, et al. Spatiotemporal variation of excess all-cause mortality in the world during the COVID period",
   "Analysis describing patterns of excess mortality across regions during the COVID-19 period."],
  ["Shared Decision-Making: NICE Guidelines (summary)",
   "Summary of NICE guidance on shared decision making, including communication principles and practical steps."],
  ["State of Texas v. Pfizer Inc. (Complaint)",
   "State complaint alleging deceptive practices related to COVID-19 vaccines."],
  ["Stadel B, et al. Misleading Use of Risk Ratios",
   "Commentary highlighting pitfalls of using risk ratios and offering alternatives for clearer interpretation."],
  ["USMLE® Content Outline — Biostatistics, Epidemiology/Population Health & Interpretation of the Medical Literature (p. 37)",
   "Official outline describing tested competencies in biostatistics, population health, and interpretation of medical literature."],
  ["USMLE® Content Outline — Social Sciences (p. 39)",
   "Official outline of social sciences domains relevant to medical practice, professionalism, and ethics."],
  ["Vella D. Failure of Care Standard Involving Pfizer BNT162b2 modRNA",
   "Commentary/legal analysis discussing standards of care considerations regarding BNT162b2."],
  ["Vella D. Failure of Care Standard Involving Pfizer BNT162b2 modRNA (Podcast page)",
   "Podcast episode page discussing the “failure of care standard” in the context of BNT162b2."],
  ["White House: Actions After Public Health Emergency (Fact Sheet)",
   "White House fact sheet describing actions and programs following the end of the COVID-19 public health emergency."]
]);

function normalize(row) {
  if (!row || typeof row !== "object") return null;
  const title = row.title || row.name || "";
  return {
    title,
    url: row.url || row.href || "",
    source: row.source || row.publisher || row.org || "",
    year: row.year || (row.date ? String(row.date).slice(0, 4) : ""),
    date: row.date || "",
    description: (row.description && String(row.description).trim())
      ? row.description
      : (DESC_BY_TITLE.get(title) || ""),
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

/* -------------------- desktop sizing: cards scroll, page does not -------------------- */
function sizeForDesktop(board) {
  if (!board) return;

  // lock page scroll on desktop
  document.body.style.overflow = "hidden";

  const footer = document.querySelector("footer.container");
  const footerH = footer ? footer.getBoundingClientRect().height : 0;

  const boardTop = board.getBoundingClientRect().top;
  const viewportBottom = window.innerHeight;
  const margin = 12; // breathing room for card shadows above footer

  const avail = clamp(viewportBottom - boardTop - footerH - margin, 680, 1600);

  const rows = 3;
  const rowGap = 20;
  const rowH = Math.floor((avail - rowGap * (rows - 1)) / rows);

  board.style.height = px(avail);

  // Equalize panel heights and give each one an internal scroll area
  board.querySelectorAll(":scope > .ref-panel").forEach(panel => {
    panel.style.height = px(rowH);

    const cs = window.getComputedStyle(panel);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const title = panel.querySelector("h3");
    const titleH = title ? title.getBoundingClientRect().height : 0;

    const scroll = panel.querySelector(".ref-panel__scroll");
    const extra = 8; // UL margin, etc.
    const maxH = rowH - padY - titleH - extra;

    const MIN_SCROLL = 220; // tuned to show bullets + meta + first desc lines
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

    // Desktop sizing
    const onResize = () => {
      if (window.innerWidth >= 980) {
        sizeForDesktop(mount);
      } else {
        // mobile: undo constraints (page scrolls naturally)
        document.body.style.overflow = "";
        mount.style.height = "";
        mount.querySelectorAll(":scope > .ref-panel").forEach(p => p.style.height = "");
        mount.querySelectorAll(".ref-panel__scroll").forEach(s => s.style.maxHeight = "");
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize).catch(()=>{});

    // Reveal after render (prevents any flash)
    mount.classList.add("is-ready");
  } catch (e) {
    console.warn(e);
  }
})();

