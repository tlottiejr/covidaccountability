#!/usr/bin/env node
/**
 * Build public/data/vaers-summary.json from official VAERS CSVs (domestic + non-domestic).
 * No scraping. Output powers:
 * - reports_by_year (all vs US/Terr./Unk.)
 * - red-box totals (overall, deaths, hospitalizations, covid reports)
 * - covid_deaths_by_month (total, domestic, foreign)
 * - deaths_days_to_onset (covid vs flu)
 * - covid_deaths_breakdowns (manufacturer, sex, age bins) + All Ages
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import AdmZip from "adm-zip";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("csv-parse/sync");

const cfg = JSON.parse(fs.readFileSync(new URL("./vaers-config.json", import.meta.url)));
const OUT = path.resolve(process.cwd(), cfg.output);

// ---------- small helpers ----------
const fetchBuffer = (url) =>
  new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchBuffer(res.headers.location));
        }
        if (res.statusCode !== 200) return reject(new Error(`GET ${url} -> ${res.statusCode}`));
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });

const Y = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.valueOf()) ? d.getFullYear() : null;
};
const YM = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.valueOf()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
};
const toInt = (n) => {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : null;
};
const isDomestic = (state) => {
  if (state == null || state === "" || String(state).toUpperCase() === "UNKNOWN") return true;
  return cfg.us_states_and_territories.includes(String(state).toUpperCase());
};
const hasCovid = (rows) => rows?.some((r) => (r.VAX_TYPE || "").toUpperCase() === "COVID19");
const hasFlu = (rows) => rows?.some((r) => (r.VAX_TYPE || "").toUpperCase().startsWith("FLU"));

// ---------- load & parse ----------
async function loadZipCsvs(zipUrl) {
  const buf = zipUrl.startsWith("http") ? await fetchBuffer(zipUrl) : fs.readFileSync(zipUrl);
  const zip = new AdmZip(buf);
  const dataEntry = zip.getEntries().find((e) => /vaersdata\.csv$/i.test(e.entryName));
  const vaxEntry = zip.getEntries().find((e) => /vaersvax\.csv$/i.test(e.entryName));
  if (!dataEntry || !vaxEntry) throw new Error("Missing VAERSDATA.csv or VAERSVAX.csv in zip");
  return {
    dataCsv: dataEntry.getData(),
    vaxCsv: vaxEntry.getData(),
  };
}

function parseCsv(buf) {
  return parse(buf, { columns: true, skip_empty_lines: true });
}

(async function main() {
  const dom = await loadZipCsvs(process.env.VAERS_ZIP_PATH || cfg.source.data_zip);
  const non = await loadZipCsvs(process.env.VAERS_NONDOM_ZIP_PATH || cfg.source.non_domestic_zip);

  const data = parseCsv(Buffer.concat([dom.dataCsv, non.dataCsv]));
  const vax = parseCsv(Buffer.concat([dom.vaxCsv, non.vaxCsv]));

  // index vax rows by VAERS_ID
  const vaxById = new Map();
  for (const r of vax) {
    const id = r.VAERS_ID;
    if (!vaxById.has(id)) vaxById.set(id, []);
    vaxById.get(id).push(r);
  }

  // aggregates
  const reportsByYear_all = {};
  const reportsByYear_dom = {};
  const covidDeathsByMonth_total = {};
  const covidDeathsByMonth_dom = {};
  const covidDeathsByMonth_for = {};

  const daysToOnset_covid = Array(20).fill(0);
  const daysToOnset_flu = Array(20).fill(0);

  const mfrCounts = new Map(); // covid deaths by VAX_MANU
  const sexCounts = new Map(); // covid deaths by SEX
  const ageCounts = new Map(); // covid deaths by age bin

  let totalAllReports = 0;
  let totalAllDeaths = 0;
  let totalCovidDeaths = 0;
  let totalCovidHosp = 0;
  let totalCovidReports = 0;

  let maxDate = null;

  const ageBin = (ageYears) => {
    const a = typeof ageYears === "number" ? ageYears : Number(ageYears);
    if (!Number.isFinite(a) || a <= 0) return "Unknown";
    if (a < 5) return "0.5–5";
    if (a < 12) return "5–12";
    if (a < 25) return "12–25";
    if (a < 51) return "25–51";
    if (a < 66) return "51–66";
    if (a < 81) return "66–81";
    if (a <= 121) return "81–121";
    return "Unknown";
  };

  for (const row of data) {
    const id = row.VAERS_ID;
    const vaccs = vaxById.get(id) || [];
    const y = Y(row.RECVDATE);
    const ym = YM(row.RECVDATE);
    if (row.RECVDATE) {
      const d = new Date(row.RECVDATE);
      if (!maxDate || d > maxDate) maxDate = d;
    }

    totalAllReports++;

    // reports by year
    if (y != null) {
      reportsByYear_all[y] = (reportsByYear_all[y] || 0) + 1;
      if (isDomestic(row.STATE)) {
        reportsByYear_dom[y] = (reportsByYear_dom[y] || 0) + 1;
      }
    }

    // red-box: any covid report?
    const isCovid = hasCovid(vaccs);
    if (isCovid) totalCovidReports++;

    // deaths + hosp
    const died = (row.DIED || "").toUpperCase() === "Y";
    const hosp = (row.HOSPITAL || "").toUpperCase() === "Y";
    if (died) totalAllDeaths++;
    if (isCovid && hosp) totalCovidHosp++;

    // covid deaths by month (domestic/foreign)
    if (died && isCovid && ym) {
      covidDeathsByMonth_total[ym] = (covidDeathsByMonth_total[ym] || 0) + 1;
      if (isDomestic(row.STATE)) {
        covidDeathsByMonth_dom[ym] = (covidDeathsByMonth_dom[ym] || 0) + 1;
      } else {
        covidDeathsByMonth_for[ym] = (covidDeathsByMonth_for[ym] || 0) + 1;
      }
      totalCovidDeaths++;

      // manufacturer breakdown: count once per manufacturer present
      const seen = new Set();
      for (const v of vaccs) {
        if ((v.VAX_TYPE || "").toUpperCase() !== "COVID19") continue;
        const manu = (v.VAX_MANU || "Unknown").trim() || "Unknown";
        if (seen.has(manu)) continue;
        seen.add(manu);
        mfrCounts.set(manu, (mfrCounts.get(manu) || 0) + 1);
      }

      // sex breakdown
      const sex = ((row.SEX || "Unknown").toUpperCase() === "M") ? "Male"
                : ((row.SEX || "Unknown").toUpperCase() === "F") ? "Female"
                : "Unknown";
      sexCounts.set(sex, (sexCounts.get(sex) || 0) + 1);

      // age breakdown
      const bin = ageBin(toInt(row.AGE_YRS));
      ageCounts.set(bin, (ageCounts.get(bin) || 0) + 1);
    }

    // days to onset (covid vs flu) for deaths
    if (died) {
      let days = toInt(row.NUMDAYS);
      if (!Number.isFinite(days)) {
        const onset = row.ONSET_DATE ? new Date(row.ONSET_DATE) : null;
        const vaxd = row.VAX_DATE ? new Date(row.VAX_DATE) : null;
        if (onset && vaxd && Number.isFinite(onset.valueOf()) && Number.isFinite(vaxd.valueOf())) {
          days = Math.round((onset - vaxd) / (1000 * 60 * 60 * 24));
        }
      }
      if (Number.isFinite(days)) {
        const bucket = Math.max(0, Math.min(19, days));
        if (hasCovid(vaccs)) daysToOnset_covid[bucket] += 1;
        if (hasFlu(vaccs)) daysToOnset_flu[bucket] += 1;
      }
    }
  }

  // finalize tables
  const manufacturer = Array.from(mfrCounts.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  const sex = Array.from(sexCounts.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  const ageOrder = ["0.5–5","5–12","12–25","25–51","51–66","66–81","81–121","Unknown"];
  const age_bins = ageOrder.map(k => [k, ageCounts.get(k) || 0]);
  age_bins.push(["All Ages", totalCovidDeaths]);

  const fmtSeriesMap = (obj) => Object.entries(obj).sort((a,b)=> a[0].localeCompare(b[0]));
  const summary = {
    as_of: maxDate ? maxDate.toISOString().slice(0,10) : null,
    totals: {
      vaers_all: totalAllReports,
      deaths_all: totalAllDeaths,
      covid_deaths: totalCovidDeaths,
      covid_hospitalizations: totalCovidHosp,
      covid_reports: totalCovidReports
    },
    reports_by_year: {
      all: fmtSeriesMap(reportsByYear_all),
      us_terr_unk: fmtSeriesMap(reportsByYear_dom)
    },
    covid_deaths_by_month: {
      total: fmtSeriesMap(covidDeathsByMonth_total),
      us_terr_unk: fmtSeriesMap(covidDeathsByMonth_dom),
      foreign: fmtSeriesMap(covidDeathsByMonth_for)
    },
    deaths_days_to_onset: {
      covid: daysToOnset_covid.map((v,i)=>[i,v]),
      flu: daysToOnset_flu.map((v,i)=>[i,v])
    },
    covid_deaths_breakdowns: {
      manufacturer,
      sex,
      age_bins
    },
    provenance: {
      source: "VAERS official CSVs (domestic + nondomestic)",
      urls: [cfg.source.data_zip, cfg.source.non_domestic_zip]
    }
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT} (as_of ${summary.as_of})`);
})();
