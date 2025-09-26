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

  // ---- helpers ----
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
      const month = p?.[0];
      const v = num(p?.[1]);
      if (!month) continue;
      const y = String(month).slice(0, 4);
      map.set(y, (map.get(y) || 0) + v);
    }
    const years = Array.from(map.keys()).sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // ============ FIX 1: full-year bars =============
  // Use all years from reports_by_year.all and derive non-COVID = all - covidByYear
  function buildByYearSeries(summary) {
    const allPairs = summary?.reports_by_year?.all || [];
    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];

    const ALL = fromPairs(allPairs); // 1990..present
    const COVID = aggregateYearTotals(covidMonthPairs); // 2020..present

    // Align covid series to the ALL year list
    const covidMap = new Map(COVID.labels.map((y, i) => [y, COVID.values[i]]));
    const covidValsAligned = ALL.labels.map((y) => covidMap.get(y) || 0);
    const nonCovidVals = ALL.values.map((v, i) => Math.max(0, v - covidValsAligned[i]));

    return { labels: ALL.labels, primary: covidValsAligned, nonCovid: nonCovidVals };
  }

  // ============ FIX 2: strict 0..19 + explicit "20+" bucket ============
  function buildDaysToOnset(summary) {
    const covidPairs = summary?.deaths_days_to_onset?.covid || [];
    const fluPairs   = summary?.deaths_days_to_onset?.flu   || [];

    const mkSeries = (pairs) => {
      const arr = new Array(21).fill(0); // 0..19 and index 20 => "20+"
      for (const [label, value] of pairs || []) {
        const raw = String(label).trim();
        const d = Number(raw);
        if (Number.isInteger(d) && d >= 0 && d <= 19) {
          arr[d] = num(value);
        } else {
          // non-numeric or >=20 => accumulate into "20+"
          arr[20] += num(value);
        }
      }
      return arr;
    };

    const covid = mkSeries(covidPairs);
    const flu = mkSeries(fluPairs);
    const labels = [...Array(20).keys()].map(String).concat("20+");

    return { labels, covid, flu };
  }

  // ---- charts ----
  function renderByYear(el, series) {
    const dom = $(el); if (!dom) return;
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 4 },
      grid: { left: 60, right: 20, bottom: 60, top: 36 },
      xAxis: {
        type: "category",
        name: "Received Year",
        nameLocation: "middle",
        nameGap: 36,
        data: series.labels,
        axisLabel: { color: THEME.ink, rotate: 45, interval: 0, fontSize: 10 },
        axisLine: { lineStyle: { color: THEME.axis } }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Reports of Death",            type: "bar", barMaxWidth: 16, data: series.primary, itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", barMaxWidth: 16, data: series.nonCovid, itemStyle: { color: THEME.secondary } }
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
      legend: { top: 4 },
      grid: { left: 60, right: 20, bottom: 50, top: 36 },
      xAxis: {
        type: "category",
        name: "Received Month",
        nameLocation: "middle",
        nameGap: 32,
        data: total.labels,
        axisLabel: { color: THEME.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: THEME.axis } }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Total",          type: "line", smooth: 0.2, symbolSize: 2, data: total.values,   lineStyle: { color: THEME.primary } },
        { name: "US/Territories", type: "line", smooth: 0.2, symbolSize: 2, data: us.values,      lineStyle: { color: THEME.accent } },
        { name: "Foreign*",       type: "line", smooth: 0.2, symbolSize: 2, data: foreign.values, lineStyle: { color: THEME.secondary } }
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
      legend: { top: 4 },
      grid: { left: 60, right: 20, bottom: 50, top: 36 },
      xAxis: {
        type: "category",
        name: "Days to Onset",
        nameLocation: "middle",
        nameGap: 32,
        data: series.labels, // "0".."19","20+"
        axisLabel: { color: THEME.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: THEME.axis } }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() }
      },
      series: [
        { name: "Covid Vaccines", type: "bar", barMaxWidth: 18, data: series.covid, itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines",   type: "bar", barMaxWidth: 18, data: series.flu,   itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  // ---- bootstrap ----
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureECharts();
      const summary = await loadSummary();

      renderByYear("#chartDeathsByYear", buildByYearSeries(summary));
      renderCovidByMonth("#chartCovidDeathsByMonth", summary);
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
