// public/assets/js/vaers-charts.js
// Defensive ECharts renderers for the About page.
// - Works with multiple JSON shapes
// - Each chart renders independently (one failure won't blank the others)
// - Forces every year label to show

(function () {
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",  // bar 1
    secondary:"#60a5fa",  // bar 2 / line 2
    accent:   "#38bdf8"   // line 1
  };

  const $ = (s) => document.querySelector(s);

  // -------- JSON helpers (with fallbacks) --------
  const num = (x) => (Number.isFinite(+x) ? +x : 0);

  function fromPairs(pairs = []) {
    const labels = [];
    const values = [];
    for (const row of pairs || []) {
      if (!row) continue;
      const k = Array.isArray(row) ? row[0] : row.key ?? row[0];
      const v = Array.isArray(row) ? row[1] : row.value ?? row[1];
      labels.push(String(k));
      values.push(num(v));
    }
    return { labels, values };
  }

  function pick(obj, paths) {
    for (const path of paths) {
      let cur = obj;
      let ok = true;
      for (const seg of path.split(".")) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, seg)) {
          cur = cur[seg];
        } else {
          ok = false; break;
        }
      }
      if (ok) return cur;
    }
    return undefined;
  }

  function aggregateYearTotals(monthPairs = []) {
    const map = new Map();
    for (const [ym, v] of monthPairs || []) {
      const y = String(ym).slice(0, 4);
      map.set(y, (map.get(y) || 0) + num(v));
    }
    const years = [...map.keys()].sort();
    return { labels: years, values: years.map((y) => map.get(y) || 0) };
  }

  // -------- Series builders (robust to shape drift) --------
  function buildByYearSeries(summary) {
    // Total deaths by year (US + Foreign)
    const totalPairs = pick(summary, [
      "reports_by_year.deaths_by_year.all",
      "reports_by_year.deaths.all", // fallback if earlier builder
    ]);
    if (!Array.isArray(totalPairs) || !totalPairs.length) {
      return { _error: "Data unavailable: reports_by_year.deaths_by_year.all" };
    }
    const { labels, values } = fromPairs(totalPairs);

    // Non-COVID deaths by year: use provided series OR derive = total - covidByYear(total monthly)
    const nonCovidPairs = pick(summary, [
      "reports_by_year.non_covid_deaths_by_year.all",
      "reports_by_year.covid_deaths_by_year.non_covid_all" // unlikely but supported
    ]);

    let nonCovidValues;
    if (Array.isArray(nonCovidPairs) && nonCovidPairs.length) {
      nonCovidValues = fromPairs(nonCovidPairs).values;
    } else {
      const covidMonthlyTotal = pick(summary, ["covid_deaths_by_month.total"]) || [];
      const covidYear = aggregateYearTotals(covidMonthlyTotal);
      const covidMap = new Map(covidYear.labels.map((y, i) => [y, covidYear.values[i]]));
      nonCovidValues = values.map((v, i) => Math.max(0, v - (covidMap.get(labels[i]) || 0)));
    }

    return { labels, deathsAll: values, deathsNonCovid: nonCovidValues };
  }

  function getMonthlySeries(summary) {
    const base = pick(summary, ["covid_deaths_by_month"]) || {};
    // Try common key variants for domestic series
    const usPairs =
      base.us_terr_unk ||
      base.us ||
      base.domestic ||
      [];
    const foreignPairs = base.foreign || [];
    const totalPairs = base.total || [];

    return {
      total: fromPairs(totalPairs),
      us: fromPairs(usPairs),
      foreign: fromPairs(foreignPairs),
    };
  }

  function buildDaysToOnset(summary) {
    const d2o = pick(summary, ["deaths_days_to_onset"]) || {};
    const covidPairs =
      pick(d2o, ["covid.exact_0_19"]) ||
      pick(d2o, ["covid"]) ||
      [];
    const fluPairs =
      pick(d2o, ["flu.exact_0_19"]) ||
      pick(d2o, ["flu"]) ||
      [];

    const toArr = (pairs) => {
      const arr = new Array(20).fill(0);
      for (const [k, v] of pairs || []) {
        const d = +String(k).trim();
        if (Number.isInteger(d) && d >= 0 && d <= 19) arr[d] += num(v);
      }
      return arr;
    };

    return {
      labels: Array.from({ length: 20 }, (_, i) => String(i)),
      covid: toArr(covidPairs),
      flu: toArr(fluPairs),
    };
  }

  // -------- Renderers (independent + resilient) --------
  function renderByYear(sel, data) {
    const el = $(sel);
    if (!el) return;
    const ec = echarts.init(el, null, { renderer: "canvas" });

    if (data._error) {
      el.innerHTML = `<div style="padding:10px;color:#64748b;font-size:12px">${data._error}</div>`;
      return;
    }

    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 6 },
      grid: { left: 60, right: 26, bottom: 64, top: 40 },
      xAxis: {
        type: "category",
        name: "Received Year",
        nameLocation: "middle",
        nameGap: 32,
        data: data.labels,
        axisLabel: { color: THEME.ink, fontSize: 10, interval: 0 }, // show EVERY year
        axisLine: { lineStyle: { color: THEME.axis } },
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() },
      },
      series: [
        { name: "All Vaccines", type: "bar", data: data.deathsAll, itemStyle: { color: THEME.primary } },
        { name: "Non-COVID Vacc", type: "bar", data: data.deathsNonCovid, itemStyle: { color: THEME.secondary } },
      ],
    });
    // Resize guards
    const ro = new ResizeObserver(() => ec.resize());
    ro.observe(el);
    setTimeout(() => ec.resize(), 0);
  }

  // Monthly: EXACTLY “US/Territories” + “Foreign*” (no Total shown)
  function renderMonthly(sel, m) {
    const el = $(sel);
    if (!el) return;
    const ec = echarts.init(el, null, { renderer: "canvas" });

    const labels = m.us.labels.length ? m.us.labels : (m.foreign.labels.length ? m.foreign.labels : m.total.labels);
    if (!labels || !labels.length) {
      el.innerHTML = `<div style="padding:10px;color:#64748b;font-size:12px">No monthly data available.</div>`;
      return;
    }

    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 6 },
      grid: { left: 60, right: 24, bottom: 52, top: 40 },
      xAxis: {
        type: "category",
        name: "Received Month",
        nameLocation: "middle",
        nameGap: 32,
        data: labels,
        axisLabel: { color: THEME.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: THEME.axis } },
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() },
      },
      series: [
        { name: "US/Territories", type: "line", smooth: 0.2, symbolSize: 2, data: m.us.values, lineStyle: { color: THEME.accent } },
        { name: "Foreign*", type: "line", smooth: 0.2, symbolSize: 2, data: m.foreign.values, lineStyle: { color: THEME.secondary } },
      ],
    });
    const ro = new ResizeObserver(() => ec.resize());
    ro.observe(el);
    setTimeout(() => ec.resize(), 0);
  }

  function renderD2O(sel, s) {
    const el = $(sel);
    if (!el) return;
    const ec = echarts.init(el, null, { renderer: "canvas" });

    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger: "axis" },
      legend: { top: 6 },
      grid: { left: 60, right: 24, bottom: 52, top: 40 },
      xAxis: {
        type: "category",
        name: "Days to Onset",
        nameLocation: "middle",
        nameGap: 32,
        data: s.labels,
        axisLabel: { color: THEME.ink, fontSize: 10 },
        axisLine: { lineStyle: { color: THEME.axis } },
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 46,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v) => v.toLocaleString() },
      },
      series: [
        { name: "Covid Vaccines", type: "bar", barMaxWidth: 18, data: s.covid, itemStyle: { color: THEME.primary } },
        { name: "Flu Vaccines", type: "bar", barMaxWidth: 18, data: s.flu, itemStyle: { color: THEME.secondary } },
      ],
    });
    const ro = new ResizeObserver(() => ec.resize());
    ro.observe(el);
    setTimeout(() => ec.resize(), 0);
  }

  // -------- Boot --------
  async function loadSummary() {
    const url = window.VAERS_SUMMARY_URL || "/data/vaers-summary.json";
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const summary = await loadSummary();

      // Chart 1
      try { renderByYear("#chartDeathsByYear", buildByYearSeries(summary)); } catch (e) { console.warn("byYear failed", e); }

      // Chart 2
      try { renderMonthly("#chartCovidDeathsByMonth", getMonthlySeries(summary)); } catch (e) { console.warn("monthly failed", e); }

      // Chart 3
      try { renderD2O("#chartDaysToOnset", buildDaysToOnset(summary)); } catch (e) { console.warn("d2o failed", e); }
    } catch (err) {
      console.error("VAERS charts failed:", err);
      ["#chartDeathsByYear", "#chartCovidDeathsByMonth", "#chartDaysToOnset"].forEach((id) => {
        const el = $(id);
        if (!el) return;
        el.innerHTML = '<div style="padding:10px;color:#64748b;font-size:12px">Charts temporarily unavailable.</div>';
      });
    }
  });
})();
