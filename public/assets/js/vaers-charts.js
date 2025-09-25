(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else queueMicrotask(fn);
  }

  function loadScript(src){
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = res; s.onerror = () => rej(new Error('script_load_failed:'+src));
      document.head.appendChild(s);
    });
  }
  async function ensureECharts(){
    if (window.echarts) return window.echarts;
    const candidates = [
      '/assets/vendor/echarts.min.js',
      'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'
    ];
    let last;
    for (const u of candidates){ try { await loadScript(u); if (window.echarts) return window.echarts; } catch(e){ last=e; } }
    throw last || new Error('echarts_unavailable');
  }

  async function fetchJson(u){
    const r = await fetch(u, { headers: { accept:'application/json' } });
    if (!r.ok) throw new Error('http '+r.status+' for '+u);
    return r.json();
  }
  async function loadSummary(){
    const explicit = window.VAERS_SUMMARY_URL;
    const tries = explicit ? [explicit] : [
      '/assets/health/analytics/vaers-summary.json',
      '/data/vaers-summary.json',
      '/assets/health/analytics/vaers.json',
      '/data/vaers.json'
    ];
    let lastErr;
    for (const p of tries){
      try { const j = await fetchJson(p); console.info('[vaers] loaded', p); return j; }
      catch(e){ lastErr = e; }
    }
    if (window.VAERS_SUMMARY) return window.VAERS_SUMMARY;
    console.error('[vaers] summary not found; tried:', tries, 'lastErr:', lastErr);
    throw lastErr || new Error('vaers_summary_not_found');
  }

  const pick = (o, keys, d) => { for (const k of keys) if (o && o[k]!=null) return o[k]; return d; };
  const num  = v => (v==null?0:+v);

  function normYearly(s){
    const rows = pick(s, ['yearly','byYear','deathsByYear','yearlyDeaths'], []);
    return (Array.isArray(rows)?rows:[]).map(r => ({
      year: String(pick(r, ['year','Year','y'])),
      total: num(pick(r, ['total','DeathsTotal','reports','all'])),
      nonCovid: num(pick(r, ['nonCovid','DeathsNonCovid','other','non_covid']))
    })).filter(x => x.year);
  }
  function normMonthlyCovid(s){
    const rows = pick(s, ['covidMonthly','covidByMonth','covidDeathsByMonth'], []);
    return (Array.isArray(rows)?rows:[]).map(r => ({
      month: String(pick(r, ['month','Month'])),
      us:    num(pick(r, ['domestic','US','us','UnitedStates'])),
      foreign: num(pick(r, ['foreign','NonUS','nonUS','Foreign']))
    })).filter(x => x.month);
  }
  function normOnset(s){
    const cv = pick(s, ['covidOnset','daysToOnsetCovid','onsetCovid','covid'], []);
    const fl = pick(s, ['fluOnset','daysToOnsetFlu','onsetFlu','flu'], []);
    const to = a => (Array.isArray(a)?a:[]).map(r => ({ day:num(pick(r,['day','d','x'],0)), n:num(pick(r,['count','n','y'],0)) }));
    return { covid: to(cv), flu: to(fl) };
  }

  const THEME = { text:'#0f172a', sub:'#475569', axis:'#94a3b8', grid:'#e2e8f0', red:'#ef4444', blue:'#38bdf8', teal:'#14b8a6' };

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

  onReady(async () => {
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

      if (instances.length === 0){
        const msg = document.getElementById('charts-unavailable');
        if (msg) msg.textContent = 'Charts unavailable.';
      }
      addEventListener('resize', () => instances.forEach(i => i.resize()), {passive:true});
    } catch (e){
      console.error('[vaers-charts]', e);
      const msg = document.getElementById('charts-unavailable');
      if (msg) msg.textContent = 'Charts unavailable.';
    }
  });
})();
