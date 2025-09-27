/* public/assets/js/vaers-charts.js
 *
 * Mortality charts renderer (Year, Month, Days-to-Onset).
 * - Reuses EXISTING containers only; NEVER creates new ones.
 *   Expected IDs in the HTML:
 *     #chart-by-year, #chart-by-month, #chart-onset
 *   (Optionally wrapped in #chart-by-year-wrap, etc., but not required.)
 * - Data URL: attribute (data-summary on #vaers-charts-section) → window.VAERS_SUMMARY_URL → default.
 * - Auto-loads Chart.js if missing.
 * - Defensive: per-chart "Charts unavailable" when arrays are empty or load fails.
 * - Does NOT modify the breakdown table rendering.
 */

// prevent double bootstrap if the script gets included twice
if (!window.__VAERS_CHARTS_BOOTSTRAPPED__) {
  window.__VAERS_CHARTS_BOOTSTRAPPED__ = true;

  (function () {
    // ---------- Resolve data URL (attribute → global → default)
    const SECTION =
      document.getElementById("vaers-charts-section") ||
      document.querySelector("[data-summary]");

    const DATA_URL =
      (SECTION && SECTION.dataset && SECTION.dataset.summary) ||
      (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
      "/data/vaers-summary.json";

    try {
      console.log("[vaers-charts] data URL:", DATA_URL);
      window.__VAERS_DATA_URL__ = DATA_URL; // for debugging
    } catch (_) {}

    // ---------- Helpers
    const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;

    function loadChartJS() {
      if (hasChartJS()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Chart.js"));
        document.head.appendChild(s);
      });
    }

    function getCanvas(id) {
      // STRICT: only use existing canvas; do not create or move DOM
      return document.getElementById(id) || null;
    }

    function getWrap(id) {
      // Prefer an explicit wrap if present; otherwise return the canvas' parent
      const wrap = document.getElementById(id + "-wrap");
      const canvas = getCanvas(id);
      return wrap || (canvas ? canvas.parentElement : null);
    }

    function showUnavailable(id, reason) {
      const wrap = getWrap(id);
      if (!wrap) return;
      // remove prior message if any
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
      if (!hasChartJS() || !canvas) return;
      const ctx = canvas.getContext("2d");
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
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = typeof ctx.parsed.y === "number"
                    ? ctx.parsed.y.toLocaleString("en-US")
                    : ctx.parsed.y;
                  return (opts.tooltipLabelPrefix || "") + v;
                }
              }
            },
            title: { display: false }
          },
          scales: {
            x: {
              ticks: { autoSkip: true, maxRotation: 0 },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
              grid: { drawBorder: false }
            }
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
      return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    };

    // ---------- Fetch + render
    fetch(DATA_URL, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((json) => {
        // Accept multiple possible keys (tolerant of older/newer JSONs)
        const onset   = json.days_to_onset || json.covid_deaths_by_onset || [];
        const byMonth = json.covid_deaths_by_month || json.deaths_by_month || [];
        const byYear  = json.covid_deaths_by_year  || json.deaths_by_year  || [];

        // Grab ONLY existing canvases
        const cYear  = getCanvas("chart-by-year");
        const cMonth = getCanvas("chart-by-month");
        const cOnset = getCanvas("chart-onset");

        // Normalize datasets
        const yearLabels = byYear.map((d) => String(d.label ?? d.year ?? ""));
        const yearData   = byYear.map((d) => Number(d.count || 0));

        const monthLabelsRaw = byMonth.map((d) => String(d.label ?? ""));
        const monthLabels    = monthLabelsRaw.map(fmtMonth);
        const monthData      = byMonth.map((d) => Number(d.count || 0));

        const onsetLabels = onset.map((d) =>
          typeof d.day === "number" ? String(d.day) : String(d.label ?? "")
        );
        const onsetData   = onset.map((d) => Number(d.count || 0));

        // Show per-chart availability notes BEFORE loading Chart.js
        if (cYear) {
          if (!yearLabels.length || !yearData.length) showUnavailable("chart-by-year", "no data");
        }
        if (cMonth) {
          if (!monthLabels.length || !monthData.length) showUnavailable("chart-by-month", "no data");
        }
        if (cOnset) {
          if (!onsetLabels.length || !onsetData.length) showUnavailable("chart-onset", "no data");
        }

        // Always load Chart.js once, then draw independently for each chart that has data + canvas
        return loadChartJS().then(() => {
          if (cYear && yearLabels.length && yearData.length) {
            drawBar(cYear, yearLabels, yearData, { datasetLabel: "Deaths" });
          }
          if (cMonth && monthLabels.length && monthData.length) {
            drawBar(cMonth, monthLabels, monthData, { datasetLabel: "Deaths" });
          }
          if (cOnset && onsetLabels.length && onsetData.length) {
            drawBar(cOnset, onsetLabels, onsetData, { datasetLabel: "Reports" });
          }
        });
      })
      .catch((err) => {
        console.error("[vaers-charts] failed to load or render charts:", err);
        ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
          showUnavailable(id, "load error")
        );
      });
  })();
}
