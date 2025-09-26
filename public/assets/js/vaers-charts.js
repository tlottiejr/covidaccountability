// public/assets/js/vaers-charts.js
(function () {
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    sub: "#334155",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",
    secondary:"#60a5fa",
    accent:   "#38bdf8"
  };

  const $ = (s) => document.querySelector(s);
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);

  function ensureECharts(timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      (function tick() {
        if (window.echarts && typeof echarts.init === "function") return resolve(echarts);
        if (performance.now() - t0 > timeoutMs) return reject(new Error("ECharts not loaded"));
        requestAnimationFrame(tick);
      })();
    });
  }

  async function loadSummary() {
    const root = $("#vaers-charts-section");
    const url = root?.dataset.summary || "/data/vaers-summary.json";
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  // ---- helpers for pair arrays ----
  function fromPairs(pairs = []) {
    const labels = [];
    const values = [];
    for (const p of pairs || []) {
      if (!p || p.length < 2) continue;
      labels.push(String(p[0]));
      values.push(num(p[1]));
    }
    return { labels, values };
  }

  function aggregateYearTotals(monthPairs = []) {
    const map = new Map();
    for (const p of monthPairs || []) {
      const m = p?.[0]; const v = num(p?.[1]);
      if (!m) continue;
      const y = String(m).slice(0, 4);
      map.set(y, (map.get(y) || 0) + v);
    }
    const years = Array.from(map.keys()).sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // NEW: build full-year bars from reports_by_year.all, plus optional non-COVID
  function buildByYearSeries(summary) {
    const allPairs = summary?.reports_by_year?.all || [];
    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];

    // primary from all years (1990→present)
    const ALL = fromPairs(allPairs);
    // covid per year (2020→present)
    const COVID = aggregateYearTotals(covidMonthPairs);

    // align arrays by the ALL.x labels
    const covidMap = new Map(COVID.labels.map((y, i) => [y, COVID.values[i]]));
    const covidValsAligned = ALL.labels.map((y) => covidMap.get(y) || 0);

    // non-covid derived
    const nonCovidVals = ALL.values.map((v, i) => Math.max(0, v - covidValsAligned[i]));

    return {
      labels: ALL.labels,
      primary: covidValsAligned,   // "Reports of Death" (COVID vaccine)
      nonCovid: nonCovidVals       // "All Non COVID-Vaccine Deaths"
    };
  }

  // NEW: strictly map days 0..19, ignore non-numeric buckets
  function buildDaysToOnset(summary) {
    const covidPairs = summary?.deaths_days_to_onset?.covid || [];
    const fluPairs   = summary?.deaths_days_to_onset?.flu   || [];

    const mkSeries = (pairs) => {
      const arr = new Array(20).fill(0);
      for (const [label, value] of pairs || []) {
        const d = Number(label);
        if (Number.isInteger(d) && d >= 0 && d <= 19) arr[d] = num(value);
      }
      return arr;
    };

    return {
      labels: Array.from({ length: 20 }, (_, i) => String(i)),
      covid: mkSeries(covidPairs),
      flu:   mkSeries(fluPairs)
    };
  }

  // ---- charts ----
  function renderByYear(el, series) {
    const dom = $(el); if (!dom) return;
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Received Year", nameLocation: "middle", nameGap: 28,
               data: series.labels, axisLine: { lineStyle: { color: THEME.axis } }, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() } },
      series: [
        { name: "Reports of Death",            type: "bar", data: series.primary, itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", data: series.nonCovid, itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderCovidByMonth(el, summary) {
    const dom = $(el); if (!dom) return;
    const month = summary?.covid_deaths_by_month || {};
    const total   = fromPairs(month.total || []);
    const us      = fromPairs(month.us_terr_unk || []);
    const foreign = fromPairs(month.foreign || []);

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Received Month", nameLocation: "middle", nameGap: 28,
               data: total.labels, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() } },
      series: [
        { name: "Total",          type: "line", smooth: 0.2, symbolSize: 3, data: total.values,   lineStyle: { color: THEME.primary } },
        { name: "US/Territories", type: "line", smooth: 0.2, symbolSize: 3, data: us.values,      lineStyle: { color: THEME.accent } },
        { name: "Foreign*",       type: "line", smooth: 0.2, symbolSize: 3, data: foreign.values, lineStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderDaysToOnset(el, series) {
    const dom = $(el); if (!dom) return;
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Days to Onset", nameLocation: "middle", nameGap: 28,
               data: series.labels, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() } },
      series: [
        { name: "Covid Vaccines", type: "bar", data: series.covid, itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines",   type: "bar", data: series.flu,   itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  // ---- bootstrap ----
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureECharts();
      const summary = await loadSummary();

      // 1) All years (primary = covid by year, secondary = derived non-covid)
      renderByYear("#chartDeathsByYear", buildByYearSeries(summary));

      // 2) Monthly
      renderCovidByMonth("#chartCovidDeathsByMonth", summary);

      // 3) Days to onset (strict 0..19 only)
      renderDaysToOnset("#chartDaysToOnset", buildDaysToOnset(summary));
    } catch (err) {
      console.error("VAERS charts failed:", err);
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
