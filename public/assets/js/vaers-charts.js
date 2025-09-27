/* public/assets/js/vaers-charts.js
 * Fast, deterministic renderer for three charts:
 *   #chart-by-year, #chart-by-month, #chart-onset
 * - Uses data-summary URL on #vaers-charts-section (→ window.VAERS_SUMMARY_URL → default)
 * - No dynamic script injection (Chart.js loaded statically via <script defer>)
 * - Offloads work with requestIdleCallback (fallback to setTimeout), no animations
 * - Per-chart "Charts unavailable" notes; table untouched
 */

if (!window.__VAERS_CHARTS_BOOTSTRAPPED__) {
  window.__VAERS_CHARTS_BOOTSTRAPPED__ = true;

  (function () {
    // ---------- Resolve data URL
    const SECTION =
      document.getElementById("vaers-charts-section") ||
      document.querySelector("[data-summary]");
    const DATA_URL =
      (SECTION && SECTION.dataset && SECTION.dataset.summary) ||
      (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
      "/data/vaers-summary.json";

    try {
      console.log("[vaers-charts] data URL:", DATA_URL);
      window.__VAERS_DATA_URL__ = DATA_URL;
    } catch (_) {}

    // ---------- Helpers
    const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;
    const getCanvas = (id) => document.getElementById(id) || null;
    function getWrap(id) {
      const wrap = document.getElementById(id + "-wrap");
      const canvas = getCanvas(id);
      return wrap || (canvas ? canvas.parentElement : null);
    }
    function showUnavailable(id, reason) {
      const wrap = getWrap(id);
      if (!wrap) return;
      const old = wrap.querySelector(".chart-unavailable");
      if (old) old.remove();
      const note = document.createElement("div");
      note.className = "chart-unavailable";
      note.style.padding = "12px";
      note.style.color = "#6b7280";
      note.textContent = "Charts unavailable" + (reason ? ` (${reason})` : "");
      wrap.appendChild(note);
    }
    function destroyIfAny(canvas) {
      if (canvas && canvas._chart && typeof canvas._chart.destroy === "function") {
        try { canvas._chart.destroy(); } catch (_) {}
        canvas._chart = null;
      }
    }
    function drawBar(canvas, labels, data, opts = {}) {
      if (!hasChartJS() || !canvas || !labels.length || !data.length) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: false });
      destroyIfAny(canvas);
      const chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: opts.datasetLabel || "",
              data,
              borderWidth: 1
              // Do not set colors/styles: keep defaults so theme stays consistent
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          normalized: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              intersect: false,
              mode: "index",
              callbacks: {
                label: (ctx) => {
                  const v =
                    typeof ctx.parsed.y === "number"
                      ? ctx.parsed.y.toLocaleString("en-US")
                      : ctx.parsed.y;
                  return (opts.tooltipLabelPrefix || "") + v;
                }
              }
            },
            title: { display: false }
          },
          interaction: { intersect: false },
          scales: {
            x: { ticks: { autoSkip: true, maxRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { drawBorder: false } }
          }
        }
      });
      canvas._chart = chart;
      return chart;
    }

    // Formats "YYYY-MM" -> "Mon YYYY"
    const fmtMonth = (ym) => {
      if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return String(ym || "");
      const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
      const dt = new Date(Date.UTC(y, m - 1, 1));
      return dt.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      });
    };

    // ---------- Render job
    async function renderCharts() {
      // If Chart.js didn't load (CSP or script missing), fail fast
      if (!hasChartJS()) {
        ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
          showUnavailable(id, "Chart.js not loaded")
        );
        return;
      }

      let json;
      try {
        const r = await fetch(DATA_URL, { cache: "no-cache" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        json = await r.json();
      } catch (err) {
        console.error("[vaers-charts] fetch error:", err);
        ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
          showUnavailable(id, "load error")
        );
        return;
      }

      // Normalize datasets (accept older keys too)
      const onset = json.days_to_onset || json.covid_deaths_by_onset || [];
      const byMonth = json.covid_deaths_by_month || json.deaths_by_month || [];
      const byYear = json.covid_deaths_by_year || json.deaths_by_year || [];

      const cYear = getCanvas("chart-by-year");
      const cMonth = getCanvas("chart-by-month");
      const cOnset = getCanvas("chart-onset");

      const yearLabels = byYear.map((d) => String(d.label ?? d.year ?? ""));
      const yearData = byYear.map((d) => Number(d.count || 0));

      const monthLabels = byMonth.map((d) => fmtMonth(String(d.label ?? "")));
      const monthData = byMonth.map((d) => Number(d.count || 0));

      const onsetLabels = onset.map((d) =>
        typeof d.day === "number" ? String(d.day) : String(d.label ?? "")
      );
      const onsetData = onset.map((d) => Number(d.count || 0));

      if (cYear && (!yearLabels.length || !yearData.length))
        showUnavailable("chart-by-year", "no data");
      if (cMonth && (!monthLabels.length || !monthData.length))
        showUnavailable("chart-by-month", "no data");
      if (cOnset && (!onsetLabels.length || !onsetData.length))
        showUnavailable("chart-onset", "no data");

      // Draw each chart on a separate task to keep the UI snappy
      if (cYear && yearLabels.length && yearData.length) {
        setTimeout(() => drawBar(cYear, yearLabels, yearData, { datasetLabel: "Deaths" }), 0);
      }
      if (cMonth && monthLabels.length && monthData.length) {
        setTimeout(() => drawBar(cMonth, monthLabels, monthData, { datasetLabel: "Deaths" }), 0);
      }
      if (cOnset && onsetLabels.length && onsetData.length) {
        setTimeout(() => drawBar(cOnset, onsetLabels, onsetData, { datasetLabel: "Reports" }), 0);
      }
    }

    // ---------- Run after HTML is parsed and the browser is idle-ish
    const kick = () => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(renderCharts, { timeout: 800 });
      } else {
        setTimeout(renderCharts, 0);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", kick, { once: true });
    } else {
      kick();
    }
  })();
}
