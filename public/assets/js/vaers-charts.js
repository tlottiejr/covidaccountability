// public/assets/js/vaers-charts.js

(function () {
  // ---- Theme: blue/white (no red) ----
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    sub: "#334155",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb", // strong blue
    secondary:"#60a5fa", // light blue
    accent:   "#38bdf8"  // cyan-ish
  };

  // ---- Helpers ----
  const $ = (sel) => document.querySelector(sel);

  function waitForECharts(timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      (function poll() {
        if (window.echarts && typeof window.echarts.init === "function") return resolve(window.echarts);
        if (performance.now() - start > timeoutMs) return reject(new Error("ECharts not loaded"));
        requestAnimationFrame(poll);
      })();
    });
  }

  async function loadSummaryJSON() {
    const host = $("#vaers-charts-section");
    if (!host) throw new Error("#vaers-charts-section not found");
    const url = host.getAttribute("data-summary") || "/data/vaers-summary.json";
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  function numberFmt(n) {
    const v = typeof n === "number" ? n : Number(n || 0);
    return v.toLocaleString();
  }

  // ---- Chart builders ----
  function renderByYear(el, data) {
    const dom = $(el);
    if (!dom) return;

    // Accept schema variants:
    // A) { labels: [...], totalDeaths: [...], nonCovidDeaths: [...] }
    // B) { years: [...], deaths: [...], nonCovid: [...] }
    // C) { byYear: { labels, total, nonCovid } }
    let labels = data.labels || data.years || data?.byYear?.labels || [];
    let total  = data.totalDeaths || data.deaths || data?.byYear?.total || [];
    let noncvd = data.nonCovidDeaths || data.nonCovid || data?.byYear?.nonCovid || [];

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    const option = {
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: {
        type: "category",
        name: "Received Year",
        nameLocation: "middle",
        nameGap: 28,
        data: labels,
        axisLine: { lineStyle: { color: THEME.axis } },
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        axisLine: { lineStyle: { color: THEME.axis } },
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => numberFmt(v) }
      },
      series: [
        { name: "Reports of Death", type: "bar", data: total, itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", data: noncvd, itemStyle: { color: THEME.secondary } }
      ]
    };
    ec.setOption(option);
    window.addEventListener("resize", () => ec.resize());
  }

  function renderCovidByMonth(el, data) {
    const dom = $(el);
    if (!dom) return;

    // Accept variants:
    // { labels, total, us, foreign } or { months, total, usa, foreign }
    const labels = data.labels || data.months || data?.covidByMonth?.labels || [];
    const total  = data.total || data?.covidByMonth?.total || [];
    const us     = data.us || data.usa || data?.covidByMonth?.us || [];
    const foreign= data.foreign || data?.covidByMonth?.foreign || [];

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    const option = {
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: {
        type: "category",
        name: "Received Month",
        nameLocation: "middle",
        nameGap: 28,
        data: labels,
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => numberFmt(v) }
      },
      series: [
        { name: "Total",   type: "line", data: total,   symbolSize: 3, smooth: 0.2, lineStyle: { color: THEME.primary } },
        { name: "US/Territories", type: "line", data: us, symbolSize: 3, smooth: 0.2, lineStyle: { color: THEME.accent } },
        { name: "Foreign*", type: "line", data: foreign, symbolSize: 3, smooth: 0.2, lineStyle: { color: THEME.secondary } }
      ]
    };
    ec.setOption(option);
    window.addEventListener("resize", () => ec.resize());
  }

  function renderDaysToOnset(el, data) {
    const dom = $(el);
    if (!dom) return;

    // Accept variants:
    // { labels, covid, flu } or { days, covid, flu } or nested { daysToOnset: {...} }
    const labels = data.labels || data.days || data?.daysToOnset?.labels || [];
    const covid  = data.covid  || data?.daysToOnset?.covid || [];
    const flu    = data.flu    || data?.daysToOnset?.flu   || [];

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    const option = {
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: {
        type: "category",
        name: "Days to Onset",
        nameLocation: "middle",
        nameGap: 28,
        data: labels,
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => numberFmt(v) }
      },
      series: [
        { name: "Covid Vaccines", type: "bar", data: covid,  itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines",   type: "bar", data: flu,    itemStyle: { color: THEME.secondary } }
      ]
    };
    ec.setOption(option);
    window.addEventListener("resize", () => ec.resize());
  }

  // ---- Bootstrap ----
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await waitForECharts();               // ensure echarts is ready
      const summary = await loadSummaryJSON();

      // The summary file can either be flat series or nested; normalize light-handedly:
      const byYearData    = summary.byYear    || summary.by_year    || summary.deathsByYear    || summary;
      const covidMonthData= summary.covidByMonth || summary.covid_monthly || summary.deathsByMonth || summary;
      const d2oData       = summary.daysToOnset || summary.days_to_onset || summary;

      renderByYear("#chartDeathsByYear", byYearData);
      renderCovidByMonth("#chartCovidDeathsByMonth", covidMonthData);
      renderDaysToOnset("#chartDaysToOnset", d2oData);
    } catch (err) {
      console.error("VAERS charts failed:", err);
      // show a friendly message instead of blank cards
      ["#chartDeathsByYear","#chartCovidDeathsByMonth","#chartDaysToOnset"].forEach(sel => {
        const el = $(sel);
        if (!el) return;
        const msg = document.createElement("div");
        msg.style.padding = "1rem";
        msg.textContent = "Charts temporarily unavailable.";
        el.appendChild(msg);
      });
    }
  });
})();
