// public/assets/js/vaers-charts.js
(() => {
  const domReady = new Promise((res) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", res, { once: true });
    else res();
  });

  const fmtNum = (n) => (n == null ? "" : Number(n).toLocaleString());

  function cssVars() {
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

  function hookResize(instances) {
    const fn = () => instances.forEach(c => c && c.resize({ animation: { duration: 0 } }));
    window.addEventListener("resize", fn);
    document.addEventListener("visibilitychange", fn);
  }

  // ---- normalizers ----
  function normDeathsByYear(src) {
    // expecting [{year, all, non_covid}]
    if (!Array.isArray(src)) return [];
    return src
      .filter(x => x && x.year != null)
      .map(x => ({ year: Number(x.year), all: Number(x.all||0), non_covid: Number(x.non_covid||0) }))
      .sort((a,b) => a.year - b.year);
  }

  function normDeathsByMonth(src = {}) {
    if (Array.isArray(src)) {
      return {
        months: src.map(r => String(r[0])),
        total:  src.map(r => Number(r[1]||0)),
        dom:    src.map(r => Number(r[2]||0)),
        forgn:  src.map(r => Number(r[3]||0)),
      };
    }
    return {
      months: src.months || src.labels || [],
      total:  src.total  || src.t || [],
      dom:    src.domestic || src.us_territories_unknown || src.us || [],
      forgn:  src.foreign  || src.f || [],
    };
  }

  function normDaysToOnset(src = {}) {
    if (Array.isArray(src)) {
      return {
        buckets: src.map(r => String(r[0])),
        covid:   src.map(r => Number(r[1]||0)),
        flu:     src.map(r => Number(r[2]||0)),
      };
    }
    return {
      buckets: src.buckets || src.labels || [],
      covid:   src.covid || src.c || [],
      flu:     src.flu   || src.f || [],
    };
  }

  async function run() {
    await domReady;

    const byYearEl = document.getElementById("vaers-by-year");
    const monthEl  = document.getElementById("vaers-covid-deaths-monthly");
    const onsetEl  = document.getElementById("vaers-days-to-onset");
    const asOfEl   = document.getElementById("vaers-asof");

    if (!byYearEl || !monthEl || !onsetEl) return;
    if (!window.echarts) {
      console.error("ECharts not found.");
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

    const colors = cssVars();
    const charts = [];

    // === Chart 1 — All Deaths Reported to VAERS by Year ===
    try {
      const c = init(byYearEl);
      const rows = normDeathsByYear(data?.deaths_by_year || []);
      const years = rows.map(r => r.year);
      const all   = rows.map(r => r.all);
      const noncv = rows.map(r => r.non_covid);

      c && c.setOption({
        grid: { left: 48, right: 16, top: 36, bottom: 36 },
        tooltip: {
          trigger: "axis",
          valueFormatter: fmtNum
        },
        legend: {
          data: ["Reports of Death", "All Non-COVID-Vaccine Deaths"],
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
          axisLabel: { color: colors.muted, formatter: (v)=>fmtNum(v) },
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } }
        },
        series: [
          { name: "Reports of Death", type: "line", smooth: true, data: all,   lineStyle: { width: 3 }, color: colors.accent, symbol: "circle", symbolSize: 4 },
          { name: "All Non-COVID-Vaccine Deaths", type: "line", smooth: true, data: noncv, lineStyle: { width: 3 }, color: colors.ink,    symbol: "circle", symbolSize: 4 }
        ]
      });
      charts.push(c);
    } catch (e) { console.error("Chart1 failed", e); }

    // === Chart 2 — COVID Vaccine Reports of Death (by month) ===
    try {
      const c = init(monthEl);
      const src = data?.covid_deaths_by_month || data?.deaths_by_month || {};
      const m = normDeathsByMonth(src);

      c && c.setOption({
        grid: { left: 48, right: 16, top: 36, bottom: 60 },
        tooltip: {
          trigger: "axis",
          valueFormatter: fmtNum
        },
        legend: {
          data: ["Total", "US/Terr/Unknown", "Foreign"],
          top: 0,
          textStyle: { color: colors.muted }
        },
        xAxis: {
          type: "category",
          data: m.months,
          axisLabel: { color: colors.muted, rotate: 45, hideOverlap: true },
          axisLine: { lineStyle: { color: colors.grid } }
        },
        yAxis: {
          type: "value",
          axisLabel: { color: colors.muted, formatter: (v)=>fmtNum(v) },
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } }
        },
        series: [
          { name: "Total",             type: "line", smooth: true, data: m.total, lineStyle: { width: 3 }, color: colors.accent, symbol: "circle", symbolSize: 3, areaStyle: { opacity: 0.1 } },
          { name: "US/Terr/Unknown",   type: "line", smooth: true, data: m.dom,   lineStyle: { width: 3 }, color: colors.ink,    symbol: "none" },
          { name: "Foreign",           type: "line", smooth: true, data: m.forgn, lineStyle: { width: 2 }, color: "#888",        symbol: "none" }
        ]
      });
      charts.push(c);
    } catch (e) { console.error("Chart2 failed", e); }

    // === Chart 3 — VAERS COVID/FLU Vaccine Reported Deaths by Days to Onset ===
    try {
      const c = init(onsetEl);
      const o = normDaysToOnset(data?.deaths_days_to_onset || data?.days_to_onset || {});
      c && c.setOption({
        grid: { left: 48, right: 16, top: 36, bottom: 36 },
        tooltip: { trigger: "axis", valueFormatter: fmtNum },
        legend: { data: ["COVID-19", "Flu"], top: 0, textStyle: { color: colors.muted } },
        xAxis: {
          type: "category",
          data: o.buckets,
          axisLine: { lineStyle: { color: colors.grid } },
          axisLabel: { color: colors.muted }
        },
        yAxis: {
          type: "value",
          axisLabel: { color: colors.muted, formatter: (v)=>fmtNum(v) },
          axisLine: { lineStyle: { color: colors.grid } },
          splitLine: { lineStyle: { color: colors.grid } }
        },
        series: [
          { name: "COVID-19", type: "bar", data: o.covid, color: colors.accent, itemStyle: { borderRadius: [3,3,0,0] } },
          { name: "Flu",      type: "bar", data: o.flu,   color: colors.ink,    itemStyle: { borderRadius: [3,3,0,0] } }
        ]
      });
      charts.push(c);
    } catch (e) { console.error("Chart3 failed", e); }

    hookResize(charts);
  }

  run();
})();
