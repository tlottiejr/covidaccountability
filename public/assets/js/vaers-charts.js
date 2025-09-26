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
  const once = (() => {
    let done = false;
    return (fn) => (!done && (done = true, fn()));
  })();

  function waitForECharts(timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      (function tick() {
        if (window.echarts && typeof echarts.init === "function") return resolve(echarts);
        if (performance.now() - t0 > timeoutMs) return reject(new Error("ECharts not loaded"));
        requestAnimationFrame(tick);
      })();
    });
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`);
    return res.json();
  }

  async function loadSummary() {
    const host = $("#vaers-charts-section");
    const primary = host?.getAttribute("data-summary") || "/data/vaers-summary.json";
    try {
      const j = await fetchJSON(primary);
      if (j && Object.keys(j).length) return { json: j, used: primary };
      throw new Error("Empty JSON");
    } catch (e) {
      // fallback path used elsewhere in your repo
      const fallback = "/assets/health/analytics/vaers-summary.json";
      const j = await fetchJSON(fallback);
      return { json: j, used: fallback };
    }
  }

  // Helpers to coerce values to numbers and extract from various shapes
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);
  const arrNum = (a) => (Array.isArray(a) ? a.map(num) : []);

  function normalizeByYear(src) {
    // Accept:
    // A) { labels:[...], totalDeaths:[...], nonCovidDeaths:[...] }
    // B) { years:[...], deaths:[...], nonCovid:[...] }
    // C) { byYear:{ labels,total,nonCovid } }
    // D) Array of objects: [{year:2021,total:26000,nonCovid:1200}, ...]
    // E) Object maps: { totalByYear:{ "2021":26000, ... }, nonCovidByYear:{ ... } }
    let labels = [], total = [], nonCovid = [];

    if (Array.isArray(src)) {
      labels = src.map(r => String(r.year ?? r.label ?? r.y ?? ""));
      total  = src.map(r => num(r.total ?? r.deaths ?? r.totalDeaths ?? r.t ?? 0));
      nonCovid = src.map(r => num(r.nonCovid ?? r.non_covid ?? r.nonCovidDeaths ?? r.nc ?? 0));
    } else if (src?.byYear) {
      const b = src.byYear;
      labels = b.labels || b.years || [];
      total  = arrNum(b.total || b.deaths || b.totalDeaths);
      nonCovid = arrNum(b.nonCovid || b.non_covid || b.nonCovidDeaths);
    } else if (src?.labels || src?.years) {
      labels = src.labels || src.years || [];
      total  = arrNum(src.totalDeaths || src.deaths || src.total);
      nonCovid = arrNum(src.nonCovidDeaths || src.nonCovid);
    } else if (src?.totalByYear && src?.nonCovidByYear) {
      const years = Object.keys(src.totalByYear).sort();
      labels = years;
      total = years.map(y => num(src.totalByYear[y]));
      nonCovid = years.map(y => num(src.nonCovidByYear[y]));
    } else if (src?.deathsByYear) {
      const years = Object.keys(src.deathsByYear).sort();
      labels = years;
      total = years.map(y => num(src.deathsByYear[y]));
      // nonCovid may be absent
      nonCovid = years.map(() => 0);
    }
    return { labels, total, nonCovid };
  }

  function normalizeCovidByMonth(src) {
    // Accept:
    // A) { labels, total, us, foreign }
    // B) { months, total, usa, foreign }
    // C) { covidByMonth: { labels,total,us,foreign } }
    // D) Array of objects: [{month:"Dec 2020", total:..., us:..., foreign:...}, ...]
    let labels = [], total = [], us = [], foreign = [];
    if (Array.isArray(src)) {
      labels = src.map(r => String(r.month ?? r.label ?? ""));
      total  = src.map(r => num(r.total ?? r.t ?? 0));
      us     = src.map(r => num(r.us ?? r.usa ?? 0));
      foreign= src.map(r => num(r.foreign ?? r.non_us ?? 0));
    } else if (src?.covidByMonth) {
      const c = src.covidByMonth;
      labels = c.labels || c.months || [];
      total  = arrNum(c.total);
      us     = arrNum(c.us || c.usa);
      foreign= arrNum(c.foreign);
    } else {
      labels = src.labels || src.months || [];
      total  = arrNum(src.total);
      us     = arrNum(src.us || src.usa);
      foreign= arrNum(src.foreign);
    }
    return { labels, total, us, foreign };
  }

  function normalizeDaysToOnset(src) {
    // Accept:
    // A) { labels, covid, flu }
    // B) { daysToOnset:{ labels,covid,flu } }
    // C) Array of objects: [{day:0,covid:4300,flu:500}, ...]
    let labels = [], covid = [], flu = [];
    if (Array.isArray(src)) {
      labels = src.map(r => String(r.day ?? r.label ?? ""));
      covid  = src.map(r => num(r.covid ?? 0));
      flu    = src.map(r => num(r.flu ?? 0));
    } else if (src?.daysToOnset) {
      const d = src.daysToOnset;
      labels = d.labels || d.days || [];
      covid  = arrNum(d.covid);
      flu    = arrNum(d.flu);
    } else {
      labels = src.labels || src.days || [];
      covid  = arrNum(src.covid);
      flu    = arrNum(src.flu);
    }
    return { labels, covid, flu };
  }

  function numberFmt(n) {
    return (typeof n === "number" ? n : num(n)).toLocaleString();
  }

  // ---- Chart renderers ----
  function renderByYear(el, data) {
    const dom = $(el);
    if (!dom) return;
    const { labels, total, nonCovid } = normalizeByYear(data);
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Received Year", nameLocation: "middle", nameGap: 28,
               data: labels, axisLine: { lineStyle: { color: THEME.axis } }, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: numberFmt } },
      series: [
        { name: "Reports of Death", type: "bar", data: total.map(num), itemStyle: { color: THEME.primary } },
        { name: "All Non COVID-Vaccine Deaths", type: "bar", data: nonCovid.map(num), itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderCovidByMonth(el, data) {
    const dom = $(el);
    if (!dom) return;
    const { labels, total, us, foreign } = normalizeCovidByMonth(data);
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Received Month", nameLocation: "middle", nameGap: 28,
               data: labels, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: numberFmt } },
      series: [
        { name: "Total", type: "line", smooth: 0.2, symbolSize: 3, data: total.map(num), lineStyle: { color: THEME.primary } },
        { name: "US/Territories", type: "line", smooth: 0.2, symbolSize: 3, data: us.map(num), lineStyle: { color: THEME.accent } },
        { name: "Foreign*", type: "line", smooth: 0.2, symbolSize: 3, data: foreign.map(num), lineStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  function renderDaysToOnset(el, data) {
    const dom = $(el);
    if (!dom) return;
    const { labels, covid, flu } = normalizeDaysToOnset(data);
    const ec = echarts.init(dom, null, { renderer: "canvas" });
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 50, right: 20, bottom: 40, top: 30 },
      xAxis: { type: "category", name: "Days to Onset", nameLocation: "middle", nameGap: 28,
               data: labels, axisLabel: { color: THEME.ink } },
      yAxis: { type: "value", name: "Reports of Death", nameLocation: "middle", nameGap: 40,
               splitLine: { lineStyle: { color: THEME.grid } }, axisLabel: { color: THEME.ink, formatter: numberFmt } },
      series: [
        { name: "Covid Vaccines", type: "bar", data: covid.map(num), itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines", type: "bar", data: flu.map(num), itemStyle: { color: THEME.secondary } }
      ]
    });
    window.addEventListener("resize", () => ec.resize());
  }

  // ---- Bootstrap ----
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await waitForECharts();
      const { json, used } = await loadSummary();

      // detect likely homes inside summary:
      const byYearSrc = json.byYear || json.by_year || json.deathsByYear || json.totalByYear || json;
      const monthSrc  = json.covidByMonth || json.covid_monthly || json.deathsByMonth || json;
      const d2oSrc    = json.daysToOnset || json.days_to_onset || json;

      once(() => console.log("[VAERS charts] JSON source:", used,
        { byYearKeys: Object.keys(byYearSrc || {}), monthKeys: Object.keys(monthSrc || {}), d2oKeys: Object.keys(d2oSrc || {}) }));

      renderByYear("#chartDeathsByYear", byYearSrc);
      renderCovidByMonth("#chartCovidDeathsByMonth", monthSrc);
      renderDaysToOnset("#chartDaysToOnset", d2oSrc);
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
