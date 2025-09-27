/* public/assets/js/vaers-charts.js
 * Renders three charts (year, month, onset) using Chart.js.
 * Data source order:
 *   1) window.VAERS_SUMMARY_URL (if set),
 *   2) <section id="vaers-charts-section" data-summary="...">,
 *   3) /data/vaers-summary-openvaers.json,
 *   4) /data/vaers-summary.json
 *
 * JSON tolerated shapes:
 *   - { by_year_series: [{label, count}], by_month_series: [...], onset_series: [...] }
 *   - or maps: { "2021": 123, ... }
 */

(function () {
  function pickUrl() {
    const sec = document.getElementById("vaers-charts-section");
    return (
      (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
      (sec && sec.getAttribute("data-summary")) ||
      "/data/vaers-summary-openvaers.json"
    );
  }

  async function fetchJson(urls) {
    const tried = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
        tried.push(`${u} [${r.status}]`);
      } catch (e) {
        tried.push(`${u} [${e}]`);
      }
    }
    throw new Error("All data sources failed:\n" + tried.join("\n"));
  }

  function normalizeSeries(v) {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v.map((x) => ({
        label: x.label ?? String(x[0]),
        count: Number(x.count ?? x[1] ?? x.value ?? 0),
      }));
    }
    // object map -> array
    return Object.entries(v).map(([label, count]) => ({
      label,
      count: Number(count || 0),
    }));
  }

  function theme() {
    const css = getComputedStyle(document.documentElement);
    const primary =
      css.getPropertyValue("--brand").trim() ||
      css.getPropertyValue("--color-primary").trim() ||
      "#0ea5e9";
    const accent =
      css.getPropertyValue("--brand-accent").trim() || "#10b981";
    const grid = "#e5e7eb";
    const text =
      css.getPropertyValue("--text-color").trim() || "#111827";
    return { primary, accent, grid, text };
  }

  function fmt(n) {
    return Number(n).toLocaleString(undefined);
  }

  function mountBar(ctx, labels, values, opts) {
    const { primary, grid, text } = theme();
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Deaths",
            data: values,
            backgroundColor: primary,
            borderColor: primary,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false, labels: { color: text } },
          tooltip: {
            callbacks: {
              label: (c) => `Deaths: ${fmt(c.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: text, maxRotation: opts?.rotate || 0, minRotation: opts?.rotate || 0 },
            grid: { color: grid },
          },
          y: {
            beginAtZero: true,
            ticks: { color: text, callback: (v) => fmt(v) },
            grid: { color: grid },
          },
        },
      },
    });
  }

  function mountLine(ctx, labels, values) {
    const { primary, grid, text } = theme();
    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Deaths",
            data: values,
            borderColor: primary,
            backgroundColor: primary + "22",
            fill: true,
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false, labels: { color: text } },
          tooltip: {
            callbacks: { label: (c) => `Deaths: ${fmt(c.parsed.y)}` },
          },
          zoom: false, // you can add chartjs-plugin-zoom later if wanted
        },
        scales: {
          x: {
            ticks: { color: text, maxRotation: 45, minRotation: 45 },
            grid: { color: grid },
          },
          y: {
            beginAtZero: true,
            ticks: { color: text, callback: (v) => fmt(v) },
            grid: { color: grid },
          },
        },
      },
    });
  }

  async function init() {
    const primaryUrl = pickUrl();
    const data = await fetchJson([
      primaryUrl,
      "/data/vaers-summary-openvaers.json",
      "/data/vaers-summary.json",
    ]);

    const byYear = normalizeSeries(
      data.by_year_series || data.deaths_by_year
    ).sort((a, b) => Number(a.label) - Number(b.label));

    const byMonth = normalizeSeries(
      data.by_month_series || data.deaths_by_month
    ).sort((a, b) => String(a.label).localeCompare(String(b.label)));

    const onset = normalizeSeries(
      data.onset_series || data.onset_hist_series || data.onset
    ).sort((a, b) => Number(a.label) - Number(b.label));

    // mount charts (requires canvases to exist)
    const cYear = document.getElementById("chart-by-year");
    const cMonth = document.getElementById("chart-by-month");
    const cOnset = document.getElementById("chart-onset");

    if (cYear && byYear.length) {
      mountBar(
        cYear.getContext("2d"),
        byYear.map((d) => String(d.label)),
        byYear.map((d) => d.count)
      );
    }

    if (cMonth && byMonth.length) {
      mountLine(
        cMonth.getContext("2d"),
        byMonth.map((d) => String(d.label)),
        byMonth.map((d) => d.count)
      );
    }

    if (cOnset && onset.length) {
      mountBar(
        cOnset.getContext("2d"),
        onset.map((d) => String(d.label)),
        onset.map((d) => d.count),
        { rotate: 0 }
      );
    }
  }

  // if this script is deferred (it is), DOM is ready
  init().catch((e) => {
    console.error("[vaers-charts] failed to initialize:", e);
    for (const id of ["chart-by-year", "chart-by-month", "chart-onset"]) {
      const el = document.getElementById(id);
      if (el) {
        const msg = document.createElement("div");
        msg.style.color = "#b91c1c";
        msg.style.padding = "8px 0";
        msg.textContent = "Failed to load chart data.";
        el.replaceWith(msg);
      }
    }
  });
})();
