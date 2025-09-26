// public/assets/js/vaers-tables.js
(function () {
  const $ = (s)=>document.querySelector(s);
  async function loadSummary(){
    const url=window.VAERS_SUMMARY_URL||"/data/vaers-summary.json";
    const res=await fetch(url,{cache:"no-cache"}); 
    if(!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`); 
    return res.json();
  }
  function renderBreakdowns(el, breakdowns){
    if(!el) return;
    const {manufacturer=[], sex=[], age_bins=[]} = breakdowns||{};
    const section = (title, rows)=>`
      <h4 style="margin:18px 0 8px 0">${title}</h4>
      <table class="table-simple">
        <thead><tr><th>Category</th><th style="text-align:right">Count</th></tr></thead>
        <tbody>
          ${rows.map(([k,v])=>`<tr><td>${k||"Unknown"}</td><td style="text-align:right">${Number(v).toLocaleString()}</td></tr>`).join("")}
        </tbody>
      </table>`;
    el.innerHTML = section("Manufacturer (COVID, US/Territories)", manufacturer)
                 + section("Sex (COVID, US/Territories)", sex)
                 + section("Age (COVID, US/Territories)", age_bins);
  }
  document.addEventListener("DOMContentLoaded", async ()=>{
    try{
      const summary = await loadSummary();
      renderBreakdowns($("#vaersBreakdownsTable"), summary.covid_deaths_breakdowns);
    }catch(e){
      console.error(e);
    }
  });
})();
