// public/assets/js/vaers-charts.js
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  // ----- DOM ready -----
  const onReady = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn, { once: true })
      : queueMicrotask(fn);

  // ----- ECharts loader (local then CDN) -----
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = res;
      s.onerror = () => rej(new Error("script_load_failed:" + src));
      document.head.appendChild(s);
    });
  }
  async function ensureECharts() {
    if (window.echarts) return window.echarts;
    const candidates = [
      "/assets/vendor/echarts.min.js",
      "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
    ];
    let last;
    for (const u of candidates) {
      try {
        await loadScript(u);
        if (window.echarts) return window.echarts;
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("echarts_unavailable");
  }

  // ----- fetch JSON from explicit URL or common fallbacks -----
  async function fetchJson(u) {
    const r = await fetch(u, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`http ${r.status} for ${u}`);
    return r.json();
  }
  async function loadSummary() {
    const explicit = window.VAERS_SUMMARY_URL;
    const tries = explicit
      ? [explicit]
      : [
          "/data/vaers-summary.json",
          "/assets/health/analytics/vaers-summary.json",
          "/assets/health/analytics/vaers.json",
          "/data/vaers.json",
        ];
    let lastErr;
    for (const p of tries) {
      try {
        const j = await fetchJson(p);
        console.info("[vaers] loaded", p);
        return j;
      } catch (e) {
        lastErr = e;
      }
    }
    if (window.VAERS_SUMMARY) return window.VAERS_SUMMARY;
    console.error("[vaers] summary not found; tried:", tries, "error:", lastErr);
    throw lastErr || new Error("vaers_summary_not_found");
  }

  // ----- discovery helpers -----
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const num = (v) => (v == null ? 0 : +v);
  const txt = (v) => (v == null ? "" : String(v));

  // Deep-walk the JSON and collect *all* arrays that look like candidate datasets.
  function* walkArrays(node, path = "$") {
    if (Array.isArray(node)) {
      yield { path, arr: node };
      return;
    }
    if (isObj(node)) {
      for (const [k, v] of Object.entries(node)) {
        yield* walkArrays(v, `${path}.${k}`);
      }
    }
  }

  // Heuristics to score an array for each chart type
  function scoreYearly(arr) {
    // Look for objects with a year-like key and totals
    let good = 0;
    for (const r of arr) {
      if (!isObj(r)) continue;
      const keys = Object.keys(r).map((k) => k.toLowerCase());
      const hasYear =
        "year" in r ||
        "Year" in r ||
        keys.includes("y") ||
        /^\d{4}$/.test(txt(r.year));
      const hasTotalLike =
        "total" in r ||
        "DeathsTotal" in r ||
        "reports" in r ||
        "all" in r;
      if (hasYear && hasTotalLike) good++;
    }
    return good >= Math.max(3, Math.floor(arr.length * 0.3)) ? good : 0;
  }

  function scoreMonthly(arr) {
    // Look for objects with month-like strings
    let good = 0;
    for (const r of arr) {
      if (!isObj(r)) continue;
      const m = txt(r.month || r.Month);
      if (!m) continue;
      // e.g., "Jan 2021", "2021-01", "2021-01"
      if (/\d{4}[-/-–—]?\d{2}|[A-Za-z]{3}\s+\d{4}/.test(m)) good++;
    }
    return good >= Math.max(6, Math.floor(arr.length * 0.3)) ? good : 0;
  }

  function scoreOnset(arr) {
    // Objects with day + count (numeric day 0..N)
    let good = 0;
    for (const r of arr) {
      if (!isObj(r)) continue;
      const day = r.day ?? r.d ?? r.x;
      const count = r.count ?? r.n ?? r.y;
      if (Number.isFinite(+day) && Number.isFinite(+count)) good++;
    }
    return good >= Math.max(5, Math.floor(arr.length * 0.3)) ? good : 0;
  }

  function selectDatasets(summary) {
    // Gather candidates
    let bestYear = { score: 0, path: "", arr: [] };
    let bestMonth = { score: 0, path: "", arr: [] };
    let bestCovidOnset = { score: 0, path: "", arr: [] };
    let bestFluOnset = { score: 0, path: "", arr: [] };

    for (const { path, arr } of walkArrays(summary)) {
      const sy = scoreYearly(arr);
      if (sy > bestYear.score) bestYear = { score: sy, path, arr };

      const sm = scoreMonthly(arr);
      if (sm > bestMonth.score) bestMonth = { score: sm, path, arr };

      const so = scoreOnset(arr);
      if (so > 0) {
        // try to infer covid vs flu by path/name
        const p = path.toLowerCase();
        const isCovid = /covid/.test(p);
        const isFlu = /flu/.test(p);
        if (isCovid && so > bestCovidOnset.score)
          bestCovidOnset = { score: so, path, arr };
        else if (isFlu && so > bestFluOnset.score)
          bestFluOnset = { score: so, path, arr };
        else if (!isCovid && !isFlu) {
          // unlabelled: distribute to higher gap
          if (bestCovidOnset.score <= bestFluOnset.score)
            bestCovidOnset = { score: so, path, arr };
          else bestFluOnset = { score: so, path, arr };
        }
      }
    }

    console.info("[vaers] selected",
      { yearly: bestYear.path || null,
        monthly: bestMonth.path || null,
        onsetCovid: bestCovidOnset.path || null,
        onsetFlu: bestFluOnset.path || null });

    return { bestYear, bestMonth, bestCovidOnset, bestFluOnset };
  }

  // Normalize selected arrays to chart-ready formats
  function normalizeYearly(arr) {
    return arr
      .map((r) => {
        const year = txt(r.year ?? r.Year ?? r.y);
        const total =
          num(r.total ?? r.DeathsTotal ?? r.reports ?? r.all ?? r.count);
        const nonCovid = num(
          r.nonCovid ?? r.DeathsNonCovid ?? r.other ?? r.non_covid
        );
        return year ? { year, total, nonCovid } : null;
      })
      .filter(Boolean);
  }
  function normalizeMonthly(arr) {
    return arr
      .map((r) => {
        const month = txt(r.month ?? r.Month);
        // prefer explicit domestic/foreign if present, otherwise fallbacks
        const us = num(
          r.domestic ?? r.US ?? r.us ?? r.UnitedStates ?? r.countUS ?? 0
        );
        const foreign = num(
          r.foreign ?? r.NonUS ?? r.nonUS ?? r.countForeign ?? 0
        );
        return month ? { month, us, foreign } : null;
      })
      .filter(Boolean);
  }
  function normalizeOnset(arr) {
    return arr
      .map((r) => ({
        day: +(
          r.day ??
          r.d ??
          r.x ??
          (Number.isFinite(+r.index) ? r.index : undefined)
        ),
        n: num(r.count ?? r.n ?? r.y),
      }))
      .filter((x) => Number.isFinite(x.day));
  }

  // ----- theme -----
  const THEME = {
    text: "#0f172a",
    sub: "#475569",
    axis: "#94a3b8",
    grid: "#e2e8f0",
    red: "#ef4444",
    blue: "#38bdf8",
    teal: "#14b8a6",
  };

  // ----- renderers -----
  function chartDeathsByYear(el, data, ec) {
    const inst = ec.init(el);
    inst.setOption({
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 48, bottom: 48 },
      tooltip: { trigger: "axis" },
      legend: { top: 8, textStyle: { color: THEME.sub } },
      xAxis: {
        type: "category",
        data: data.map((d) => d.year),
        axisLine: { lineStyle: { color: THEME.axis } },
        axisTick: { show: false },
        axisLabel: { color: THEME.sub, interval: 2 },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: THEME.axis } },
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.sub },
      },
      series: [
        {
          name: "Reports of Death",
          type: "bar",
          data: data.map((d) => d.total),
          itemStyle: { color: THEME.red },
        },
        {
          name: "All Non COVID-Vaccine Deaths",
          type: "bar",
          data: data.map((d) => d.nonCovid),
          itemStyle: { color: THEME.blue },
        },
      ],
    });
    return inst;
  }

  function chartCovidByMonth(el, data, ec) {
    const inst = ec.init(el);
    inst.setOption({
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 48, bottom: 56 },
      tooltip: { trigger: "axis" },
      legend: { top: 8, textStyle: { color: THEME.sub } },
      xAxis: {
        type: "category",
        data: data.map((d) => d.month),
        axisLine: { lineStyle: { color: THEME.axis } },
        axisTick: { show: false },
        axisLabel: { color: THEME.sub, interval: 2, rotate: 40 },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: THEME.axis } },
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.sub },
      },
      series: [
        {
          name: "US/Territories",
          type: "line",
          smooth: true,
          data: data.map((d) => d.us),
          lineStyle: { width: 3, color: THEME.red },
        },
        {
          name: "Foreign",
          type: "line",
          smooth: true,
          data: data.map((d) => d.foreign),
          lineStyle: { width: 3, color: THEME.blue },
        },
      ],
    });
    return inst;
  }

  function chartOnset(el, ds, ec) {
    const max = Math.max(
      19,
      ...ds.covid.map((x) => x.day),
      ...ds.flu.map((x) => x.day)
    );
    const days = Array.from({ length: max + 1 }, (_, i) => i);
    const seq = (arr) =>
      days.map((d) => arr.find((x) => x.day === d)?.n || 0);

    const inst = ec.init(el);
    inst.setOption({
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 48, bottom: 48 },
      tooltip: { trigger: "axis" },
      legend: { top: 8, textStyle: { color: THEME.sub } },
      xAxis: {
        type: "category",
        data: days,
        name: "Days to Onset",
        nameLocation: "middle",
        nameGap: 32,
        axisLine: { lineStyle: { color: THEME.axis } },
        axisTick: { show: false },
        axisLabel: { color: THEME.sub },
      },
      yAxis: {
        type: "value",
        axisLine: { lineStyle: { color: THEME.axis } },
        splitLine: { lineStyle: { color: THEME.grid } },
        axisLabel: { color: THEME.sub },
      },
      series: [
        {
          name: "Covid Vaccines",
          type: "bar",
          data: seq(ds.covid),
          itemStyle: { color: THEME.red },
        },
        {
          name: "Flu Vaccines",
          type: "bar",
          data: seq(ds.flu),
          itemStyle: { color: THEME.teal },
        },
      ],
    });
    return inst;
  }

  // ----- boot -----
  onReady(async () => {
    const c1 = $("#chartDeathsByYear"),
      c2 = $("#chartCovidDeathsByMonth"),
      c3 = $("#chartDaysToOnset");
    if (!c1 && !c2 && !c3) return;

    try {
      const ec = await ensureECharts();
      const summary = await loadSummary();
      const { bestYear, bestMonth, bestCovidOnset, bestFluOnset } =
        selectDatasets(summary);

      const yearly =
        bestYear.score > 0 ? normalizeYearly(bestYear.arr) : [];
      const monthly =
        bestMonth.score > 0 ? normalizeMonthly(bestMonth.arr) : [];
      const onset = {
        covid:
          bestCovidOnset.score > 0
            ? normalizeOnset(bestCovidOnset.arr)
            : [],
        flu:
          bestFluOnset.score > 0
            ? normalizeOnset(bestFluOnset.arr)
            : [],
      };

      const instances = [];
      if (c1 && yearly.length) instances.push(chartDeathsByYear(c1, yearly, ec));
      if (c2 && monthly.length)
        instances.push(chartCovidByMonth(c2, monthly, ec));
      if (c3 && (onset.covid.length || onset.flu.length))
        instances.push(chartOnset(c3, onset, ec));

      if (instances.length === 0) {
        const msg = document.getElementById("charts-unavailable");
        if (msg) msg.textContent = "Charts unavailable.";
      }

      addEventListener(
        "resize",
        () => instances.forEach((i) => i.resize()),
        { passive: true }
      );
    } catch (e) {
      console.error("[vaers-charts]", e);
      const msg = document.getElementById("charts-unavailable");
      if (msg) msg.textContent = "Charts unavailable.";
    }
  });
})();
