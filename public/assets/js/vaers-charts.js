/* public/assets/js/vaers-charts.js
 *
 * Mortality charts renderer (Year, Month, Days-to-Onset).
 * - Data URL: attribute (data-summary on #vaers-charts-section) → window.VAERS_SUMMARY_URL → default.
 * - Auto-loads Chart.js if missing.
 * - Defensive: if data arrays are empty/missing, shows a message instead of failing silently.
 * - Does NOT modify the table renderer.
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
    window.__VAERS_DATA_URL__ = DATA_URL; // for debugging
  } catch (_) {}

  // ---------- Small helpers
  const hasChartJS = () => typeof window !== "undefined" && !!window.Chart;

  function loadChartJS() {
    if (hasChartJS()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
      s.onload = () => resolve();
      s.onerror = (e) => reject(new Error("Failed to load Chart.js"));
      document.head.appendChild(s);
    });
  }

  function ensureWrap(id, titleText) {
    // main host section
    const host =
      document.getElementById("vaers-charts-section") ||
      document.body;

    // create wrapper card
    let wrap = document.getElementById(id + "-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = id + "-wrap";
      wrap.className = "chart-wrap"; // styled by your site CSS
      const beforeNode = document.getElementById("vaers-breakdowns");
      host.insertBefore(wrap, beforeNode || null);
    }

    // title
    let title = document.getElementById(id + "-title");
    if (!title) {
      title = document.createElement("h3");
      title.id = id + "-title";
      wrap.appendChild(title);
    }
    title.textContent = titleText || "";

    // canvas
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

  function showUnavailable(id, reason) {
    const wrap = document.getElementById(id + "-wrap");
    if (!wrap) return;
    // remove old note
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
    if (!hasChartJS()) return;
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
                const v = typeof ctx.parsed.y === "number" ? ctx.parsed.y.toLocaleString("en-US") : ctx.parsed.y;
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
      // Accept multiple possible keys (tolerant to older/newer JSONs)
      const onset = json.days_to_onset || json.covid_deaths_by_onset || [];
      const byMonth = json.covid_deaths_by_month || json.deaths_by_month || [];
      const byYear = json.covid_deaths_by_year || json.deaths_by_year || [];

      // Prepare containers first (so messages have somewhere to show)
      const cYear  = ensureWrap("chart-by-year",   "All Deaths Reported to VAERS by Year");
      const cMonth = ensureWrap("chart-by-month",  "COVID Vaccine Reports of Death by Month");
      const cOnset = ensureWrap("chart-onset",     "VAERS COVID/FLU Vaccine Reported Deaths by Days to Onset (All Ages)");

      // Normalize datasets
      const yearLabels = byYear.map((d) => String(d.label ?? d.year ?? ""));
      const yearData   = byYear.map((d) => Number(d.count || 0));

      const monthLabelsRaw = byMonth.map((d) => String(d.label ?? ""));
      const monthLabels = monthLabelsRaw.map(fmtMonth);
      const monthData   = byMonth.map((d) => Number(d.count || 0));

      const onsetLabels = onset.map((d) =>
        typeof d.day === "number" ? String(d.day) : String(d.label ?? "")
      );
      const onsetData   = onset.map((d) => Number(d.count || 0));

      // If arrays are empty, show a reason and bail
      let emptyAny = false;
      if (!yearLabels.length || !yearData.length) {
        showUnavailable("chart-by-year", "no data");
        emptyAny = true;
      }
      if (!monthLabels.length || !monthData.length) {
        showUnavailable("chart-by-month", "no data");
        emptyAny = true;
      }
      if (!onsetLabels.length || !onsetData.length) {
        showUnavailable("chart-onset", "no data");
        emptyAny = true;
      }

      // Load Chart.js (if needed), then draw
      return (emptyAny ? Promise.resolve() : loadChartJS())
        .then(() => {
          if (!emptyAny && hasChartJS()) {
            drawBar(cYear,  yearLabels,  yearData,  { datasetLabel: "Deaths" });
            drawBar(cMonth, monthLabels, monthData, { datasetLabel: "Deaths" });
            drawBar(cOnset, onsetLabels, onsetData, { datasetLabel: "Reports" });
          }
        });
    })
    .catch((err) => {
      console.error("[vaers-charts] failed to load or render charts:", err);
      // try to show a friendly message in all three spots
      ["chart-by-year", "chart-by-month", "chart-onset"].forEach((id) =>
        showUnavailable(id, "load error")
      );
    });
})();
