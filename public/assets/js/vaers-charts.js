// public/assets/js/vaers-charts.js
// Renders the 3 VAERS charts using your JSON summary.
// Fixes:
// 1) "By Year" now uses *deaths per year* from the JSON (not all reports).
//    Non-COVID deaths = (all deaths per year) − (COVID deaths per year).
// 2) Days-to-Onset bins: 0..19 with **19 = 19+** (everything >=19 and non-numeric).
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

  // --- helpers ---
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
      const m = p?.[0];
      const v = num(p?.[1]);
      if (!m) continue;
      const y = String(m).slice(0, 4);
      map.set(y, (map.get(y) || 0) + v);
    }
    const years = Array.from(map.keys()).sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // -------- BY YEAR (Deaths only) --------
  // Find "deaths per year" pairs in the summary, tolerant of key variants.
  function getDeathsByYearPairs(summary) {
    // Common shapes seen across your builds:
    //   reports_by_year_deaths.all -> [ ["1990", x], ... ]
    //   deaths_by_year.all         -> [ ["1990", x], ... ]
    //   deaths_by_year             -> [ ["1990", x], ... ]
    //   reports_by_year.deaths     -> [ ["1990", x], ... ]
    const candidates = [
      summary?.reports_by_year_deaths?.all,
      summary?.deaths_by_year?.all,
      summary?.deaths_by_year,
      summary?.reports_by_year?.deaths
    ];
    for (const c of candidates) if (Array.isArray(c) && c.length) return c;
    // Fallback: if only covid_deaths_by_month exists, aggregate it (will show 2020+ only).
    return null;
  }

  function buildByYearSeries(summary) {
    const deathsPairs = getDeathsByYearPairs(summary);
    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];

    // If we have per-year deaths from JSON, use them as "All Reports of Death".
    // Otherwise, derive totals from monthly (limited to 2020+).
    let ALL;
    if (deathsPairs) {
      ALL = fromPairs(deathsPairs); // 1990..present
    } else {
      // informational fallback (rare): derive from COVID monthly only
      const agg = aggregateYearTotals(covidMonthPairs);
      ALL = { labels: agg.labels, values: agg.values.slice() };
    }

    // COVID deaths per year from monthly totals
    const COVID = aggregateYearTotals(covidMonthPairs);
    const covidMap = new Map(COVID.labels.map((y, i) => [y, COVID.values[i]]));

    // Align arrays by ALL.x labels
    const covidValsAligned = ALL.labels.map((y) => covidMap.get(y) || 0);
    const nonCovidVals = ALL.values.map((v, i) => Math.max(0, v - covidValsAligned[i]));

    return { labels: ALL.labels, primary: ALL.values, nonCovid: nonCovidVals };
  }

  // -------- MONTHLY (COVID only) --------
  function getMonthlySeries(summary) {
    const month = summary?.covid_deaths_by_month || {};
    return {
      total:   fromPairs(month.total || []),
      us:      fromPairs(month.us_terr_unk || []),
      foreign: fromPairs(month.foreign || [])
    };
  }

  // -------- DAYS TO ONSET (0..19 with 19 = 19+) --------
  function buildDaysToOnset(summary) {
    const covidPairs = summary?.deaths_days_to_onset?.covid || [];
    const fluPairs   = summary?.deaths_days_to_onset?.flu   || [];

    const mkSeries = (pairs) => {
      // 0..19 with **19+** collapsed into index 19
      const arr = new Array(20).fill(0);
      for (const [label, value] of pairs || []) {
        const raw = String(label).trim();
        const d = Number(raw);
        if (Number.isInteger(d)) {
          const idx = d >= 19 ? 19 : d < 0 ? 0 : d;
          arr[idx] += num(value);
        } else {
          // non-numeric (e.g., "20+", "Unknown") -> put into 19+
          arr[19] += num(value);
        }
      }
      return arr;
    };

    return {
      labels: Array.from({ length: 20 }, (_, i) => String(i)), // "0" .. "19" (19 = 19+)
      covid: mkSeries(covidPairs),
      flu:   mkSeries(fluPairs)
    };
  }

  // -------- chart renderers --------
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
        { name: "Reports of Death",             type: "bar", barMaxWidth: 16, data: series.primary, itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", barMaxWidth: 16, data: series.nonCovid, itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderCovidByMonth(el, m) {
    const dom = $(el); if (!dom) return;
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
        data: m.total.labels,
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
        { name: "Total",          type: "line", smooth: 0.2, symbolSize: 2, data: m.total.values,   lineStyle: { color: THEME.primary } },
        { name: "US/Territories", type: "line", smooth: 0.2, symbolSize: 2, data: m.us.values,      lineStyle: { color: THEME.accent } },
        { name: "Foreign*",       type: "line", smooth: 0.2, symbolSize: 2, data: m.foreign.values, lineStyle: { color: THEME.secondary } }
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
        data: series.labels, // "0" .. "19" (19 = 19+)
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

  // --- bootstrap ---
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureECharts();
      const summary = await loadSummary();

      const byYear = buildByYearSeries(summary);
      renderByYear("#chartDeathsByYear", byYear);

      const monthly = getMonthlySeries(summary);
      renderCovidByMonth("#chartCovidDeathsByMonth", monthly);

      const d2o = buildDaysToOnset(summary);
      renderDaysToOnset("#chartDaysToOnset", d2o);
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
