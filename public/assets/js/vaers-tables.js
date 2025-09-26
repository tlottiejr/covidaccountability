// public/assets/js/vaers-tables.js
// Renders three sibling <table>s inside #vaers-breakdowns to match existing CSS.

(function () {
  const container = document.getElementById("vaers-breakdowns");
  if (!container) return;

  const loadSummary = async () => {
    const url = window.VAERS_SUMMARY_URL || "/data/vaers-summary.json";
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  };

  const norm = (rows = []) =>
    rows.map((row) =>
      Array.isArray(row)
        ? { category: row[0], count: Number(row[1] || 0) }
        : { category: row?.category ?? row?.key ?? "Unknown", count: Number(row?.count ?? row?.value ?? 0) }
    );

  const tableHTML = (title, rows) => {
    const data = norm(rows);
    const head = `<thead><tr><th>${esc(title)}</th><th>Cases</th></tr></thead>`;
    const body =
      "<tbody>" +
      data
        .map(({ category, count }) => `<tr><td>${esc(category)}</td><td style="text-align:right">${Number(count).toLocaleString()}</td></tr>`)
        .join("") +
      "</tbody>";
    return `<table class="stats-table">${head}${body}</table>`;
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  (async () => {
    try {
      const summary = await loadSummary();
      const b = summary?.covid_deaths_breakdowns || {};

      // IMPORTANT: append exactly three <table> siblings; CSS uses nth-of-type rules
      container.innerHTML =
        tableHTML("Manufacturer", b.manufacturer || []) +
        tableHTML("Sex", b.sex || []) +
        tableHTML("Age", b.age_bins || []);
    } catch (err) {
      console.error("render breakdowns failed:", err);
      container.innerHTML = '<div class="vaers-note">Charts unavailable.</div>';
    }
  })();
})();
