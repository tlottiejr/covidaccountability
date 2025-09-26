// public/assets/js/vaers-tables.js
// Renders exactly THREE sibling <table> elements directly inside #vaers-breakdowns,
// aligned with the legacy CSS. Adds robust normalization and stable ordering.

(function () {
  const container = document.getElementById("vaers-breakdowns");
  if (!container) return;

  const SUMMARY_URL = window.VAERS_SUMMARY_URL || "/data/vaers-summary.json";

  (async () => {
    try {
      const res = await fetch(SUMMARY_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load ${SUMMARY_URL}: ${res.status}`);
      const summary = await res.json();

      const b = summary?.covid_deaths_breakdowns || {};
      const manufacturers = normalizePairs(b.manufacturer);
      const sex = normalizePairs(b.sex);
      const age = normalizePairs(b.age_bins);

      // Stable orders to match how the original looked
      const sexOrder = ["Female", "Male", "Unknown"];
      const ageOrder = ["0-5","5-12","12-25","25-51","51-66","66-81","81-121","Unknown","All Ages"];

      const sexSorted = sortByOrder(sex, sexOrder);
      const ageSorted = sortByOrder(age, ageOrder);

      // render three separate tables, no wrappers
      container.innerHTML =
        oneTable("Manufacturer", manufacturers) +
        oneTable("Sex",           sexSorted) +
        oneTable("Age",           ageSorted);

    } catch (err) {
      console.error("VAERS breakdowns render failed:", err);
      container.innerHTML = '<div class="vaers-note">Charts unavailable.</div>';
    }
  })();

  function normalizePairs(rows) {
    // Accept [{category,count}], [[k,v]], or objects with {key,value}
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        if (Array.isArray(row)) {
          return { category: String(row[0] ?? "Unknown"), count: toNum(row[1]) };
        } else if (row && typeof row === "object") {
          const k = row.category ?? row.key ?? "Unknown";
          const v = row.count ?? row.value ?? 0;
          return { category: String(k), count: toNum(v) };
        }
        return { category: "Unknown", count: 0 };
      })
      // drop empty/total-looking garbage that sneaks in from bad inputs
      .filter((r) => r.category && Number.isFinite(r.count));
  }

  function sortByOrder(rows, order) {
    if (!order) return rows.slice();
    const index = new Map(order.map((k, i) => [k, i]));
    return rows
      .slice()
      .sort((a, b) => {
        const ia = index.has(a.category) ? index.get(a.category) : Number.MAX_SAFE_INTEGER;
        const ib = index.has(b.category) ? index.get(b.category) : Number.MAX_SAFE_INTEGER;
        return ia - ib || (a.category > b.category ? 1 : -1);
      });
  }

  function oneTable(title, rows) {
    const thead = `<thead><tr><th>${esc(title)}</th><th>Cases</th></tr></thead>`;
    const tbody =
      "<tbody>" +
      rows
        .map(({ category, count }) =>
          `<tr><td>${esc(category)}</td><td class="cases">${num(count)}</td></tr>`
        )
        .join("") +
      "</tbody>";
    return `<table class="stats-table">${thead}${tbody}</table>`;
  }

  const num = (n) => Number(n || 0).toLocaleString();
  const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
})();
// End of vaers-tables.js