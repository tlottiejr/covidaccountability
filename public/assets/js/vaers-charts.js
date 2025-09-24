// public/assets/js/vaers-charts.js
// Render 3 charts from /data/vaers-summary.json with robust shape handling.

(() => {
  // ---- readiness helpers ----
  const domReady = new Promise((res) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", res, { once: true });
    else res();
  });

  function cssTheme() {
    const s = getComputedStyle(document.documentElement);
    return {
      ink:    s.getPropertyValue("--ink")?.trim() || "#0b1d2a",
      accent: s.getPropertyValue("--accent")?.trim() || "#1d6fbd",
      muted:  s.getPropertyValue("--muted-ink")?.trim() || "#6b7280",
      grid:   s.getPropertyValue("--rule")?.trim() || "#e5e7eb",
    };
  }

  function init(el) {
    if (!el || !window.echarts) return null;
    return echarts.init(el, null, { renderer: "canvas" });
  }

  function hookResize(charts) {
    const fn = () => charts.forEach((c) => c && c.resize({ animation: { duration: 0 } }));
    window.addEventListener("resize", fn);
    document.addEventListener("visibilitychange", fn);
  }

  // ---- normalizers for multiple JSON shapes ----

  // reports_by_year: either
  //   [{year, all, us_territories_unknown}, ...]
  // or
  //   {"1990": {all: N, us_territories_unknown: M}, ...}
  function normalizeReportsByYear(src) {
    let list = [];
    if (Array.isArray(src)) {
      list = src;
    } else if (src && typeof src === "object") {
      list = Object.entries(src).map(([y, v]) => ({
        year: Number(y),
        all:  Number(v?.all ?? v?.a ?? v?.[0] ?? 0),
        us:   Number(v?.us_territories_unknown ?? v?.us ?? v?.u ?? v?.[1] ?? 0),
      }));
    }
    return list
      .filter((x) => x && x.year != null)
      .map((x) => ({ year: Number(x.year), all: Number(x.all ?? 0), us: Number(x.us ?? 0) }))
      .sort((a, b) => a.year - b.year);
  }

  // covid_deaths_by_month (or deaths_by_month): object like
  //   { months:[], total:[], domestic:[]|us_territories_unknown:[], foreign:[] }
  // We also accept array-of-tuples [[month, total, dom, foreign], ...]
  function normalizeDeathsByMonth(src = {}) {
    if (Array.isArray(src)) {
      const months = src.map((r) => String(r[0]));
      const total  = src.map((r) => Number(r[1] ?? 0));
      const dom    = src.map((r) => Number(r[2] ?? 0));
      const forgn  = src.map((r) => Number(r[3] ?? 0));
      return { months, total, dom, forgn };
    }
    const months = src.months || src.labels || [];
    const total  = src.total  || src.t || [];
    const dom    = src.domestic || src.us_territories_unknown || src.us || [];
    const forgn  = src.foreign  || src.f || [];
    return { months, total, dom, forgn };
  }

  // deaths_days_to_onset (or days_to_onset): { buckets:[], covid:[], flu:[] }
  // Also accept array-of-tuples [[bucket, covid, flu], ...]
  function normalizeDaysToOnset(src = {}) {
    if (Array.isArray(src)) {
      const buckets = src.map((r) => String(r[0]));
      const covid   = src.map((r) => Number(r[1] ?? 0));
      const flu     = src.map((r) => Number(r[2] ?? 0));
      return { buckets, covid, flu };
    }
    const buckets = src.buckets || src.labels || [];
    const covid   = src.covid || src.c || [];
    const flu     = src.flu   || src.f || [];
    return { buckets, covid, flu };
  }

  // ---- main ----
  async function run() {
    await domReady;

    const byYearEl  = document.getElementById("vaers-by-year");
    const monthEl   = document.getElementById("vaers-covid-deaths-monthly");
    const onsetEl   = document.getElementById("vaers-days-to-onset");
    const asOfEl    = document.getElementById("vaers-asof");
    if (!byYearEl || !monthEl || !onsetEl) return;

    // Ensure ECharts is present (CDN script should have loaded with defer)
    if (!window.echarts) {
      console.error("ECharts not found on window.");
      if (asOfEl) asOfEl.textContent = "Charts unavailable.";
      return;
    }

    let data;
    try {
      const res = await fetch("/data/vaers-summary.json", { cache: "no-cache" });
      data = await res.json();
    } catch (e) {
      console.error("Failed to load VAERS JSON", e);
      if (asOfEl) asOfEl.textContent = "Could not load VAERS data.";
      return;
    }

    if (asOfEl && data?.as_of) asOfEl.textContent = `As of ${data.as_of}`;

    const colors = cssTheme();
    const charts = [];

    // Chart 1 — All Reports to VAERS by Year
    try {
      const chart = init(byYearEl);
      const rows = normalizeReportsByYear(data?.reports_by_year);
      chart && chart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: { data: ["All Reports", "US/Terr/Unknown"], top: 0, textStyle: { color: colors.muted } },
        xAxis: { type: "category", data: rows.map(r => r.year), axisLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted } },
        yAxis: { type: "value", axisLine: { lineStyle: { color: colors.grid } }, splitLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted } },
        series: [
          { name: "All Reports",     type: "line", smooth: true, data: rows.map(r => r.all), lineStyle: { width: 3 }, color: colors.accent },
          { name: "US/Terr/Unknown", type: "line", smooth: true, data: rows.map(r => r.us),  lineStyle: { width: 3 }, color: colors.ink }
        ]
      });
      charts.push(chart);
    } catch (e) { console.error("Chart 1 failed", e); }

    // Chart 2 — COVID Vaccine Reports of Death by Month
    try {
      const chart = init(monthEl);
      const src = data?.covid_deaths_by_month || data?.deaths_by_month || {};
      const m = normalizeDeathsByMonth(src);
      chart && chart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: { data: ["Total", "US/Terr/Unknown", "Foreign"], top: 0, textStyle: { color: colors.muted } },
        xAxis: { type: "category", data: m.months, axisLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted, hideOverlap: true } },
        yAxis: { type: "value", axisLine: { lineStyle: { color: colors.grid } }, splitLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted } },
        series: [
          { name: "Total",             type: "line", smooth: true, data: m.total, lineStyle: { width: 3 }, color: colors.accent },
          { name: "US/Terr/Unknown",   type: "line", smooth: true, data: m.dom,   lineStyle: { width: 3 }, color: colors.ink },
          { name: "Foreign",           type: "line", smooth: true, data: m.forgn, lineStyle: { width: 3 }, color: "#888" }
        ]
      });
      charts.push(chart);
    } catch (e) { console.error("Chart 2 failed", e); }

    // Chart 3 — Deaths by Days to Onset (COVID vs Flu)
    try {
      const chart = init(onsetEl);
      const o = normalizeDaysToOnset(data?.deaths_days_to_onset || data?.days_to_onset || {});
      chart && chart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: { data: ["COVID-19", "Flu"], top: 0, textStyle: { color: colors.muted } },
        xAxis: { type: "category", data: o.buckets, axisLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted } },
        yAxis: { type: "value", axisLine: { lineStyle: { color: colors.grid } }, splitLine: { lineStyle: { color: colors.grid } }, axisLabel: { color: colors.muted } },
        series: [
          { name: "COVID-19", type: "bar", data: o.covid, color: colors.accent },
          { name: "Flu",      type: "bar", data: o.flu,   color: colors.ink }
        ]
      });
      charts.push(chart);
    } catch (e) { console.error("Chart 3 failed", e); }

    hookResize(charts);
  }

  run();
})();
