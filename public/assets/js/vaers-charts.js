/* public/assets/js/vaers-charts.js
 * Stable renderer for 3 charts:
 *   #chart-by-year, #chart-by-month, #chart-onset
 * Data URL: #vaers-charts-section[data-summary] → window.VAERS_SUMMARY_URL → /data/vaers-summary.json
 * - Waits for Chart.js with timeout (prints clear console messages)
 * - One fetch, one render, no re-entry
 * - Fixes canvas height to avoid infinite layout growth
 * - Shows per-chart "Charts unavailable (...)" notes; leaves table untouched
 */

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

  console.log("[vaers-charts] data URL:", DATA_URL);

  // ---- helpers
  const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;

  function waitForChartJS(timeoutMs = 3000) {
    if (hasChartJS()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (hasChartJS()) {
          clearInterval(iv);
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          console.error("[vaers-charts] Chart.js not available after", timeoutMs, "ms");
          resolve(false);
        }
      }, 50);
    });
  }

  const getCanvas = (id) => document.getElementById(id) || null;
  function getWrap(id) {
    const wrap = document.getElementById(id + "-wrap");
    const canvas = getCanvas(id);
    return wrap || (canvas ? canvas.parentElement : null);
  }
  function ensureCanvasHeight(canvas, px = 340) {
    if (!canvas) return;
    // Fix the canvas height so the container doesn’t “grow forever”
    if (!canvas.style.height) canvas.style.height = px + "px";
    if (!canvas.style.width)  canvas.style.width = "100%";
    canvas.setAttribute("height", px); // Chart.js respects attribute height
  }
  function note(id, reason) {
    const wrap = getWrap(id);
    if (!wrap) return;
    const old = wrap.querySelector(".chart-unavailable");
    if (old) old.remove();
    const div = document.createElement("div");
    div.className = "chart-unavailable";
    div.style.padding = "12px";
    div.style.color = "#6b7280";
    div.textContent = "Charts unavailable" + (reason ? ` (${reason})` : "");
    wrap.appendChild(div);
  }
  function destroyIfAny(canvas) {
    if (canvas && canvas._chart && typeof canvas._chart.destroy === "function") {
      try { canvas._chart.destroy(); } catch (_) {}
      canvas._chart = null;
    }
  }
  function drawBar(canvas, labels, data, labelText) {
    if (!canvas || !labels?.length || !data?.length || !hasChartJS()) return;
    ensureCanvasHeight(canvas, 340);
    destroyIfAny(canvas);
    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: labelText || "", data, borderWidth: 1 }] },
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
            mode: "index",
            intersect: false,
            callbacks: {
              label: (c) => {
                const v = typeof c.parsed.y === "number"
                  ? c.parsed.y.toLocaleString("en-US")
                  : c.parsed.y;
                return v;
              }
            }
          }
        },
        interaction: { intersect: false },
        scales: {
          x: { ticks: { autoSkip: true, maxRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { drawBorder: false } }
        }
      }
    });
    canvas._chart = chart;
  }

  const fmtMonth = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return String(ym || "");
    const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, 1));
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  };

  async function render() {
    // Ensure canvases exist and have fixed height up front
    const cYear  = getCanvas("chart-by-year");
    const cMonth = getCanvas("chart-by-month");
    const cOnset = getCanvas("chart-onset");
    [cYear, cMonth, cOnset].forEach((c) => ensureCanvasHeight(c, 340));

    // Load Chart.js (should already be on page via <script defer>, but wait safely)
    const chartOK = await waitForChartJS(4000);
    if (!chartOK) {
      ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
        note(id, "Chart.js not loaded")
      );
      return;
    }

    // Fetch once
    let data;
    try {
      const r = await fetch(DATA_URL, { cache: "no-cache" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      data = await r.json();
    } catch (e) {
      console.error("[vaers-charts] fetch error:", e);
      ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
        note(id, "load error")
      );
      return;
    }

    // Normalize keys
    const byYear  = data.covid_deaths_by_year  || data.deaths_by_year  || [];
    const byMonth = data.covid_deaths_by_month || data.deaths_by_month || [];
    const onset   = data.days_to_onset         || data.covid_deaths_by_onset || [];

    const yearLabels  = byYear.map((d) => String(d.label ?? d.year ?? ""));
    const yearData    = byYear.map((d) => Number(d.count || 0));
    const monthLabels = byMonth.map((d) => fmtMonth(String(d.label ?? "")));
    const monthData   = byMonth.map((d) => Number(d.count || 0));
    const onsetLabels = onset.map((d) =>
      typeof d.day === "number" ? String(d.day) : String(d.label ?? "")
    );
    const onsetData   = onset.map((d) => Number(d.count || 0));

    // Show per-chart note if empty
    if (cYear  && (!yearLabels.length  || !yearData.length))   note("chart-by-year", "no data");
    if (cMonth && (!monthLabels.length || !monthData.length))  note("chart-by-month", "no data");
    if (cOnset && (!onsetLabels.length || !onsetData.length))  note("chart-onset", "no data");

    // Draw — split across microtasks to keep UI responsive
    setTimeout(() => cYear  && yearLabels.length  && yearData.length  && drawBar(cYear,  yearLabels,  yearData,  "Deaths"), 0);
    setTimeout(() => cMonth && monthLabels.length && monthData.length && drawBar(cMonth, monthLabels, monthData, "Deaths"), 0);
    setTimeout(() => cOnset && onsetLabels.length && onsetData.length && drawBar(cOnset, onsetLabels, onsetData, "Reports"), 0);
  }

  const kick = () => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(render, { timeout: 1000 });
    } else {
      setTimeout(render, 0);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", kick, { once: true });
  } else {
    kick();
  }
})();
