<script>
/**
 * VAERS charts bootstrapping
 * - Loads ECharts (prefers local vendor if present; else CDN)
 * - Loads summary data from common repo paths
 * - Renders 3 charts into #chartDeathsByYear, #chartCovidDeathsByMonth, #chartDaysToOnset
 * - Never throws uncaught (won’t break rest of page)
 */
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  // ---- robust DOM ready ----
  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else queueMicrotask(fn);
  }

  // ---- load ECharts: local vendor first, then jsDelivr fallback ----
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script_load_failed:'+src));
      document.head.appendChild(s);
    });
  }
  async function ensureECharts(){
    if (window.echarts) return window.echarts;
    const candidates = [
      '/assets/vendor/echarts.min.js',
      'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'
    ];
    let lastErr = null;
    for (const url of candidates){
      try { await loadScript(url); if (window.echarts) return window.echarts; }
      catch (e){ lastErr = e; /* try next */ }
    }
    throw lastErr || new Error('echarts_unavailable');
  }

  // ---- data loader: try several known locations ----
  async function fetchJson(url){
    const res = await fetch(url, { headers: { accept:'application/json' }, cache:'no-store' });
    if (!res.ok) throw new Error('http '+res.status+' for '+url);
    return res.json();
  }
  async function loadSummary(){
    const paths = [
      '/data/vaers-summary.json',
      '/assets/health/analytics/vaers-summary.json',
      '/assets/health/analytics/vaers.json',
      '/data/vaers.json'
    ];
    for (const p of paths){
      try { return await fetchJson(p); } catch {/* next */}
    }
    if (window.VAERS_SUMMARY) return window.VAERS_SUMMARY; // absolute fallback if page embeds data
    throw new Error('vaers_summary_not_found');
  }

  // ---- helpers / theme ----
  const pick = (o, keys, dflt) => { for (const k of keys) if (o && o[k]!=null) return o[k]; return dflt; };
  const num  = v => (v==null ? 0 : +v);

  function normYearly(src){
    const rows = pick(src, ['yearly','byYear','deathsByYear','yearlyDeaths'], []);
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map(r => ({
      year: String(pick(r, ['year','Year','y'])),
      total: num(pick(r, ['total','DeathsTotal','reports','all'])),
      nonCovid: num(pick(r, ['nonCovid','DeathsNonCovid','other','non_covid']))
    })).filter(x => x.year);
  }
  function normMonthlyCovid(src){
    const rows = pick(src, ['covidMonthly','covidByMonth','covidDeathsByMonth'], []);
    const arr = Array.isArray(rows) ? rows : [];
    return arr.map(r => ({
      month: String(pick(r, ['month','Month'])),
      us:    num(pick(r, ['domestic','US','us','UnitedStates'])),
      foreign: num(pick(r, ['foreign','NonUS','nonUS','Foreign']))
    })).filter(x => x.month);
  }
  function normOnset(src){
    const cv = pick(src, ['covidOnset','daysToOnsetCovid','onsetCovid','covid'], []);
    const fl = pick(src, ['fluOnset','daysToOnsetFlu','onsetFlu','flu'], []);
    const to = a => (Array.isArray(a)?a:[]).map(r => ({ day:num(pick(r,['day','d','x'],0)), n:num(pick(r,['count','n','y'],0)) }));
    return { covid: to(cv), flu: to(fl) };
  }

  const THEME = {
    text:'#0f172a', sub:'#475569', axis:'#94a3b8', grid:'#e2e8f0',
    red:'#ef4444', blue:'#38bdf8', teal:'#14b8a6'
  };

  // ---- renderers ----
  function chartDeathsByYear(el, data, ec){
    const inst = ec.init(el);
    inst.setOption({
      backgroundColor:'transparent',
      grid:{left:56,right:24,top:48,bottom:48},
      tooltip:{trigger:'axis'},
      legend:{top:8,textStyle:{color:THEME.sub}},
      xAxis:{type:'category',data:data.map(d=>d.year),axisLine:{lineStyle:{color:THEME.axis}},axisTick:{show:false},axisLabel:{color:THEME.sub,interval:2}},
      yAxis:{type:'value',axisLine:{lineStyle:{color:THEME.axis}},splitLine:{lineStyle:{color:THEME.grid}},axisLabel:{color:THEME.sub}},
      series:[
        {name:'Reports of Death',type:'bar',data:data.map(d=>d.total),itemStyle:{color:THEME.red}},
        {name:'All Non COVID-Vaccine Deaths',type:'bar',data:data.map(d=>d.nonCovid),itemStyle:{color:THEME.blue}}
      ]
    });
    return inst;
  }
  function chartCovidByMonth(el, data, ec){
    const inst = ec.init(el);
    inst.setOption({
      backgroundColor:'transparent',
      grid:{left:56,right:24,top:48,bottom:56},
      tooltip:{trigger:'axis'},
      legend:{top:8,textStyle:{color:THEME.sub}},
      xAxis:{type:'category',data:data.map(d=>d.month),axisLine:{lineStyle:{color:THEME.axis}},axisTick:{show:false},axisLabel:{color:THEME.sub,interval:2,rotate:40}},
      yAxis:{type:'value',axisLine:{lineStyle:{color:THEME.axis}},splitLine:{lineStyle:{color:THEME.grid}},axisLabel:{color:THEME.sub}},
      series:[
        {name:'US/Territories',type:'line',smooth:true,data:data.map(d=>d.us),lineStyle:{width:3,color:THEME.red}},
        {name:'Foreign',type:'line',smooth:true,data:data.map(d=>d.foreign),lineStyle:{width:3,color:THEME.blue}}
      ]
    });
    return inst;
  }
  function chartOnset(el, ds, ec){
    const max = Math.max(19, ...ds.covid.map(x=>x.day), ...ds.flu.map(x=>x.day));
    const days = Array.from({length:max+1},(_,i)=>i);
    const v = (arr) => days.map(d => (arr.find(x=>x.day===d)?.n)||0);
    const inst = ec.init(el);
    inst.setOption({
      backgroundColor:'transparent',
      grid:{left:56,right:24,top:48,bottom:48},
      tooltip:{trigger:'axis'},
      legend:{top:8,textStyle:{color:THEME.sub}},
      xAxis:{type:'category',data:days,name:'Days to Onset',nameLocation:'middle',nameGap:32,axisLine:{lineStyle:{color:THEME.axis}},axisTick:{show:false},axisLabel:{color:THEME.sub}},
      yAxis:{type:'value',axisLine:{lineStyle:{color:THEME.axis}},splitLine:{lineStyle:{color:THEME.grid}},axisLabel:{color:THEME.sub}},
      series:[
        {name:'Covid Vaccines',type:'bar',data:v(ds.covid),itemStyle:{color:THEME.red}},
        {name:'Flu Vaccines',type:'bar',data:v(ds.flu),itemStyle:{color:THEME.teal}}
      ]
    });
    return inst;
  }

  // ---- boot sequence ----
  onReady(async () => {
    // Exit early if containers aren’t present — do NOT interfere with rest of page
    const c1 = $('#chartDeathsByYear'), c2 = $('#chartCovidDeathsByMonth'), c3 = $('#chartDaysToOnset');
    if (!c1 && !c2 && !c3) return;

    try {
      const ec = await ensureECharts();
      const summary = await loadSummary();

      const yearly = normYearly(summary);
      const monthly = normMonthlyCovid(summary);
      const onset   = normOnset(summary);

      const instances = [];
      if (c1 && yearly.length)  instances.push(chartDeathsByYear(c1, yearly, ec));
      if (c2 && monthly.length) instances.push(chartCovidByMonth(c2, monthly, ec));
      if (c3 && (onset.covid.length || onset.flu.length)) instances.push(chartOnset(c3, onset, ec));

      // show a friendly note when no data
      if (instances.length === 0){
        const msg = document.getElementById('charts-unavailable');
        if (msg) msg.textContent = 'Charts unavailable.';
      }

      // responsive
      addEventListener('resize', () => instances.forEach(i => i.resize()), {passive:true});
    } catch (e){
      console.error('[vaers-charts]', e);
      const msg = document.getElementById('charts-unavailable');
      if (msg) msg.textContent = 'Charts unavailable.';
    }
  });
})();
</script>
