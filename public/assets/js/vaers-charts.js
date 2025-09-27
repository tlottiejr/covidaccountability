/* public/assets/js/vaers-charts.js
 * Draws Year, Month, and Onset charts using Chart.js.
 * Reads your schema:
 *   - covid_deaths_by_year: [{label,count}]
 *   - covid_deaths_by_month: [{label,count}]
 *   - days_to_onset: [{day,count}]  // 0..19
 * Fallbacks:
 *   - reports_by_year.deaths_by_year.all: [[year,count], ...]
 * Data URL priority:
 *   1) window.VAERS_SUMMARY_URL
 *   2) <section id="vaers-charts-section" data-summary="...">
 *   3) /data/vaers-summary-openvaers.json
 *   4) /data/vaers-summary.json
 */

(function () {
  function pickUrl() {
    const s = document.getElementById("vaers-charts-section");
    return (
      (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
      (s && s.getAttribute("data-summary")) ||
      "/data/vaers-summary-openvaers.json"
    );
  }

  async function loadJson() {
    const urls = [
      pickUrl(),
      "/data/vaers-summary-openvaers.json",
      "/data/vaers-summary.json",
    ];
    const tried = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
        tried.push(`${u} [${r.status}]`);
      } catch (e) {
        tried.push(`${u} [${String(e)}]`);
      }
    }
    throw new Error("All data sources failed:\n" + tried.join("\n"));
  }

  function normPairs(arr) {
    // [[label,count], ...] -> [{label,count}]
    return (arr || []).map(([label, count]) => ({
      label: String(label),
      count: Number(count || 0),
    }));
  }

  function getTheme() {
    const css = getComputedStyle(document.documentElement);
    return {
      primary:
        css.getPropertyValue("--brand").trim() ||
        css.getPropertyValue("--color-primary").trim() ||
        "#0ea5e9",
      grid: "#e5e7eb",
      text: css.getPropertyValue("--text-color").trim() || "#111827",
    };
  }

  function fmt(n) {
    return Number(n).toLocaleString(undefined);
  }

  function barChart(ctx, labels, values) {
    const { primary, grid, text } = getTheme();
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Deaths", data: values, backgroundColor: primary, borderColor: primary }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Deaths: ${fmt(c.parsed.y)}` } } },
        scales: {
          x: { ticks: { color: text }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: text, callback: v => fmt(v) }, grid: { color: grid } },
        },
      },
    });
  }

  function lineChart(ctx, labels, values) {
    const { primary, grid, text } = getTheme();
    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ label: "Deaths", data: values, borderColor: primary, backgroundColor: primary + "22", fill: true, tension: 0.25, pointRadius: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Deaths: ${fmt(c.parsed.y)}` } } },
        scales: {
          x: { ticks: { color: text, maxRotation: 45, minRotation: 45 }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: text, callback: v => fmt(v) }, grid: { color: grid } },
        },
      },
    });
  }

  async function init() {
    if (typeof Chart === "undefined") {
      throw new Error("Chart.js not loaded — ensure /assets/vendor/chart.umd.min.js is included before this script.");
    }
    const j = await loadJson();

    // ---- deaths by year ----
    let byYear = Array.isArray(j.covid_deaths_by_year)
      ? j.covid_deaths_by_year.map(o => ({ label: String(o.label), count: Number(o.count || 0) }))
      : (j.reports_by_year?.deaths_by_year?.all ? normPairs(j.reports_by_year.deaths_by_year.all) : []);

    byYear.sort((a,b)=>Number(a.label)-Number(b.label));

    // ---- deaths by month ----
    let byMonth = Array.isArray(j.covid_deaths_by_month)
      ? j.covid_deaths_by_month.map(o => ({ label: String(o.label), count: Number(o.count || 0) }))
      : [];

    byMonth.sort((a,b)=>String(a.label).localeCompare(String(b.label)));

    // ---- days to onset (0..19) ----
    let onset = Array.isArray(j.days_to_onset)
      ? j.days_to_onset.map(o => ({ label: String(o.day), count: Number(o.count || 0) }))
      : [];

    onset.sort((a,b)=>Number(a.label)-Number(b.label));

    // mount
    const cYear = document.getElementById("chart-by-year");
    const cMonth = document.getElementById("chart-by-month");
    const cOnset = document.getElementById("chart-onset");

    if (cYear && byYear.length) barChart(cYear.getContext("2d"), byYear.map(d=>d.label), byYear.map(d=>d.count));
    if (cMonth && byMonth.length) lineChart(cMonth.getContext("2d"), byMonth.map(d=>d.label), byMonth.map(d=>d.count));
    if (cOnset && onset.length) barChart(cOnset.getContext("2d"), onset.map(d=>d.label), onset.map(d=>d.count));
  }

  // defer guarantees DOM is ready
  init().catch(err => {
    console.error("[vaers-charts] init failed:", err);
  });
})();
 