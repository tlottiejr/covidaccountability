(function () {
  const $ = (s) => document.querySelector(s);
  const css = getComputedStyle(document.documentElement);
  const cPrimary = css.getPropertyValue("--primary").trim() || "#2a6df4";
  const cInk = css.getPropertyValue("--ink").trim() || "#111";
  const cLine = css.getPropertyValue("--line").trim() || "#e5e7eb";
  const cAccent = css.getPropertyValue("--accent").trim() || "#0ea5e9";
  const cMuted = css.getPropertyValue("--muted-ink").trim() || "#64748b";

  async function load() {
    const res = await fetch("/data/vaers-summary.json", { cache: "no-cache" });
    if (!res.ok) return;
    const d = await res.json();
    const fmt = new Intl.NumberFormat();

    const asof = document.getElementById("vaers-asof");
    if (asof && d.as_of) asof.textContent = `Data through ${new Date(d.as_of).toLocaleDateString()}`;

    // Chart 1: All reports by year (two series)
    const c1El = $("#vaers-by-year");
    if (c1El && window.echarts) {
      const chart = echarts.init(c1El);
      const years = d.reports_by_year.all.map(([y]) => y);
      const all = d.reports_by_year.all.map(([,v]) => v);
      const dom = d.reports_by_year.us_terr_unk.map(([,v]) => v);
      chart.setOption({
        tooltip: { trigger: "axis", valueFormatter: (v)=>fmt.format(v) },
        legend: { data: ["All VAERS Reports", "US/Terr./Unk." ] },
        grid: { left: 50, right: 20, top: 30, bottom: 45 },
        xAxis: { type: "category", data: years, axisTick: { alignWithLabel: true } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: cLine } } },
        series: [
          { name: "All VAERS Reports", type: "bar", data: all, emphasis: { focus: "series" }},
          { name: "US/Terr./Unk.", type: "bar", data: dom, emphasis: { focus: "series" }}
        ]
      });
    }

    // Chart 3: COVID deaths by month (3 lines)
    const c2El = $("#vaers-covid-deaths-monthly");
    if (c2El && window.echarts) {
      const chart = echarts.init(c2El);
      const months = d.covid_deaths_by_month.total.map(([m]) => m);
      chart.setOption({
        tooltip: { trigger: "axis", valueFormatter: (v)=>fmt.format(v) },
        legend: { data: ["Total", "US/Terr./Unk.", "Foreign"] },
        grid: { left: 50, right: 20, top: 30, bottom: 45 },
        xAxis: { type: "category", data: months },
        yAxis: { type: "value", splitLine: { lineStyle: { color: cLine } } },
        series: [
          { name: "Total", type: "line", data: d.covid_deaths_by_month.total.map(([,v])=>v), symbolSize: 4 },
          { name: "US/Terr./Unk.", type: "line", data: d.covid_deaths_by_month.us_terr_unk.map(([,v])=>v), symbolSize: 4 },
          { name: "Foreign", type: "line", data: d.covid_deaths_by_month.foreign.map(([,v])=>v), symbolSize: 4 }
        ]
      });
    }

    // Chart 4: Deaths by days to onset (covid vs flu)
    const c3El = $("#vaers-days-to-onset");
    if (c3El && window.echarts) {
      const chart = echarts.init(c3El);
      const days = Array.from({length:20}, (_,i)=>i);
      chart.setOption({
        tooltip: { trigger: "axis", valueFormatter: (v)=>fmt.format(v) },
        legend: { data: ["COVID Vaccines", "Flu Vaccines"] },
        grid: { left: 50, right: 20, top: 30, bottom: 45 },
        xAxis: { type: "category", data: days },
        yAxis: { type: "value", splitLine: { lineStyle: { color: cLine } } },
        series: [
          { name: "COVID Vaccines", type: "bar", data: d.deaths_days_to_onset.covid.map(([,v])=>v) },
          { name: "Flu Vaccines", type: "bar", data: d.deaths_days_to_onset.flu.map(([,v])=>v) }
        ]
      });
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") load();
  else document.addEventListener("DOMContentLoaded", load);
})();
