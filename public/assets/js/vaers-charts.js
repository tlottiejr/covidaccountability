/* public/assets/js/vaers-charts.js
 *
 * Mortality charts renderer.
 * - Uses the page's data-summary attribute FIRST, then window.VAERS_SUMMARY_URL,
 *   then falls back to /data/vaers-summary.json.
 * - Draws three charts that mirror the OpenVAERS Mortality page:
 *     1) Days to Onset (0..19)
 *     2) Deaths by Month
 *     3) Deaths by Year
 * - Defensive: no-ops if Chart.js is not present or DOM nodes are absent.
 * - Does NOT modify the breakdown tables; those are rendered elsewhere.
 */

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
    window.__VAERS_DATA_URL__ = DATA_URL; // expose for debugging
  } catch (_) {}

  // ---------- Helpers
  const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;

  function ensureWrap(id, titleText) {
    // Insert charts before the breakdowns table if possible, keeping a stable order
    const host =
      document.getElementById("vaers-charts-section") ||
      document.body;

    // Create wrapper (card) if missing
    let wrap = document.getElementById(id + "-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = id + "-wrap";
      wrap.className = "chart-wrap"; // your site CSS can style this
      // place before the breakdowns table if present
      const beforeNode = document.getElementById("vaers-breakdowns");
      host.insertBefore(wrap, beforeNode || null);
    }

    // Title (H3) in your theme
    let title = document.getElementById(id + "-title");
    if (!title) {
      title = document.createElement("h3");
      title.id = id + "-title";
      wrap.appendChild(title);
    }
    title.textContent = titleText || "";

    // Canvas element
    let canvas = document.getElementById(id);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = id;
      canvas.style.width = "100%";
      canvas.style.height = "340px";
      wrap.appendChild(canvas);
    }

    return canvas;
  }

  function destroyIfAny(canvas) {
    if (canvas && canvas._chart && typeof canvas._chart.destroy === "function") {
      try { canvas._chart.destroy(); } catch (_) {}
      canvas._chart = null;
    }
  }

  function drawBar(canvas, labels, data, opts = {}) {
    if (!hasChartJS()) return;
    const ctx = canvas.getContext("2d");
    destroyIfAny(canvas);

    // Build dataset; avoid pinning explicit colors so your theme can style via Chart.js defaults/CSS vars.
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
              label: (ctx) =>
                (opts.tooltipLabelPrefix || "") +
                (typeof ctx.parsed.y === "number"
                  ? ctx.parsed.y.toLocaleString("en-US")
                  : ctx.parsed.y)
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

  // Format helpers
  const fmtMonth = (ym) => {
    // ym like "2021-01" -> "Jan 2021"
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
      // Accept several possible key names to be tolerant of older data files
      const onset = json.days_to_onset || json.covid_deaths_by_onset || [];
      const byMonth = json.covid_deaths_by_month || json.deaths_by_month || [];
      const byYear = json.covid_deaths_by_year || json.deaths_by_year || [];

      // ---- Chart 1: Days to Onset (bins 0..19)
      // Expected objects: { day: 0..19, count: number } or { label, count }
      const onsetLabels = onset.map((d) =>
        typeof d.day === "number" ? String(d.day) : String(d.label ?? "")
      );
      const onsetData = onset.map((d) => Number(d.count || 0));

      if (onsetLabels.length && onsetData.length) {
        const c1 = ensureWrap(
          "chart-onset",
          "VAERS COVID/FLU Vaccine Reported Deaths by Days to Onset (All Ages)"
        );
        drawBar(c1, onsetLabels, onsetData, {
          datasetLabel: "Reports",
          tooltipLabelPrefix: ""
        });
      }

      // ---- Chart 2: Deaths by Month
      // Expected objects: { label: "YYYY-MM", count: number }
      const monthLabelsRaw = byMonth.map((d) => String(d.label ?? ""));
      const monthLabels = monthLabelsRaw.map(fmtMonth);
      const monthData = byMonth.map((d) => Number(d.count || 0));

      if (monthLabels.length && monthData.length) {
        const c2 = ensureWrap("chart-by-month", "COVID Vaccine Reports of Death by Month");
        drawBar(c2, monthLabels, monthData, {
          datasetLabel: "Deaths",
          tooltipLabelPrefix: ""
        });
      }

      // ---- Chart 3: Deaths by Year
      // Expected objects: { label: "2021", count: number }
      const yearLabels = byYear.map((d) => String(d.label ?? ""));
      const yearData = byYear.map((d) => Number(d.count || 0));

      if (yearLabels.length && yearData.length) {
        const c3 = ensureWrap("chart-by-year", "All Deaths Reported to VAERS by Year");
        drawBar(c3, yearLabels, yearData, {
          datasetLabel: "Deaths",
          tooltipLabelPrefix: ""
        });
      }
    })
    .catch((err) => {
      console.error("[vaers-charts] failed to load or render charts:", err);
    });
})();
