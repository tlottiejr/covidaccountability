// public/assets/js/vaers-charts.js
// Renders 3 charts (year, month, onset) using ECharts and vaers-summary.json

(async () => {
  const res = await fetch("/data/vaers-summary.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load vaers-summary.json (${res.status})`);
  const data = await res.json();

  const years  = (data.by_year_series  || []).map(d => ({ x: String(d.label), y: +d.count || 0 }));
  const months = (data.by_month_series || []).map(d => ({ x: String(d.label), y: +d.count || 0 }));
  const onset  = (data.onset_series    || []).map(d => ({ x: String(d.label), y: +d.count || 0 }));

  // site colors (fallbacks keep it readable)
  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue("--brand").trim()
    || css.getPropertyValue("--color-primary").trim() || "#0ea5e9";
  const accent  = css.getPropertyValue("--brand-accent").trim() || "#10b981";
  const grid    = "#e5e7eb";
  const text    = css.getPropertyValue("--text-color").trim() || "#111827";

  const mount = id => {
    const el = document.getElementById(id);
    if (!el) return null;
    const c = echarts.init(el, null, { renderer: "canvas" });
    addEventListener("resize", () => c.resize());
    return c;
  };

  const fmt = (n) => n.toLocaleString(undefined);

  // --- Deaths by Year (bar) ---
  const cy = mount("chart-by-year");
  if (cy && years.length) {
    cy.setOption({
      textStyle: { color: text },
      grid: { left: 56, right: 16, top: 18, bottom: 40 },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const v = p[0];
          return `${v.axisValue}<br/>Deaths: <b>${fmt(v.data)}</b>`;
        }
      },
      xAxis: { type: "category", data: years.map(d => d.x),
               axisLine: { lineStyle: { color: grid } } },
      yAxis: { type: "value", min: 0,
               axisLabel: { formatter: (v) => fmt(v) },
               axisLine: { lineStyle: { color: grid } },
               splitLine: { lineStyle: { color: grid } } },
      series: [{
        type: "bar",
        name: "Deaths",
        data: years.map(d => d.y),
        itemStyle: { color: primary },
        emphasis: { itemStyle: { color: accent } }
      }]
    });
  }

  // --- Deaths by Month (line, YYYY-MM) ---
  const cm = mount("chart-by-month");
  if (cm && months.length) {
    cm.setOption({
      textStyle: { color: text },
      grid: { left: 56, right: 16, top: 18, bottom: 64 },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const v = p[0];
          return `${v.axisValue}<br/>Deaths: <b>${fmt(v.data)}</b>`;
        }
      },
      dataZoom: [{ type: "inside" }, { type: "slider", height: 18 }],
      xAxis: { type: "category", data: months.map(d => d.x),
               axisLabel: { rotate: 45 },
               axisLine: { lineStyle: { color: grid } } },
      yAxis: { type: "value", min: 0,
               axisLabel: { formatter: (v) => fmt(v) },
               axisLine: { lineStyle: { color: grid } },
               splitLine: { lineStyle: { color: grid } } },
      series: [{
        type: "line",
        name: "Deaths",
        data: months.map(d => d.y),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: primary },
        areaStyle: { opacity: 0.08, color: primary }
      }]
    });
  }

  // --- Days to Onset (0..19) ---
  const co = mount("chart-onset");
  if (co && onset.length) {
    co.setOption({
      textStyle: { color: text },
      grid: { left: 56, right: 16, top: 18, bottom: 40 },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const v = p[0];
          return `Day ${v.axisValue}<br/>Deaths: <b>${fmt(v.data)}</b>`;
        }
      },
      xAxis: { type: "category", data: onset.map(d => d.x),
               name: "Days after vaccination",
               axisLine: { lineStyle: { color: grid } } },
      yAxis: { type: "value", min: 0,
               axisLabel: { formatter: (v) => fmt(v) },
               axisLine: { lineStyle: { color: grid } },
               splitLine: { lineStyle: { color: grid } } },
      series: [{
        type: "bar",
        name: "Deaths",
        data: onset.map(d => d.y),
        itemStyle: { color: primary },
        emphasis: { itemStyle: { color: accent } }
      }]
    });
  }
})().catch(err => {
  console.error("[vaers-charts] failed:", err);
});
