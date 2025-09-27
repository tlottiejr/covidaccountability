/* public/assets/js/vaers-tables.js
 *
 * VAERS breakdown tables (Manufacturer / Sex / Age).
 * - Uses the page's data-summary attribute FIRST, then window.VAERS_SUMMARY_URL,
 *   then falls back to /data/vaers-summary.json.
 * - Renders THREE separate tables so the existing site CSS (blue gradient panels)
 *   applies exactly as before.
 * - Defensive/no-op if the container is missing.
 */

(function () {
  // Where tables will be injected
  const root = document.getElementById("vaers-breakdowns");
  if (!root) return; // Nothing to do on pages without the container

  // ------- Resolve data URL deterministically (attribute → global → default)
  const SECTION =
    document.getElementById("vaers-charts-section") ||
    document.querySelector("[data-summary]");

  const section = document.getElementById("vaers-charts-section");
  const url =
    (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
    (section && section.getAttribute("data-summary")) ||
    "/data/vaers-summary-openvaers.json";

  // ------- Small DOM helpers
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

  const th = (text) => {
    const e = el("th");
    e.textContent = text;
    return e;
  };

  const td = (text, opts = {}) => {
    const e = el("td");
    e.textContent = text == null ? "" : text;
    if (opts.className) e.className = opts.className;
    if (opts.align) e.style.textAlign = opts.align;
    return e;
  };

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US")
      : ("" + (n ?? "")).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const normalize = (items) =>
    Array.isArray(items)
      ? items.map((x) => ({
          category: String(x?.category ?? ""),
          count: Number(x?.count ?? 0),
        }))
      : [];

  // ------- Build THREE tables (so existing CSS styles them as 3 panels)
  function buildThreeTables() {
    root.innerHTML = "";

    const makeTable = (leftHeader, rightHeader) => {
      const table = el("table", { className: "vaers-table" });
      const thead = el("thead");
      const trh = el("tr");
      trh.append(th(leftHeader), th(rightHeader));
      thead.appendChild(trh);
      const tbody = el("tbody");
      table.append(thead, tbody);
      return { table, tbody };
    };

    const t1 = makeTable("Manufacturer", "Cases");
    const t2 = makeTable("Sex", "Cases");
    const t3 = makeTable("Age", "Cases");

    // Append in order; your CSS uses :nth-of-type(1..3)
    root.append(t1.table, t2.table, t3.table);

    return { t1, t2, t3 };
  }

  // ------- Stable ordering to match the reference look
  function orderByList(arr, wantedOrder) {
    if (!Array.isArray(arr) || !Array.isArray(wantedOrder)) return arr || [];
    const idx = new Map(wantedOrder.map((k, i) => [k, i]));
    return [...arr].sort((a, b) => {
      const ia = idx.has(a.category) ? idx.get(a.category) : 1e9;
      const ib = idx.has(b.category) ? idx.get(b.category) : 1e9;
      return ia - ib || b.count - a.count || a.category.localeCompare(b.category);
    });
  }

  // ------- Render function
  function render(summary) {
    if (!summary || !summary.covid_deaths_breakdowns) return;

    const { manufacturer, sex, age_bins } = summary.covid_deaths_breakdowns;

    const m = normalize(manufacturer);
    const s = normalize(sex);
    const a = normalize(age_bins);

    // Match the intended ordering
    const mOrdered = orderByList(m, [
      "UNKNOWN MANUFACTURER",
      "NOVAVAX",
      "JANSSEN",
      "MODERNA",
      "PFIZER\\BIONTECH",
    ]);

    const sOrdered = orderByList(s, ["Male", "Female", "Unknown"]);

    const aOrdered = orderByList(a, [
      "0.5–5",
      "5–12",
      "12–25",
      "25–51",
      "51–66",
      "66–81",
      "81–121",
      "Unknown",
      "All Ages",
    ]);

    // Build the 3 tables and populate
    const { t1, t2, t3 } = buildThreeTables();

    // Manufacturer
    mOrdered.forEach((row) => {
      const tr = el("tr");
      tr.append(td(row.category), td(fmt(row.count), { align: "right" }));
      t1.tbody.appendChild(tr);
    });

    // Sex
    sOrdered.forEach((row) => {
      const tr = el("tr");
      tr.append(td(row.category), td(fmt(row.count), { align: "right" }));
      t2.tbody.appendChild(tr);
    });

    // Age
    aOrdered.forEach((row) => {
      const tr = el("tr");
      tr.append(td(row.category), td(fmt(row.count), { align: "right" }));
      t3.tbody.appendChild(tr);
    });
  }

  // ------- Fetch + render
  fetch(DATA_URL, { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
    .then(render)
    .catch((err) => {
      console.error("[vaers-tables] failed to load data:", err);
    });
})();
