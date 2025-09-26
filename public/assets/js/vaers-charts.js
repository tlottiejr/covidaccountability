// public/assets/js/vaers-charts.js
// Uses your JSON layout (reports_by_year.deaths_by_year.all).
// Days-to-Onset shows exact 0..19 and suppresses the fake “19 == 19+ tail”.

(function () {
  const THEME = {
    bg: "transparent",
    ink: "#0f172a",
    axis: "#64748b",
    grid: "rgba(0,0,0,0.08)",
    primary:  "#2563eb",  // main blue
    secondary:"#60a5fa",  // light blue
    accent:   "#38bdf8"
  };

  const $ = (s) => document.querySelector(s);
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "")) || 0);

  const ensureECharts = (t=4000)=>new Promise((res,rej)=>{
    const t0=performance.now();
    (function tick(){
      if (window.echarts && typeof echarts.init==="function") return res(echarts);
      if (performance.now()-t0>t) return rej(new Error("ECharts not loaded"));
      requestAnimationFrame(tick);
    })();
  });

  async function fetchJSON(url) {
    const r = await fetch(url, { cache:"no-cache" });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  async function loadSummary() {
    const root = $("#vaers-charts-section");
    const url = root?.dataset.summary || "/data/vaers-summary.json";
    try { return await fetchJSON(url); }
    catch { return {}; }
  }

  // ---------- helpers ----------
  const fromPairs = (pairs=[]) => {
    const labels=[], values=[];
    for (const p of pairs||[]) { if (!p || p.length<2) continue;
      labels.push(String(p[0])); values.push(num(p[1])); }
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

  // === Your zip stores deaths-by-year here: reports_by_year.deaths_by_year.all ===
  function getDeathsByYearPairs(summary) {
    // Your shape
    const p1 = summary?.reports_by_year?.deaths_by_year?.all;
    if (Array.isArray(p1) && p1.length) return p1;

    // Accept alternatives just in case future builds move it
    const p2 = summary?.deaths_by_year?.all;
    if (Array.isArray(p2) && p2.length) return p2;

    const p3 = summary?.reports_by_year_deaths?.all;
    if (Array.isArray(p3) && p3.length) return p3;

    const p4 = summary?.reports_by_year?.deaths;
    if (Array.isArray(p4) && p4.length) return p4;

    return null;
  }

  function buildByYearSeries(summary) {
    const deathsPairs = getDeathsByYearPairs(summary);
    if (!deathsPairs) return {_error:"Deaths-per-year missing in /data/vaers-summary.json"};

    const ALL = fromPairs(deathsPairs); // all-vaccine deaths per year (1990..present)

    // COVID deaths per year from monthly totals (for computing Non-COVID)
    const COVIDm = summary?.covid_deaths_by_month?.total || [];
    const COVID  = aggregateYearTotals(COVIDm);
    const covidMap = new Map(COVID.labels.map((y,i)=>[y,COVID.values[i]]));

    const covidAligned = ALL.labels.map(y => covidMap.get(y) || 0);
    const nonCovid = ALL.values.map((v,i)=>Math.max(0, v - covidAligned[i]));

    return { labels: ALL.labels, deathsAll: ALL.values, deathsNonCovid: nonCovid };
  }

  function getMonthlySeries(summary) {
    const b = summary?.covid_deaths_by_month || {};
    return {
      total:   fromPairs(b.total   || []),
      us:      fromPairs(b.us_terr_unk || b.us || []),
      foreign: fromPairs(b.foreign || [])
    };
  }

  // Days-to-Onset: we expect pairs for 0..19; if the 19 bucket is obviously the 20+ tail, hide it and add a note.
  function buildDaysToOnset(summary) {
    const d2o = summary?.deaths_days_to_onset || {};
    const covidPairs = Array.isArray(d2o?.covid?.exact_0_19) ? d2o.covid.exact_0_19
                     : Array.isArray(d2o?.covid) ? d2o.covid : [];
    const fluPairs   = Array.isArray(d2o?.flu?.exact_0_19)   ? d2o.flu.exact_0_19
                     : Array.isArray(d2o?.flu)   ? d2o.flu   : [];

    const toArr = (pairs)=>{
      const arr=new Array(20).fill(0);
      for (const [k,v] of pairs||[]) {
        const d = Number(String(k).trim());
        if (Number.isInteger(d) && d>=0 && d<=19) arr[d]+=num(v);
      }
      return arr;
    };

    const series = {
      labels: Array.from({length:20},(_,i)=>String(i)),
      covid: toArr(covidPairs),
      flu:   toArr(fluPairs)
    };

    // Heuristic: if 19 is an obvious "19+" tail (way larger than neighbors), suppress it and leave a note.
    (function softenTail(s) {
      const c = s.covid;
      if (!Array.isArray(c) || c.length !== 20) return;
      const near = c.slice(15,19); // 15..18 neighbors
      const avgNear = near.reduce((a,b)=>a+b,0) / Math.max(near.length,1);
      if (avgNear > 0 && c[19] > avgNear * 8) {
        c[19] = 0; // suppress misleading tail folded into 19
        s._note = "Note: Source folds ≥20 into 19; excluded to match 0–19 figure.";
      }
    })(series);

    return series;
  }

  // ---------- renderers ----------
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
      grid:    { left: 60, right: 26, bottom: 64, top: 40 }, // roomier top chart
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

    // Show note if we suppressed a folded 19+ tail
    if (s._note) {
      const note = document.createElement("div");
      note.style.cssText = "padding:8px 0;color:#64748b;font-size:12px";
      note.textContent = s._note;
      el.parentElement?.appendChild(note);
    }

    window.addEventListener("resize", ()=>ec.resize());
  }

  // ---------- bootstrap ----------
  window.addEventListener("DOMContentLoaded", async ()=>{
    try {
      await ensureECharts();
      const summary = await loadSummary();

      renderByYear("#chartDeathsByYear", buildByYearSeries(summary));
      renderMonthly("#chartCovidDeathsByMonth", getMonthlySeries(summary));
      renderD2O("#chartDaysToOnset", buildDaysToOnset(summary));
    } catch (err) {
      console.error("VAERS charts failed:", err);
      ["#chartDeathsByYear","#chartCovidDeathsByMonth","#chartDaysToOnset"].forEach(id=>{
        const el=$(id); if (!el) return;
        el.innerHTML='<div style="padding:10px;color:#64748b;font-size:12px">Charts temporarily unavailable.</div>';
      });
    }
  });
})();
