/* public/assets/js/vaers-charts.js — strict series, visible bars */

(() => {
  if (window.__VAERS_CHARTS_RENDERED__) return;
  window.__VAERS_CHARTS_RENDERED__ = true;

  const SECTION =
    document.getElementById("vaers-charts-section") ||
    document.querySelector("[data-summary]");
  const DATA_URL =
    (SECTION && SECTION.dataset && SECTION.dataset.summary) ||
    (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
    "/data/vaers-summary.json";

  const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;
  const getCanvas = (id) => document.getElementById(id) || null;
  const getWrap = (id) => document.getElementById(id + "-wrap") || (getCanvas(id)?.parentElement ?? null);
  const ensureCanvasHeight = (c, px = 340) => { if(!c) return; c.style.height = c.style.height || `${px}px`; c.style.width = c.style.width || "100%"; c.setAttribute("height", px); };
  const note = (id, why) => { const w=getWrap(id); if(!w) return; w.querySelector(".chart-unavailable")?.remove(); const d=document.createElement("div"); d.className="chart-unavailable"; d.style.padding="12px"; d.style.color="#6b7280"; d.textContent=`Charts unavailable${why?` (${why})`:""}`; w.appendChild(d); };
  const destroyIfAny = (c)=>{ if(c && c._chart && typeof c._chart.destroy==="function"){ try{c._chart.destroy();}catch{} c._chart=null; } };

  const fmtMonth = (ym) => (/^\d{4}-\d{2}$/.test(ym||"") ? new Date(Date.UTC(...(ym.split("-").map((n,i)=> i?parseInt(n,10)-1:parseInt(n,10))),1)).toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"}) : String(ym||""));

  function drawBar(canvas, labels, data, datasetLabel) {
    if (!canvas || !labels?.length || !data?.length || !hasChartJS()) return;
    ensureCanvasHeight(canvas, 340);
    destroyIfAny(canvas);

    const max = Math.max(...data);
    const suggestedMax = Math.max(5, Math.ceil(max * 1.1));

    const ctx = canvas.getContext("2d");
    canvas._chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: datasetLabel || "",
          data,
          backgroundColor: "rgba(37, 99, 235, 0.6)",   // blue-600 @ 60%
          borderColor: "rgba(37, 99, 235, 1.0)",        // blue-600
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: {
            mode: "index", intersect: false,
            callbacks: {
              label: (c) => (typeof c.parsed.y === "number" ? c.parsed.y.toLocaleString("en-US") : c.parsed.y)
            }
          }
        },
        interaction: { intersect: false },
        scales: {
          x: { ticks: { autoSkip: true, maxRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, suggestedMax, ticks: { precision: 0, callback: v => Number(v).toLocaleString("en-US") }, grid: { drawBorder: false } }
        }
      }
    });
  }

  async function render() {
    const cYear  = getCanvas("chart-by-year");
    const cMonth = getCanvas("chart-by-month");
    const cOnset = getCanvas("chart-onset");
    [cYear,cMonth,cOnset].forEach(c => ensureCanvasHeight(c, 340));

    if (!hasChartJS()) { ["chart-by-year","chart-by-month","chart-onset"].forEach(id => note(id, "Chart.js not loaded")); return; }

    let json;
    try {
      const r = await fetch(DATA_URL, { cache: "no-cache" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      json = await r.json();
    } catch (e) {
      console.error("[vaers-charts] fetch error:", e);
      ["chart-by-year","chart-by-month","chart-onset"].forEach(id => note(id, "load error"));
      return;
    }

    // strict: only our arrays
    const byYear  = Array.isArray(json.covid_deaths_by_year)  ? json.covid_deaths_by_year  : [];
    const byMonth = Array.isArray(json.covid_deaths_by_month) ? json.covid_deaths_by_month : [];
    const onset   = Array.isArray(json.days_to_onset)         ? json.days_to_onset         : [];

    if (cYear) {
      if (!byYear.length) note("chart-by-year","no data");
      else {
        const labels = byYear.map(d => String(d.label ?? d.year ?? ""));
        const data   = byYear.map(d => Number(d.count || 0));
        (Math.max(...data) > 0) ? drawBar(cYear, labels, data, "Deaths") : note("chart-by-year","no data");
      }
    }

    if (cMonth) {
      if (!byMonth.length) note("chart-by-month","no data");
      else {
        const labels = byMonth.map(d => fmtMonth(String(d.label ?? "")));
        const data   = byMonth.map(d => Number(d.count || 0));
        (Math.max(...data) > 0) ? drawBar(cMonth, labels, data, "Deaths") : note("chart-by-month","no data");
      }
    }

    if (cOnset) {
      if (!onset.length) note("chart-onset","no data");
      else {
        const labels = onset.map(d => (typeof d.day === "number" ? String(d.day) : String(d.label ?? "")));
        const data   = onset.map(d => Number(d.count || 0));
        (Math.max(...data) > 0) ? drawBar(cOnset, labels, data, "Reports") : note("chart-onset","no data");
      }
    }
  }

  const kick = () => ("requestIdleCallback" in window ? requestIdleCallback(render, { timeout: 800 }) : setTimeout(render, 0));
  (document.readyState === "loading") ? document.addEventListener("DOMContentLoaded", kick, { once: true }) : kick();
})();
