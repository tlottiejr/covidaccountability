// public/assets/js/vaers-charts.js
(function () {
  const THEME = { bg:"transparent", ink:"#0f172a", axis:"#64748b", grid:"rgba(0,0,0,0.08)",
    primary:"#2563eb", secondary:"#60a5fa", accent:"#38bdf8" };
  const $ = (s)=>document.querySelector(s);
  const num = (x)=>Number.isFinite(+x)?+x:0;
  const fromPairs=(pairs=[])=>({labels:pairs.map(([k])=>String(k)), values:pairs.map(([,v])=>num(v))});
  const aggregateYearTotals=(pairs=[])=>{const m=new Map(); for(const [ym,v] of pairs){const y=String(ym).slice(0,4); m.set(y,(m.get(y)||0)+num(v));} const ys=[...m.keys()].sort(); return {labels:ys, values:ys.map(y=>m.get(y)||0)};};

  function buildByYearSeries(summary){
    const pairs = summary?.reports_by_year?.deaths_by_year?.all;
    if (!Array.isArray(pairs)||!pairs.length) return {_error:"Data unavailable: reports_by_year.deaths_by_year.all"};
    const {labels, values} = fromPairs(pairs);
    const covidMonthPairs = summary?.covid_deaths_by_month?.total || [];
    const covidYear = aggregateYearTotals(covidMonthPairs);
    const covidMap = new Map(covidYear.labels.map((y,i)=>[y,covidYear.values[i]]));
    const nonCovid = values.map((v,i)=>Math.max(0, v - (covidMap.get(labels[i]) || 0)));
    return { labels, deathsAll: values, deathsNonCovid: nonCovid };
  }

  function getMonthlySeries(summary){
    const b=summary?.covid_deaths_by_month||{};
    return { total:fromPairs(b.total||[]), us:fromPairs(b.us_terr_unk||b.us||[]), foreign:fromPairs(b.foreign||[]) };
  }

  function buildDaysToOnset(summary){
    const d2o=summary?.deaths_days_to_onset||{};
    const covidPairs = Array.isArray(d2o?.covid?.exact_0_19)?d2o.covid.exact_0_19:[];
    const fluPairs   = Array.isArray(d2o?.flu?.exact_0_19)?d2o.flu.exact_0_19:[];
    const toArr=(pairs)=>{const arr=new Array(20).fill(0); for(const [k,v] of pairs||[]){const d=+String(k).trim(); if(Number.isInteger(d)&&d>=0&&d<=19) arr[d]+=num(v);} return arr;};
    return { labels:Array.from({length:20},(_,i)=>String(i)), covid:toArr(covidPairs), flu:toArr(fluPairs) };
  }

  function renderByYear(sel,data){
    const el=$(sel); if(!el) return;
    const ec=echarts.init(el,null,{renderer:"canvas"});
    if(data._error){ el.innerHTML=`<div style="padding:10px;color:#64748b;font-size:12px">${data._error}</div>`; return; }
    ec.setOption({
      backgroundColor:THEME.bg, tooltip:{trigger:"axis"}, legend:{top:6},
      grid:{left:60,right:26,bottom:64,top:40},
      xAxis:{type:"category", name:"Received Year", nameLocation:"middle", nameGap:32,
             data:data.labels, axisLabel:{color:THEME.ink,fontSize:10, interval:0},
             axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value", name:"Reports of Death", nameLocation:"middle", nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink, formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"All Vaccines",   type:"bar", data:data.deathsAll,      itemStyle:{color:THEME.primary}},
        {name:"Non-COVID Vacc", type:"bar", data:data.deathsNonCovid, itemStyle:{color:THEME.secondary}}
      ]
    });
    addSourceTag(el);
    window.addEventListener("resize",()=>ec.resize());
  }

  function renderMonthly(sel,m){
    const el=$(sel); if(!el) return;
    if(!m||!m.us||!m.foreign){ console.warn("Monthly series missing; skipping chart.", m); return; }
    const ec=echarts.init(el,null,{renderer:"canvas"});
    ec.setOption({
      backgroundColor:THEME.bg, tooltip:{trigger:"axis"}, legend:{top:6},
      grid:{left:60,right:24,bottom:52,top:40},
      xAxis:{type:"category", name:"Received Month", nameLocation:"middle", nameGap:32,
             data:m.us.labels, axisLabel:{color:THEME.ink,fontSize:10}, axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value", name:"Reports of Death", nameLocation:"middle", nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink, formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"US/Territories", type:"line", smooth:.2, symbolSize:2, data:m.us.values,      lineStyle:{color:THEME.accent}},
        {name:"Foreign*",       type:"line", smooth:.2, symbolSize:2, data:m.foreign.values, lineStyle:{color:THEME.secondary}}
      ]
    });
    addSourceTag(el);
    window.addEventListener("resize",()=>ec.resize());
  }

  function renderD2O(sel,s){
    const el=$(sel); if(!el) return;
    const ec=echarts.init(el,null,{renderer:"canvas"});
    ec.setOption({
      backgroundColor:THEME.bg, tooltip:{trigger:"axis"}, legend:{top:6},
      grid:{left:60,right:24,bottom:52,top:40},
      xAxis:{type:"category", name:"Days to Onset", nameLocation:"middle", nameGap:32,
             data:s.labels, axisLabel:{color:THEME.ink,fontSize:10}, axisLine:{lineStyle:{color:THEME.axis}}},
      yAxis:{type:"value", name:"Reports of Death", nameLocation:"middle", nameGap:46,
             splitLine:{lineStyle:{color:THEME.grid}},
             axisLabel:{color:THEME.ink, formatter:(v)=>v.toLocaleString()}},
      series:[
        {name:"Covid Vaccines", type:"bar", barMaxWidth:18, data:s.covid, itemStyle:{color:THEME.primary}},
        {name:"Flu Vaccines",   type:"bar", barMaxWidth:18, data:s.flu,   itemStyle:{color:THEME.secondary}}
      ]
    });
    addSourceTag(el);
    window.addEventListener("resize",()=>ec.resize());
  }

  function addSourceTag(el){
    const tag=document.createElement("div");
    tag.textContent="source: OpenVAERS.com";
    tag.style.cssText="position:absolute;right:16px;top:8px;color:#94a3b8;font-size:12px";
    el.style.position="relative"; el.appendChild(tag);
  }

  async function loadSummary(){
    const url=window.VAERS_SUMMARY_URL||"/data/vaers-summary.json";
    const res=await fetch(url,{cache:"no-cache"}); 
    if(!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`); 
    return res.json();
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    try{
      const summary=await loadSummary();
      renderByYear("#chartDeathsByYear", buildByYearSeries(summary));
      renderMonthly("#chartCovidDeathsByMonth", getMonthlySeries(summary));
      renderD2O("#chartDaysToOnset", buildDaysToOnset(summary));
    }catch(err){
      console.error("VAERS charts failed:", err);
      ["#chartDeathsByYear","#chartCovidDeathsByMonth","#chartDaysToOnset"].forEach(id=>{
        const el=$(id); if(!el) return;
        el.innerHTML='<div style="padding:10px;color:#64748b;font-size:12px">Charts temporarily unavailable.</div>';
      });
    }
  });
})();
