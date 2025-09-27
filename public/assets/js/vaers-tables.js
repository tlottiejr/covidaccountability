/* VAERS breakdown tables (manufacturer / sex / age)
   This version prefers the page's data-summary attribute, then window.VAERS_SUMMARY_URL,
   and finally falls back to /data/vaers-summary.json. It is defensive and will no-op if
   #vaers-breakdowns is not present.
*/
(function () {
  const root = document.getElementById("vaers-breakdowns");
  if (!root) return;

  // Determine data URL deterministically: attribute → global → default
  const SECTION =
    document.getElementById("vaers-charts-section") ||
    document.querySelector("[data-summary]");
  const DATA_URL =
    (SECTION && SECTION.dataset && SECTION.dataset.summary) ||
    (typeof window !== "undefined" && window.VAERS_SUMMARY_URL) ||
    "/data/vaers-summary.json";

  try {
    console.log("[vaers-tables] data URL:", DATA_URL);
  } catch (_) {}

  // Utils
  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US")
      : ("" + (n ?? "")).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const td = (text, opts = {}) => {
    const el = document.createElement("td");
    el.textContent = text == null ? "" : text;
    if (opts.className) el.className = opts.className;
    if (opts.align) el.style.textAlign = opts.align;
    return el;
  };

  const th = (text) => {
    const el = document.createElement("th");
    el.textContent = text;
    return el;
  };

  // Clear and (re)build a 6-column table:
  // Manufacturer | Cases | Sex | Cases | Age | Cases
  const buildSkeleton = () => {
    root.innerHTML = "";
    const table = document.createElement("table");
    table.className = "vaers-table"; // relies on your existing CSS

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    hr.append(
      th("Manufacturer"),
      th("Cases"),
      th("Sex"),
      th("Cases"),
      th("Age"),
      th("Cases")
    );
    thead.appendChild(hr);

    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    root.appendChild(table);
    return { table, tbody };
  };

  const normalize = (items = []) =>
    (Array.isArray(items) ? items : []).map((x) => ({
      category: String(x.category ?? ""),
      count: Number(x.count ?? 0),
    }));

  const render = (summary) => {
    if (!summary || !summary.covid_deaths_breakdowns) return;

    const { manufacturer, sex, age_bins } = summary.covid_deaths_breakdowns;

    const m = normalize(manufacturer);
    const s = normalize(sex);
    const a = normalize(age_bins);

    // Sorts to match the OpenVAERS presentation
    const orderBy = (arr, wanted) => {
      if (!wanted) return arr;
      const map = new Map(wanted.map((k, i) => [k, i]));
      return [...arr].sort((x, y) => {
        const ix = map.has(x.category) ? map.get(x.category) : 1e9;
        const iy = map.has(y.category) ? map.get(y.category) : 1e9;
        return ix - iy || y.count - x.count || x.category.localeCompare(y.category);
      });
    };

    const mOrdered = orderBy(m, [
      "UNKNOWN MANUFACTURER",
      "NOVAVAX",
      "JANSSEN",
      "MODERNA",
      "PFIZER\\BIONTECH",
    ]);
    const sOrdered = orderBy(s, ["Male", "Female", "Unknown"]);
    const aOrdered = orderBy(a, [
      "0.5–5",
      "5–12",
      "12–25",
      "25–51",
      "51–66",
      "66–81",
      "81–121",
      "Unknown",
      "All Ages",
    ]);

    const rows = Math.max(mOrdered.length, sOrdered.length, aOrdered.length);

    const { tbody } = buildSkeleton();

    for (let i = 0; i < rows; i++) {
      const tr = document.createElement("tr");

      // Manufacturer + cases
      if (i < mOrdered.length) {
        tr.append(td(mOrdered[i].category), td(fmt(mOrdered[i].count), { align: "right" }));
      } else {
        tr.append(td(""), td(""));
      }

      // Sex + cases
      if (i < sOrdered.length) {
        tr.append(td(sOrdered[i].category), td(fmt(sOrdered[i].count), { align: "right" }));
      } else {
        tr.append(td(""), td(""));
      }

      // Age + cases
      if (i < aOrdered.length) {
        tr.append(td(aOrdered[i].category), td(fmt(aOrdered[i].count), { align: "right" }));
      } else {
        tr.append(td(""), td(""));
      }

      tbody.appendChild(tr);
    }
  };

  fetch(DATA_URL, { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
    .then((json) => render(json))
    .catch((err) => {
      console.error("[vaers-tables] failed to load data:", err);
    });
})();
