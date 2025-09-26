// public/assets/js/vaers-charts.js
// Uses deaths_by_year + exact 0..19 D2O to match the reference numerically.
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
    const t0=performance.now();(function r(){ if(window.echarts)return res(echarts);
    if(performance.now()-t0>t)return rej(new Error("ECharts not loaded")); requestAnimationFrame(r);} )();});

  async function loadSummary() {
    const root = $("#vaers-charts-section");
    const url = root?.dataset.summary || "/data/vaers-summary.json";
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
    return r.json();
  }

  // helpers
  const fromPairs = (pairs=[]) => {
    const labels=[], values=[];
    for (const p of pairs||[]) { if (!p || p.length<2) continue;
      labels.push(String(p[0])); values.push(num(p[1])); }
    return {labels, values};
  };
  const aggregateYearTotals = (monthPairs=[])=>{
    const map = new Map();
    for (const [ym,v] of monthPairs||[]) { if(!ym) continue;
      const y = String(ym).slice(0,4); map.set(y,(map.get(y)||0)+num(v)); }
    const years=[...map.keys()].sort();
    return {labels:years, values:years.map(y=>map.get(y)||0)};
  };

  // Strictly find deaths-by-year
  function findDeathsByYearPairs(summary) {
    const candidates = [
      summary?.deaths_by_year?.all,
      summary?.reports_by_year_deaths?.all,
      summary?.reports_by_year?.deaths
    ].filter(Boolean);
    for (const c of candidates) if (Array.isArray(c) && c.length) return c;
    return null;
  }

  function buildByYearSeries(summary) {
    const deathsPairs = findDeathsByYearPairs(summary);
    if (!deathsPairs) return {_error:"Deaths-per-year missing in data"};
    const ALL = fromPairs(deathsPairs); // 1990..present

    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];
    const COVID = aggregateYearTotals(covidMonthPairs);
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

  // Days to Onset: prefer the normalized shape if present; else fall back to exact 0..19 if already collapsed
  function buildDaysToOnset(summary) {
    const d2o = summary?.deaths_days_to_onset || {};
    // normalized shape
    if (d2o?.covid?.exact_0_19 && d2o?.flu?.exact_0_19) {
      return {
        labels: Array.from({length:20},(_,i)=>String(i)),
        covid: fromPairs(d2o.covid.exact_0_19).values,
        flu:   fromPairs(d2o.flu.exact_0_19).values
      };
    }
    // fallback: use whatever 0..19 pairs are present (your current build)
    const covidPairs = Array.isArray(d2o?.covid) ? d2o.covid : [];
    const fluPairs   = Array.isArray(d2o?.flu)   ? d2o.flu   : [];
    const toArr = (pairs)=>{
      const arr=new Array(20).fill(0);
      for (const [k,v] of pairs) {
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

  // renderers
  function renderByYear(sel, data) {
    const el = $(sel); if (!el) return;
    const ec = echarts.init(el, null, {renderer:"canvas"});
    if (data._error) { el.innerHTML = `<div style="padding:8px;color:#64748b;font-size:12px">${data._error}</div>`; return; }
    ec.setOption({
      backgroundColor: THEME.bg,
      tooltip:{trigger:"axis"},
      legend:{top:4},
      grid:{left:60,right:20,bottom:60,top:36},
      xAxis:{type:"category",name:"Received Year",nameLocation:"middle",nameGap:36,
             data:data.labels,axisLabel:{color:THEME.ink,rotate:45,interval:0,fontSize:10},
             axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value",name:"Reports of Death",nameLocation:"middle",nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink,formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"Reports of Death", type:"bar", barMaxWidth:16, data:data.deathsAll,      itemStyle:{color:THEME.primary}},
        {name:"All Non COVID-Vaccine Deaths", type:"bar", barMaxWidth:16, data:data.deathsNonCovid, itemStyle:{color:THEME.secondary}},
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
      legend:{top:4},
      grid:{left:60,right:20,bottom:50,top:36},
      xAxis:{type:"category",name:"Received Month",nameLocation:"middle",nameGap:32,
             data:m.total.labels,axisLabel:{color:THEME.ink,fontSize:10},
             axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value",name:"Reports of Death",nameLocation:"middle",nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink,formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"Total",          type:"line", smooth:0.2, symbolSize:2, data:m.total.values,   lineStyle:{color:THEME.primary}},
        {name:"US/Territories", type:"line", smooth:0.2, symbolSize:2, data:m.us.values,      lineStyle:{color:THEME.accent}},
        {name:"Foreign*",       type:"line", smooth:0.2, symbolSize:2, data:m.foreign.values, lineStyle:{color:THEME.secondary}},
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
      legend:{top:4},
      grid:{left:60,right:20,bottom:50,top:36},
      xAxis:{type:"category",name:"Days to Onset",nameLocation:"middle",nameGap:32,
             data:s.labels,axisLabel:{color:THEME.ink,fontSize:10},
             axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value",name:"Reports of Death",nameLocation:"middle",nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink,formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"Covid Vaccines", type:"bar", barMaxWidth:18, data:s.covid, itemStyle:{color:THEME.primary}},
        {name:"Flu Vaccines",   type:"bar", barMaxWidth:18, data:s.flu,   itemStyle:{color:THEME.secondary}},
      ]
    });
    window.addEventListener("resize", ()=>ec.resize());
  }

  window.addEventListener("DOMContentLoaded", async ()=>{
    try {
      await ensureECharts();
      const summary = await loadSummary();

      renderByYear("#chartDeathsByYear",  buildByYearSeries(summary));
      renderMonthly("#chartCovidDeathsByMonth", getMonthlySeries(summary));
      renderD2O("#chartDaysToOnset",      buildDaysToOnset(summary));
    } catch (e) {
      console.error(e);
      for (const id of ["#chartDeathsByYear","#chartCovidDeathsByMonth","#chartDaysToOnset"]) {
        const el=$(id); if (!el) continue;
        el.innerHTML='<div style="padding:8px;color:#64748b;font-size:12px">Charts temporarily unavailable.</div>';
      }
    }
  });
})();
