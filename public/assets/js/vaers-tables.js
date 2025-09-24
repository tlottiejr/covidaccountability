(function () {
  async function load() {
    const root = document.getElementById("vaers-breakdowns");
    if (!root) return;
    const res = await fetch("/data/vaers-summary.json", { cache: "no-cache" });
    if (!res.ok) return;
    const d = await res.json();

    const fmt = new Intl.NumberFormat();

    const makeCol = (title, rows) => {
      const col = document.createElement("div");
      col.className = "table-col";
      col.innerHTML = `
        <div class="table-card">
          <div class="table-head">
            <span>${title}</span><span>Cases</span>
          </div>
          <div class="table-body"></div>
        </div>`;
      const body = col.querySelector(".table-body");
      rows.forEach(([k,v]) => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `<span>${k}</span><span>${fmt.format(v)}</span>`;
        body.appendChild(row);
      });
      return col;
    };

    root.classList.add("vaers-wide-table");
    root.innerHTML = "";
    root.appendChild(makeCol("Manufacturer", d.covid_deaths_breakdowns.manufacturer));
    root.appendChild(makeCol("Sex", d.covid_deaths_breakdowns.sex));
    root.appendChild(makeCol("Age", d.covid_deaths_breakdowns.age_bins));
  }

  if (document.readyState === "complete" || document.readyState === "interactive") load();
  else document.addEventListener("DOMContentLoaded", load);
})();
