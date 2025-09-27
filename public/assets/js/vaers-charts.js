/* public/assets/js/vaers-charts.js
   Render the three OpenVAERS mortality charts using Chart.js.
   Reads:
     - covid_deaths_by_year:  [{label,count}]
     - covid_deaths_by_month: [{label,count}]
     - days_to_onset:         [{day,count}] with final item day === "20+"
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
  async function getData() {
    const tried = [];
    for (const u of [pickUrl(), "/data/vaers-summary-openvaers.json", "/data/vaers-summary.json"]) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
        tried.push(`${u} [${r.status}]`);
      } catch (e) { tried.push(`${u} [${String(e)}]`); }
    }
    throw new Error("All data sources failed:\n" + tried.join("\n"));
  }
  function theme() {
    const css = getComputedStyle(document.documentElement);
    return {
      primary: css.getPropertyValue("--brand").trim() ||
               css.getPropertyValue("--color-primary").trim() || "#0ea5e9",
      grid: "#e5e7eb",
      text: css.getPropertyValue("--text-color").trim() || "#111827",
    };
  }
  const fmt = n => Number(n).toLocaleString();

  function mountBar(ctx, labels, values, rotate=0) {
    const { primary, grid, text } = theme();
    return new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Deaths", data: values, backgroundColor: primary, borderColor: primary }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Deaths: ${fmt(c.parsed.y)}` } } },
        scales: {
          x: { ticks: { color: text, maxRotation: rotate, minRotation: rotate }, grid: { color: grid } },
          y: { beginAtZero: true, ticks: { color: text, callback: v => fmt(v) }, grid: { color: grid } },
        }
      }
    });
  }

  function mountLine(ctx, labels, values) {
    const { primary, grid, text } = theme();
    return new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Deaths", data: values, borderColor: primary, backgroundColor: primary + "22", fill: true, tension: 0.25, pointRadius: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Deaths: ${fmt(c.parsed.y)}` } } },
        scales: { x: { ticks: { color: text, maxRotation: 45, minRotation: 45 }, grid: { color: grid } },
                  y: { beginAtZero: true, ticks: { color: text, callback: v => fmt(v) }, grid: { color: grid } } }
      }
    });
  }

  async function init() {
    if (typeof Chart === "undefined") throw new Error("Chart.js not loaded.");
    const j = await getData();

    // Year (all vaccines, by DATEDIED year)
    const yPairs  = j?.reports_by_year?.deaths_by_year?.all || [];
   const ySeries = yPairs.map(([year, count]) => ({
     label: String(year),
     count: Number(count || 0),
  })).sort((a,b)=> Number(a.label) - Number(b.label));
    // Month (COVID only, by RECVDATE)
    const mSeries = (j.covid_deaths_by_month || []).map(o => ({ label: String(o.label), count: Number(o.count||0) }))
      .sort((a,b)=>a.label.localeCompare(b.label));
    // Onset (COVID/FLU, 0..19 + "20+")
    const oSeries = (j.days_to_onset || []).map(o => ({
   label: (o.day === "20+" ? "20+" : String(o.day)),
   count: Number(o.count || 0)
})).sort((a,b) => {
  const ax = a.label === "20+" ? Number.POSITIVE_INFINITY : Number(a.label);
  const bx = b.label === "20+" ? Number.POSITIVE_INFINITY : Number(b.label);
  return ax - bx;
});

    const cYear  = document.getElementById("chart-by-year");
    const cMonth = document.getElementById("chart-by-month");
    const cOnset = document.getElementById("chart-onset");

    if (cYear && ySeries.length)  mountBar (cYear .getContext("2d"), ySeries.map(d=>d.label),  ySeries.map(d=>d.count), 45);
    if (cMonth && mSeries.length) mountLine(cMonth.getContext("2d"), mSeries.map(d=>d.label), mSeries.map(d=>d.count));
    if (cOnset && oSeries.length) mountBar (cOnset.getContext("2d"), oSeries.map(d=>d.label), oSeries.map(d=>d.count));
  }

  init().catch(err => console.error("[vaers-charts] init failed:", err));
})();
