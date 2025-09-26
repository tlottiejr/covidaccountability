// public/assets/js/vaers-charts.js
// Matches the reference graphs numerically IF the JSON provides deaths_by_year.
// It also makes the top chart roomier (wider feeling + taller), and fails
// gracefully (inline note) if deaths-by-year is missing.

(function () {
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",
    secondary:"#60a5fa",
    accent:   "#38bdf8"
  };

  const $ = (s) => document.querySelector(s);
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);

  const ensureECharts = (t=4000)=>new Promise((res,rej)=>{
    const t0=performance.now();
    (function tick(){
      if (window.echarts && typeof echarts.init==="function") return res(window.echarts);
      if (performance.now()-t0>t) return rej(new Error("ECharts not loaded"));
      requestAnimationFrame(tick);
    })();
  });

  async function loadSummary() {
    const root = $("#vaers-charts-section");
    const url = root?.dataset.summary || "/data/vaers-summary.json";
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  }

  // --- helpers ---
  const fromPairs = (pairs=[]) => {
    const labels=[], values=[];
    for (const p of pairs||[]) {
      if (!p || p.length<2) continue;
      labels.push(String(p[0]));
      values.push(num(p[1]));
    }
    return {labels, values};
  };

  const aggregateYearTotals = (monthPairs=[])=>{
    const map = new Map();
    for (const [ym,v] of monthPairs||[]) {
      const y = String(ym).slice(0,4);
      map.set(y,(map.get(y)||0)+num(v));
    }
    const years=[...map.keys()].sort();
    return {labels:years, values:years.map(y=>map.get(y)||0)};
  };

  // Strict: only accept REAL deaths-by-year; never fall back to "all reports"
  function findDeathsByYearPairs(summary) {
    const candidates = [
      summary?.deaths_by_year?.all,
      summary?.reports_by_year_deaths?.all,
      summary?.reports_by_year?.deaths
    ].filter(Boolean);
    for (const c of candidates) if (Array.isArray(c) && c.length) return c;
    return null; // make chart show inline note instead of wrong data
  }

  function buildByYearSeries(summary) {
    const deathsPairs = findDeathsByYearPairs(summary);
    if (!deathsPairs) return {_error:"Deaths-per-year missing in /data/vaers-summary.json"};
    const ALL   = fromPairs(deathsPairs);                     // 1990..present (pairs)
    const COVID = aggregateYearTotals(summary?.covid_deaths_by_month?.total || []);
    const covidMap = new Map(COVID.labels.map((y,i)=>[y,COVID.values[i]]));
    const covidAligned = ALL.labels.map(y => covidMap.get(y) || 0);
    const nonCovid = ALL.values.map((v,i)=>Math.max(0, v - covidAligned[i]));
    return { labels: ALL.labels, deathsAll: ALL.values, deathsNonCovid: nonCovid };
  }

  function getMonthlySeries(summary) {
    const b = summary?.covid_deaths_by_month || {};
    return {
      total:   fromPairs(b.total || []),
      us:      fromPairs(b.us_terr_unk || b.us || []),
      foreign: fromPairs(b.foreign || [])
    };
  }

  // Days-to-Onset: exact 0..19 only (matches reference). If your JSON later
  // carries tail buckets, they’re ignored here—only 0..19 will be plotted.
  function buildDaysToOnset(summary) {
    const d2o = summary?.deaths_days_to_onset || {};
    const covidPairs = Array.isArray(d2o?.covid?.exact_0_19) ? d2o.covid.exact_0_19
                     : Array.isArray(d2o?.covid) ? d2o.covid : [];
    const fluPairs   = Array.isArray(d2o?.flu?.exact_0_19)   ? d2o.flu.exact_0_19
                     : Array.isArray(d2o?.flu) ? d2o.flu : [];

    const toArr = (pairs)=>{
      const arr=new Array(20).fill(0);
      for (const [k,v] of pairs||[]) {
        const d = Number(String(k).trim());
        if (Number.isInteger(d) && d>=0 && d<=19) arr[d]+=num(v);
      }
      return arr;
    };

    return {
      labels: Array.from({length:20},(_,i)=>String(i)),
      covid: toArr(covidPairs),
      flu:   toArr(fluPairs)
    };
  }

  // --- renderers (top chart = roomier) ---
  function renderByYear(sel, data) {
    const el = $(sel); if (!el) return;
    const ec = echarts.init(el, null, {renderer:"canvas"});

    if (data._error) {
      el.innerHTML = `<div style="padding:10px;color:#64748b;font-size:12px">${data._error}</div>`;
      return;
    }

    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip: { trigger:"axis" },
      legend:  { top: 6 },
      grid:    { left: 60, right: 26, bottom: 64, top: 40 }, // more room all around
      xAxis: {
        type: "category",
        name: "Received Year",
        nameLocation: "middle",
        nameGap: 38,
        data: data.labels,
        axisLabel: { color: THEME.ink, rotate: 45, interval: 0, fontSize: 10 },
        axisLine:  { lineStyle: { color: THEME.axis } }
      },
      yAxis: {
        type: "value",
        name: "Reports of Death",
        nameLocation: "middle",
        nameGap: 48,
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.ink, formatter: (v)=>v.toLocaleString() }
      },
      series: [
        { name:"Reports of Death",             type:"bar", barMaxWidth:16, data:data.deathsAll,      itemStyle:{ color:THEME.primary } },
        { name:"All Non COVID-Vaccine Deaths", type:"bar", barMaxWidth:16, data:data.deathsNonCovid, itemStyle:{ color:THEME.secondary } }
      ]
    });

    window.addEventListener("resize", ()=>ec.resize());
  }

  function renderMonthly(sel, m) {
    const el = $(sel); if (!el) return;
    const ec = echarts.init(el, null, {renderer:"canvas"});
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip:{trigger:"axis"},
      legend:{top: 6},
      grid:{ left:60, right:24, bottom:52, top: 40 },
      xAxis:{ type:"category", name:"Received Month", nameLocation:"middle", nameGap:32,
              data:m.total.labels, axisLabel:{ color:THEME.ink, fontSize:10 },
              axisLine:{ lineStyle:{ color:THEME.axis } } },
      yAxis:{ type:"value", name:"Reports of Death", nameLocation:"middle", nameGap:46,
              splitLine:{ lineStyle:{ color:THEME.grid } },
              axisLabel:{ color:THEME.ink, formatter:(v)=>v.toLocaleString() } },
      series:[
        { name:"Total",          type:"line", smooth:.2, symbolSize:2, data:m.total.values,   lineStyle:{ color:THEME.primary } },
        { name:"US/Territories", type:"line", smooth:.2, symbolSize:2, data:m.us.values,      lineStyle:{ color:THEME.accent } },
        { name:"Foreign*",       type:"line", smooth:.2, symbolSize:2, data:m.foreign.values, lineStyle:{ color:THEME.secondary } }
      ]
    });
    window.addEventListener("resize", ()=>ec.resize());
  }

  function renderD2O(sel, s) {
    const el = $(sel); if (!el) return;
    const ec = echarts.init(el, null, {renderer:"canvas"});
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip:{trigger:"axis"},
      legend:{top: 6},
      grid:{ left:60, right:24, bottom:52, top: 40 },
      xAxis:{ type:"category", name:"Days to Onset", nameLocation:"middle", nameGap:32,
              data:s.labels, axisLabel:{ color:THEME.ink, fontSize:10 },
              axisLine:{ lineStyle:{ color:THEME.axis } } },
      yAxis:{ type:"value", name:"Reports of Death", nameLocation:"middle", nameGap:46,
              splitLine:{ lineStyle:{ color:THEME.grid } },
              axisLabel:{ color:THEME.ink, formatter:(v)=>v.toLocaleString() } },
      series:[
        { name:"Covid Vaccines", type:"bar", barMaxWidth:18, data:s.covid, itemStyle:{ color:THEME.primary } },
        { name:"Flu Vaccines",   type:"bar", barMaxWidth:18, data:s.flu,   itemStyle:{ color:THEME.secondary } }
      ]
    });
    window.addEventListener("resize", ()=>ec.resize());
  }

  window.addEventListener("DOMContentLoaded", async ()=>{
    try {
      await ensureECharts();
      const summary = await loadSummary();

      renderByYear("#chartDeathsByYear",        buildByYearSeries(summary));
      renderMonthly("#chartCovidDeathsByMonth", getMonthlySeries(summary));
      renderD2O    ("#chartDaysToOnset",        buildDaysToOnset(summary));
    } catch (err) {
      console.error("VAERS charts failed:", err);
      for (const id of ["#chartDeathsByYear","#chartCovidDeathsByMonth","#chartDaysToOnset"]) {
        const el=$(id); if (!el) continue;
        el.innerHTML='<div style="padding:10px;color:#64748b;font-size:12px">Charts temporarily unavailable.</div>';
      }
    }
  });
})();
