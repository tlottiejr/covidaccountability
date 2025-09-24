// public/assets/js/vaers-charts.js
// Renders the 3 charts from /data/vaers-summary.json using ECharts.
// - Matches site theme via CSS variables (no hardcoded palette)
// - Resizes on window/visibility changes
// - Tolerant of slightly different JSON shapes from the builder

(() => {
  // ----- readiness helpers -----
  const domReady = new Promise((res) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => res(), { once: true });
    } else {
      res();
    }
  });

  const echartsReady = () =>
    new Promise((res) => {
      if (window.echarts) return res();
      const t = setInterval(() => {
        if (window.echarts) { clearInterval(t); res(); }
      }, 30);
    });

  // ----- theme helpers -----
  function theme() {
    const r = getComputedStyle(document.documentElement);
    // fallbacks keep things readable if a var is missing
    const ink    = r.getPropertyValue("--ink")?.trim() || "#0b1d2a";
    const accent = r.getPropertyValue("--accent")?.trim() || "#1d6fbd";
    const muted  = r.getPropertyValue("--muted-ink")?.trim() || "#6b7280";
    const grid   = r.getPropertyValue("--rule")?.trim() || "#e5e7eb";
    return { ink, accent, muted, grid };
  }

  function mount(el) {
    if (!el) return null;
    return echarts.init(el, null, { renderer: "canvas" });
  }

  function listenResize(instances) {
    const doResize = () => instances.forEach((c) => c && c.resize({ animation: { duration: 0 } }));
    window.addEventListener("resize", doResize);
    document.addEventListener("visibilitychange", doResize);
  }

    // Some builders may emit keys in slightly different names.
    // These helpers normalize common shapes.
    function normalizeReportsByYear(src) {
    // Accept either an array of rows or an object keyed by year
    let list;
    if (Array.isArray(src)) {
      list = src;
    } else if (src && typeof src === "object") {
      // Expect shapes like: { "1990": { all: N, us_territories_unknown: M } , ... }
      list = Object.entries(src).map(([year, v]) => ({
        year: Number(year),
        all:  Number(v?.all ?? v?.a ?? v?.[0] ?? 0),
        us:   Number(v?.us_territories_unknown ?? v?.us ?? v?.u ?? v?.[1] ?? 0),
      }));
    } else {
      list = [];
    }
  
    return list
      .filter((x) => x && x.year != null)
      .map((x) => ({
        year: Number(x.year),
        all:  Number(x.all ?? 0),
        us:   Number(x.us  ?? 0),
      }))
      .sort((a, b) => a.year - b.year);
  }

  function normalizeCovidDeathsMonthly(obj = {}) {
    // expected shape:
    // { months: ["2021-01", ...], total: [], domestic: [], foreign: [] }
    // fallbacks: us_territories_unknown -> domestic
    const months = obj.months || obj.labels || [];
    const total  = obj.total  || obj.t || [];
    const dom    = obj.domestic || obj.us_territories_unknown || obj.us || [];
    const forgn  = obj.foreign  || obj.f || [];
    return { months, total, dom, forgn };
  }

  function normalizeDaysToOnset(obj = {}) {
    // expected shape:
    // { buckets: ["0","1",...,"19"], covid: [], flu: [] }
    const buckets = obj.buckets || obj.labels || [];
    const covid   = obj.covid || obj.c || [];
    const flu     = obj.flu   || obj.f || [];
    return { buckets, covid, flu };
  }

  async function run() {
    await domReady;
    await echartsReady();

    const byYearEl       = document.getElementById("vaers-by-year");
    const deathsMonthEl  = document.getElementById("vaers-covid-deaths-monthly");
    const onsetEl        = document.getElementById("vaers-days-to-onset");
    const asofEl         = document.getElementById("vaers-asof");

    if (!byYearEl || !deathsMonthEl || !onsetEl) return;

    let json;
    try {
      const res = await fetch("/data/vaers-summary.json", { cache: "no-cache" });
      json = await res.json();
    } catch (e) {
      console.error("VAERS: failed to fetch JSON", e);
      if (asofEl) asofEl.textContent = "Could not load VAERS data.";
      return;
    }

    if (asofEl && json?.as_of) asofEl.textContent = `As of ${json.as_of}`;

    const colors = theme();

    // ===== Chart 1: All Reports to VAERS by Year =====
    const byYear = normalizeReportsByYear(json?.reports_by_year);
    const byYearChart = mount(byYearEl);
    if (byYearChart && byYear.length) {
      const years = byYear.map((d) => d.year);
      const all   = byYear.map((d) => d.all);
      const us    = byYear.map((d) => d.us);

      byYearChart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: {
          data: ["All Reports", "US/Terr/Unknown"],
          top: 0,
          textStyle: { color: colors.muted }
        },
        xAxis: {
          type: "category",
          data: years,
          axisLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        series: [
          { name: "All Reports", type: "line", smooth: true, data: all, lineStyle: { width: 3 }, color: colors.accent },
          { name: "US/Terr/Unknown", type: "line", smooth: true, data: us,  lineStyle: { width: 3 }, color: colors.ink }
        ]
      });
    }

    // ===== Chart 2: COVID Vaccine Reports of Death by Month =====
    const deathsMonthly = normalizeCovidDeathsMonthly(json?.covid_deaths_by_month || json?.deaths_by_month);
    const deathsMonthlyChart = mount(deathsMonthEl);
    if (deathsMonthlyChart && deathsMonthly.months?.length) {
      deathsMonthlyChart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: {
          data: ["Total", "US/Terr/Unknown", "Foreign"],
          top: 0,
          textStyle: { color: colors.muted }
        },
        xAxis: {
          type: "category",
          data: deathsMonthly.months,
          axisLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted, hideOverlap: true }
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        series: [
          { name: "Total",             type: "line", smooth: true, data: deathsMonthly.total, lineStyle: { width: 3 }, color: colors.accent },
          { name: "US/Terr/Unknown",   type: "line", smooth: true, data: deathsMonthly.dom,   lineStyle: { width: 3 }, color: colors.ink },
          { name: "Foreign",           type: "line", smooth: true, data: deathsMonthly.forgn, lineStyle: { width: 3 }, color: "#888" }
        ]
      });
    }

    // ===== Chart 3: Deaths by Days to Onset (COVID vs Flu) =====
    const onset = normalizeDaysToOnset(json?.deaths_days_to_onset || json?.days_to_onset);
    const onsetChart = mount(onsetEl);
    if (onsetChart && onset.buckets?.length) {
      onsetChart.setOption({
        grid: { left: 44, right: 16, top: 30, bottom: 30 },
        tooltip: { trigger: "axis" },
        legend: {
          data: ["COVID-19", "Flu"],
          top: 0,
          textStyle: { color: colors.muted }
        },
        xAxis: {
          type: "category",
          data: onset.buckets,
          axisLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        yAxis: {
          type: "value",
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        series: [
          { name: "COVID-19", type: "bar", data: onset.covid, color: colors.accent },
          { name: "Flu",      type: "bar", data: onset.flu,   color: colors.ink }
        ]
      });
    }

    // Handle resizes
    listenResize([byYearChart, deathsMonthlyChart, onsetChart]);
  }

  run();
})();
