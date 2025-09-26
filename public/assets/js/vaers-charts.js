// public/assets/js/vaers-charts.js
(function () {
  // ---- Theme: blue/white ----
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    sub: "#334155",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",   // strong blue
    secondary:"#60a5fa",   // light blue
    accent:   "#38bdf8"    // cyan
  };

  const $ = (s) => document.querySelector(s);

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

  // ---- helpers for your JSON shape ----
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);

  // pairs: [ [label,value], ... ] -> {labels:[], values:[]}
  function fromPairs(pairs = []) {
    const labels = [];
    const values = [];
    for (const pair of pairs || []) {
      if (!pair || pair.length < 2) continue;
      labels.push(String(pair[0]));
      values.push(num(pair[1]));
    }
    return { labels, values };
  }

  // aggregate `YYYY-MM` pairs into per-year totals
  function aggregateYearTotals(monthPairs = []) {
    const map = new Map();
    for (const [month, v] of monthPairs || []) {
      if (!month) continue;
      const y = String(month).slice(0, 4);
      map.set(y, (map.get(y) || 0) + num(v));
    }
    const years = Array.from(map.keys()).sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // ---- charts ----
  function renderByYear(el, covidByMonthPairs, nonCovidByYearPairs) {
    const dom = $(el);
    if (!dom) return;

    // Primary: COVID deaths by year (from monthly totals)
    const covidYear = aggregateYearTotals(covidByMonthPairs);

    // Secondary (optional): if you ever add per-year non-COVID deaths.
    let secondSeries = null;
    if (Array.isArray(nonCovidByYearPairs) && nonCovidByYearPairs.length) {
      const nc = fromPairs(nonCovidByYearPairs);
      // align to same label ordering as primary
      const map = new Map(nc.labels.map((l, i) => [l, nc.values[i]]));
      secondSeries = covidYear.labels.map((y) => map.get(y) || 0);
    }

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
        data: covidYear.labels,
        axisLine: { lineStyle: { color: THEME.axis } },
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Reports of Death", type: "bar", data: covidYear.values, itemStyle: { color: THEME.primary } },
      ]
    };
    if (secondSeries) {
      option.series.push({
        name: "All Non COVID-Vaccine Deaths",
        type: "bar",
        data: secondSeries,
        itemStyle: { color: THEME.secondary }
      });
    }
    ec.setOption(option);
    window.addEventListener("resize", () => ec.resize());
  }

  function renderCovidByMonth(el, totalPairs, usPairs, foreignPairs) {
    const dom = $(el);
    if (!dom) return;

    const total   = fromPairs(totalPairs);
    const us      = fromPairs(usPairs);
    const foreign = fromPairs(foreignPairs);

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: {
        type: "category",
        name: "Received Month",
        nameLocation: "middle",
        nameGap: 28,
        data: total.labels,
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Total",            type: "line", smooth: 0.2, symbolSize: 3, data: total.values,   lineStyle: { color: THEME.primary } },
        { name: "US/Territories",   type: "line", smooth: 0.2, symbolSize: 3, data: us.values,      lineStyle: { color: THEME.accent  } },
        { name: "Foreign*",         type: "line", smooth: 0.2, symbolSize: 3, data: foreign.values, lineStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderDaysToOnset(el, covidPairs, fluPairs) {
    const dom = $(el);
    if (!dom) return;

    const covid = fromPairs(covidPairs);
    const flu   = fromPairs(fluPairs);

    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: {
        type: "category",
        name: "Days to Onset",
        nameLocation: "middle",
        nameGap: 28,
        data: covid.labels, // both share labels [0..19]
        axisLabel: { color: THEME.ink }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 40,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Covid Vaccines", type: "bar", data: covid.values, itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines",   type: "bar", data: flu.values,   itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  // ---- bootstrap ----
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureECharts();
      const d = await loadSummary();

      // 1) By year: build from monthly totals (covid deaths)
      const month = d.covid_deaths_by_month || {};
      renderByYear("#chartDeathsByYear",
                   month.total || [],
                   /* non-covid per year (optional) */ null);

      // 2) COVID deaths by month (total/us/foreign)
      renderCovidByMonth("#chartCovidDeathsByMonth",
                         month.total || [],
                         month.us_terr_unk || [],
                         month.foreign || []);

      // 3) Days to onset (covid vs flu)
      const d2o = d.deaths_days_to_onset || {};
      renderDaysToOnset("#chartDaysToOnset", d2o.covid || [], d2o.flu || []);
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
