// public/assets/js/vaers-tables.js
(function () {
  const root = document.getElementById("vaers-breakdowns");
  if (!root) return;

  const URL = window.VAERS_SUMMARY_URL || "/data/vaers-summary.json";

  fetch(URL, { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
    .then((summary) => {
      const b = summary?.covid_deaths_breakdowns || {};

      const manufacturers = normalize(b.manufacturer);
      const sex = order(normalize(b.sex), ["Female", "Male", "Unknown"]);
      const age = order(
        normalize(b.age_bins),
        ["0-5", "5-12", "12-25", "25-51", "51-66", "66-81", "81-121", "Unknown", "All Ages"]
      );

      root.innerHTML =
        table("Manufacturer", manufacturers) +
        table("Sex", sex) +
        table("Age", age);

      // Remove any nearby placeholder note if present
      const note = root.nextElementSibling;
      if (note && note.classList?.contains("vaers-note")) note.remove();
    })
    .catch((e) => {
      console.error("breakdowns:", e);
      root.innerHTML = '<div class="vaers-note">Charts unavailable.</div>';
    });

  function normalize(rows = []) {
    return rows
      .map((row) => {
        if (Array.isArray(row)) return { category: String(row[0] ?? "Unknown"), count: num(row[1]) };
        if (row && typeof row === "object") {
          const k = row.category ?? row.key ?? "Unknown";
          const v = row.count ?? row.value ?? 0;
          return { category: String(k), count: num(v) };
        }
        return { category: "Unknown", count: 0 };
      })
      .filter((r) => r.category && Number.isFinite(r.count));
  }

  function order(rows, wanted) {
    if (!wanted) return rows.slice();
    const idx = new Map(wanted.map((k, i) => [k, i]));
    return rows.slice().sort((a, b) => {
      const ia = idx.has(a.category) ? idx.get(a.category) : Number.MAX_SAFE_INTEGER;
      const ib = idx.has(b.category) ? idx.get(b.category) : Number.MAX_SAFE_INTEGER;
      return ia - ib || a.category.localeCompare(b.category);
    });
  }

  function table(title, rows) {
    const head = `<thead><tr><th>${esc(title)}</th><th>Cases</th></tr></thead>`;
    const body =
      "<tbody>" +
      rows.map((r) => `<tr><td>${esc(r.category)}</td><td class="cases">${fmt(r.count)}</td></tr>`).join("") +
      "</tbody>";
    return `<table class="stats-table" aria-label="${esc(title)} breakdown">${head}${body}</table>`;
  }

  const num = (v) => (v == null ? 0 : Number(v));
  const fmt = (n) => Number(n || 0).toLocaleString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
})();
// End public/assets/js/vaers-tables.js