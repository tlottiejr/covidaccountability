<script>
(async () => {
  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  // Load ECharts from CDN if not present
  async function ensureECharts() {
    if (window.echarts) return window.echarts;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('echarts_load_error'));
      document.head.appendChild(s);
    });
    return window.echarts;
  }

  // Try several known data paths (first that exists wins)
  async function loadSummary() {
    const candidates = [
      '/data/vaers-summary.json',
      '/assets/health/analytics/vaers-summary.json',
      '/data/vaers.json'
    ];
    for (const p of candidates) {
      try {
        const res = await fetch(p, { headers: { accept: 'application/json' }});
        if (res.ok) return await res.json();
      } catch { /* next */ }
    }
    throw new Error('summary_not_found');
  }

  // Defensive pick helpers
  const pick = (o, keys, dflt = undefined) => {
    for (const k of keys) if (o && o[k] != null) return o[k];
    return dflt;
  };
  const toNum = x => (x == null ? 0 : +x);

  // Normalize inputs into the shapes the charts need
  function normalizeYearly(summary) {
    const src = pick(summary, ['yearly', 'byYear', 'deathsByYear', 'yearlyDeaths'], []);
    const rows = Array.isArray(src) ? src : [];
    // Accept shapes like: {year, total, nonCovid} or {Year, DeathsTotal, DeathsNonCovid} etc.
    return rows.map(r => ({
      year: String(pick(r, ['year', 'Year'])),
      total: toNum(pick(r, ['total', 'DeathsTotal', 'reports', 'all'])),
      nonCovid: toNum(pick(r, ['nonCovid', 'DeathsNonCovid', 'non_covid', 'other']))
    })).filter(x => x.year && (x.total || x.nonCovid));
  }

  function normalizeMonthlyCovid(summary) {
    const src = pick(summary, ['covidMonthly', 'covidByMonth', 'covidDeathsByMonth'], []);
    const rows = Array.isArray(src) ? src : [];
    return rows.map(r => ({
      month: String(pick(r, ['month', 'Month'])),
      domestic: toNum(pick(r, ['domestic', 'US', 'us', 'UnitedStates'])),
      foreign: toNum(pick(r, ['foreign', 'nonUS', 'NonUS', 'Foreign']))
    })).filter(x => x.month);
  }

  function normalizeOnset(summary) {
    // { covid: [{day,count}], flu:[{day,count}] } or variants
    const covid = pick(summary, ['covidOnset', 'daysToOnsetCovid', 'onsetCovid', 'covid'], []);
    const flu = pick(summary, ['fluOnset', 'daysToOnsetFlu', 'onsetFlu', 'flu'], []);
    const norm = arr => (Array.isArray(arr) ? arr : []).map(r => ({
      day: toNum(pick(r, ['day', 'd', 'x'])),
      count: toNum(pick(r, ['count', 'y', 'n']))
    })).filter(x => Number.isFinite(x.day));
    return { covid: norm(covid), flu: norm(flu) };
  }

  // ---------- theme ----------
  const THEME = {
    text: '#0f172a',        // slate-900
    subText: '#475569',     // slate-600
    grid: '#e2e8f0',        // slate-200
    axis: '#94a3b8',        // slate-400
    red: '#ef4444',         // red-500
    blue: '#38bdf8',        // sky-400
    teal: '#14b8a6'         // teal-500
  };

  // ---------- rendering ----------
  function chartDeathsByYear(el, data, echarts) {
    const years = data.map(d => d.year);
    const total = data.map(d => d.total);
    const nonCovid = data.map(d => d.nonCovid);

    const inst = echarts.init(el);
    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 56, right: 24, top: 48, bottom: 48 },
      tooltip: { trigger: 'axis' },
      legend: { top: 8, textStyle: { color: THEME.subText } },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: THEME.axis }},
        axisTick: { show: false },
        axisLabel: { color: THEME.subText, interval: 2 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: THEME.axis }},
        splitLine: { lineStyle: { color: THEME.grid }},
        axisLabel: { color: THEME.subText }
      },
      series: [
        { name: 'Reports of Death', type: 'bar', data: total, itemStyle: { color: THEME.red }},
        { name: 'All Non COVID-Vaccine Deaths', type: 'bar', data: nonCovid, itemStyle: { color: THEME.blue }}
      ]
    });
    return inst;
  }

  function chartCovidDeathsByMonth(el, data, echarts) {
    const months = data.map(d => d.month);
    const domestic = data.map(d => d.domestic);
    const foreign = data.map(d => d.foreign);

    const inst = echarts.init(el);
    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 56, right: 24, top: 48, bottom: 48 },
      tooltip: { trigger: 'axis' },
      legend: { top: 8, textStyle: { color: THEME.subText } },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: THEME.axis }},
        axisTick: { show: false },
        axisLabel: { color: THEME.subText, interval: 2, rotate: 40 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: THEME.axis }},
        splitLine: { lineStyle: { color: THEME.grid }},
        axisLabel: { color: THEME.subText }
      },
      series: [
        { name: 'US/Territories', type: 'line', smooth: true, data: domestic, lineStyle: { width: 3, color: THEME.red }},
        { name: 'Foreign', type: 'line', smooth: true, data: foreign, lineStyle: { width: 3, color: THEME.blue }}
      ]
    });
    return inst;
  }

  function chartDaysToOnset(el, dataset, echarts) {
    const maxDay = Math.max(
      ...dataset.covid.map(d => d.day || 0),
      ...dataset.flu.map(d => d.day || 0),
      19
    );
    const days = Array.from({ length: maxDay + 1 }, (_, i) => i);
    const vCovid = days.map(d => (dataset.covid.find(x => x.day === d)?.count) || 0);
    const vFlu   = days.map(d => (dataset.flu.find(x => x.day === d)?.count) || 0);

    const inst = echarts.init(el);
    inst.setOption({
      backgroundColor: 'transparent',
      grid: { left: 56, right: 24, top: 48, bottom: 48 },
      tooltip: { trigger: 'axis' },
      legend: { top: 8, textStyle: { color: THEME.subText } },
      xAxis: {
        type: 'category',
        data: days,
        name: 'Days to Onset',
        nameLocation: 'middle',
        nameGap: 32,
        axisLine: { lineStyle: { color: THEME.axis }},
        axisTick: { show: false },
        axisLabel: { color: THEME.subText }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: THEME.axis }},
        splitLine: { lineStyle: { color: THEME.grid }},
        axisLabel: { color: THEME.subText }
      },
      series: [
        { name: 'Covid Vaccines', type: 'bar', data: vCovid, itemStyle: { color: THEME.red }},
        { name: 'Flu Vaccines',   type: 'bar', data: vFlu,   itemStyle: { color: THEME.teal }}
      ]
    });
    return inst;
  }

  // ---------- boot ----------
  try {
    const echarts = await ensureECharts();
    const summary = await loadSummary();

    const yearly = normalizeYearly(summary);
    const monthlyCovid = normalizeMonthlyCovid(summary);
    const onset = normalizeOnset(summary);

    const charts = [];
    const c1 = $('#chartDeathsByYear');
    const c2 = $('#chartCovidDeathsByMonth');
    const c3 = $('#chartDaysToOnset');
    if (c1 && yearly.length) charts.push(chartDeathsByYear(c1, yearly, echarts));
    if (c2 && monthlyCovid.length) charts.push(chartCovidDeathsByMonth(c2, monthlyCovid, echarts));
    if (c3 && (onset.covid.length || onset.flu.length)) charts.push(chartDaysToOnset(c3, onset, echarts));

    // simple responsive
    window.addEventListener('resize', () => charts.forEach(ch => ch.resize()));
  } catch (e) {
    console.error('[vaers-charts] failed:', e);
    const container = document.getElementById('charts-unavailable');
    if (container) container.textContent = 'Charts unavailable.';
  }
})();
</script>
