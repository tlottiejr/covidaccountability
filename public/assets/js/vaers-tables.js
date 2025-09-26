// public/assets/js/vaers-tables.js
// Restores the breakdown table INSIDE the gradient card and keeps the wrapper intact.

(function () {
  const $ = (s) => document.querySelector(s);

  async function loadSummary() {
    const url = window.VAERS_SUMMARY_URL || "/data/vaers-summary.json";
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  function renderRows(rows = []) {
    return rows
      .map(
        ([k, v]) =>
          `<tr><td>${k ?? "Unknown"}</td><td style="text-align:right">${Number(v || 0).toLocaleString()}</td></tr>`
      )
      .join("");
  }

  function renderTable(el, breakdowns) {
    if (!el) return;
    // IMPORTANT: assume #vaersBreakdownsTable is the gradient WRAPPER
    // We render into a child content container to avoid nuking the gradient.
    let content = el.querySelector(".vaers-table-content");
    if (!content) {
      content = document.createElement("div");
      content.className = "vaers-table-content";
      el.appendChild(content);
    }

    const m = breakdowns?.manufacturer || [];
    const s = breakdowns?.sex || [];
    const a = breakdowns?.age_bins || [];

    const empty = !m.length && !s.length && !a.length;

    content.innerHTML = `
      <div class="vaers-section">
        <h4 class="vaers-title">Manufacturer (COVID, US/Territories)</h4>
        <table class="table-simple">
          <thead><tr><th>Category</th><th style="text-align:right">Count</th></tr></thead>
          <tbody>${renderRows(m)}</tbody>
        </table>
      </div>
      <div class="vaers-section">
        <h4 class="vaers-title">Sex (COVID, US/Territories)</h4>
        <table class="table-simple">
          <thead><tr><th>Category</th><th style="text-align:right">Count</th></tr></thead>
          <tbody>${renderRows(s)}</tbody>
        </table>
      </div>
      <div class="vaers-section">
        <h4 class="vaers-title">Age (COVID, US/Territories)</h4>
        <table class="table-simple">
          <thead><tr><th>Category</th><th style="text-align:right">Count</th></tr></thead>
          <tbody>${renderRows(a)}</tbody>
        </table>
      </div>
      ${empty ? '<div class="vaers-note">No data available.</div>' : ""}
    `;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const d = await loadSummary();
      renderTable(document.getElementById("vaersBreakdownsTable"), d.covid_deaths_breakdowns);
    } catch (e) {
      console.error("VAERS table failed:", e);
    }
  });
})();
