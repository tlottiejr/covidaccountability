// public/assets/js/vaers-charts.js
// Match OpenVAERS-style bins/series exactly; blue theme only.

(function () {
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",   // Reports of Death / Covid
    secondary:"#60a5fa",   // Non-COVID / Flu
    accent:   "#38bdf8"    // US/Terr
  };

  const $ = (s) => document.querySelector(s);
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);
  const isYear = (s) => /^[12]\d{3}$/.test(String(s));

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

  // ---------------- helpers ----------------
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
    for (const [ym, v] of monthPairs || []) {
      if (!ym) continue;
      const y = String(ym).slice(0, 4);
      map.set(y, (map.get(y) || 0) + num(v));
    }
    const years = Array.from(map.keys()).sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // Find the DEATHS-per-year array of [YYYY,value] by scanning known keys,
  // then by heuristics (array of pairs where most labels are 4-digit years and values < 100k).
  function findDeathsByYearPairs(summary) {
    const candidates = [
      summary?.reports_by_year_deaths?.all,
      summary?.deaths_by_year?.all,
      summary?.deaths_by_year,
      summary?.reports_by_year?.deaths
    ].filter(Boolean);

    for (const c of candidates) if (Array.isArray(c) && c.length) return c;

    // Heuristic scan over root object values
    for (const [, v] of Object.entries(summary || {})) {
      if (Array.isArray(v) && v.length > 10 && Array.isArray(v[0])) {
        const sample = v.slice(0, 20);
        const yearish = sample.filter((p) => Array.isArray(p) && isYear(p[0])).length;
        const plausible = sample.every((p) => Array.isArray(p) && num(p[1]) < 100000); // deaths scale
        if (yearish >= Math.min(sample.length, 12) && plausible) return v;
      } else if (v && typeof v === "object") {
        for (const [, vv] of Object.entries(v)) {
          if (Array.isArray(vv) && vv.length > 10 && Array.isArray(vv[0])) {
            const sample = vv.slice(0, 20);
            const yearish = sample.filter((p) => Array.isArray(p) && isYear(p[0])).length;
            const plausible = sample.every((p) => Array.isArray(p) && num(p[1]) < 100000);
            if (yearish >= Math.min(sample.length, 12) && plausible) return vv;
          }
        }
      }
    }
    return null;
  }

  // Build series for chart #1:
  //   A = ALL DEATHS per year (from deaths-by-year pairs)
  //   B = NON-COVID DEATHS per year = A − covidDeathsPerYear
  function buildByYearSeries(summary) {
    const deathsPairs = findDeathsByYearPairs(summary);
    if (!deathsPairs) {
      return { labels: [], deathsAll: [], deathsNonCovid: [], _error: "Deaths-per-year series not found" };
    }
    const ALL = fromPairs(deathsPairs); // 1990..present

    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];
    const COVID = aggregateYearTotals(covidMonthPairs);
    const covidMap = new Map(COVID.labels.map((y, i) => [y, COVID.values[i]]));

    const covidAligned = ALL.labels.map((y) => covidMap.get(y) || 0);
    const nonCovid = ALL.values.map((v, i) => Math.max(0, v - covidAligned[i]));

    return { labels: ALL.labels, deathsAll: ALL.values, deathsNonCovid: nonCovid };
  }

  // Monthly COVID deaths (pairs preserved)
  function getMonthlySeries(summary) {
    const block = summary?.covid_deaths_by_month || {};
    return {
      total:   fromPairs(block.total || []),
      us:      fromPairs(block.us_terr_unk || block.us || []),
      foreign: fromPairs(block.foreign || [])
    };
  }

  // Days to Onset: EXACT 0..19 only; DROP anything else (20+, Unknown, etc.).
  function buildDaysToOnset(summary) {
    const covidPairs = summary?.deaths_days_to_onset?.covid || [];
    const fluPairs   = summary?.deaths_days_to_onset?.flu   || [];

    const mk = (pairs) => {
      const arr = new Array(20).fill(0); // 0..19 exact
      for (const [label, value] of pairs || []) {
        const d = Number(String(label).trim());
        if (Number.isInteger(d) && d >= 0 && d <= 19) arr[d] += num(value);
        // ignore anything else to match the reference
      }
      return arr;
    };

    return {
      labels: Array.from({ length: 20 }, (_, i) => String(i)),
      covid: mk(covidPairs),
      flu:   mk(fluPairs)
    };
  }

  // ---------------- renderers ----------------
  function renderByYear(el, data) {
    const dom = $(el); if (!dom) return;
    const ec = echarts.init(dom, null, { renderer: "canvas" });

    if (data._error) {
      dom.innerHTML = `<div style="padding:8px;color:#64748b;font-size:12px">${data._error}</div>`;
      return;
    }

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
        data: data.labels,
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
        { name: "Reports of Death",             type: "bar", barMaxWidth: 16, data: data.deathsAll,     itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", barMaxWidth: 16, data: data.deathsNonCovid, itemStyle: { color: THEME.secondary } }
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
        data: series.labels, // "0".."19"
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

  // ---------------- bootstrap ----------------
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
