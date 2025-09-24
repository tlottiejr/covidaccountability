#!/usr/bin/env node
/**
 * Build public/data/vaers-summary.json from EXTRACTED CSVs (no ZIP libs).
 * Reads DOMESTIC: *VAERSDATA.csv + *VAERSVAX.csv
 * Reads NON-DOMESTIC: NonDomesticVAERSDATA.csv + NonDomesticVAERSVAX.csv
 *
 * Required env:
 *   VAERS_DATA_DIR      -> path to extracted domestic CSVs
 *   VAERS_NONDOM_DIR    -> path to extracted non-domestic CSVs
 *
 * Dev deps: csv-parse (already installed in your repo)
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";

const OUT_PATH = path.resolve("public/data/vaers-summary.json");
const US_TERR = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","PR","GU","VI","AS","MP","UM"]);

function Y(s){ if(!s) return null; const d=new Date(s); return Number.isFinite(d.valueOf())?d.getFullYear():null; }
function YM(s){ if(!s) return null; const d=new Date(s); return Number.isFinite(d.valueOf())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`:null; }
const toInt = (n)=>{ const v = Number.parseInt(n,10); return Number.isFinite(v)?v:null; };
const isDomestic = (state)=> !state || state.toUpperCase()==="UNKNOWN" || US_TERR.has(state.toUpperCase());

const ageBin = (ageYears) => {
  const a = typeof ageYears==="number"?ageYears:Number(ageYears);
  if (!Number.isFinite(a) || a<=0) return "Unknown";
  if (a < 5) return "0.5–5";
  if (a < 12) return "5–12";
  if (a < 25) return "12–25";
  if (a < 51) return "25–51";
  if (a < 66) return "51–66";
  if (a < 81) return "66–81";
  if (a <=121) return "81–121";
  return "Unknown";
};

function listCsvs(dir, pattern){
  return fs.readdirSync(dir).filter(f=>pattern.test(f)).map(f=>path.join(dir,f));
}

const DOM_DIR = process.env.VAERS_DATA_DIR;
const NDOM_DIR = process.env.VAERS_NONDOM_DIR;
if (!DOM_DIR || !NDOM_DIR) {
  console.error("Missing VAERS_DATA_DIR or VAERS_NONDOM_DIR");
  process.exit(1);
}

// Gather files
const domDATA = listCsvs(DOM_DIR, /VAERSDATA\.csv$/i);
const domVAX  = listCsvs(DOM_DIR, /VAERSVAX\.csv$/i);
const ndDATA  = listCsvs(NDOM_DIR, /NonDomesticVAERSDATA\.csv$/i);
const ndVAX   = listCsvs(NDOM_DIR, /NonDomesticVAERSVAX\.csv$/i);
if (domDATA.length===0 || domVAX.length===0) {
  console.error("Domestic CSVs not found (expect *VAERSDATA.csv and *VAERSVAX.csv)");
  process.exit(1);
}
if (ndDATA.length===0 || ndVAX.length===0) {
  console.warn("Non-Domestic VAX/DATA missing; 'Foreign' series will be zero and COVID/Flu split may be incomplete.");
}

// Index of vaccine info per VAERS_ID (minimal)
const vaxIndex = new Map(); // id -> { covid:boolean, flu:boolean, manus:Set }
async function indexVax(file){
  await pipeline(
    createReadStream(file),
    parse({ columns:true }),
    async function*(source){ for await (const r of source) {
      const id = r.VAERS_ID;
      if (!id) continue;
      const type = (r.VAX_TYPE||"").toUpperCase();
      const manu = (r.VAX_MANU||"Unknown").trim() || "Unknown";
      let rec = vaxIndex.get(id);
      if (!rec) { rec = { covid:false, flu:false, manus:null }; vaxIndex.set(id, rec); }
      if (type === "COVID19") { rec.covid = true; (rec.manus ??= new Set()).add(manu); }
      if (type.startsWith("FLU")) { rec.flu = true; }
    } }
  );
}

function inc(obj, key, by=1){ obj[key] = (obj[key]||0) + by; }
function sortedEntries(obj){ return Object.entries(obj).sort((a,b)=> String(a[0]).localeCompare(String(b[0]))); }

const reportsByYear_all = {};
const reportsByYear_dom = {};
const covidDeathsByMonth_total = {};
const covidDeathsByMonth_dom = {};
const covidDeathsByMonth_for = {};
const daysToOnset_covid = Array(20).fill(0);
const daysToOnset_flu   = Array(20).fill(0);
const mfrCounts = new Map();
const sexCounts = new Map();
const ageCounts = new Map();

let totalAllReports=0, totalAllDeaths=0, totalCovidDeaths=0, totalCovidHosp=0, totalCovidReports=0;
let maxDate = null;

async function consumeData(file){
  await pipeline(
    createReadStream(file),
    parse({ columns:true }),
    async function*(source){ for await (const r of source) {
      const id = r.VAERS_ID;
      const vax = vaxIndex.get(id) || {covid:false, flu:false, manus:null};
      const y  = Y(r.RECVDATE);
      const ym = YM(r.RECVDATE);
      if (r.RECVDATE) { const d = new Date(r.RECVDATE); if (!maxDate || d>maxDate) maxDate = d; }

      totalAllReports++;

      if (y != null) {
        inc(reportsByYear_all, y);
        if (isDomestic(r.STATE)) inc(reportsByYear_dom, y);
      }

      const died = (r.DIED||"").toUpperCase()==="Y";
      const hosp = (r.HOSPITAL||"").toUpperCase()==="Y";

      if (vax.covid) totalCovidReports++;
      if (died) totalAllDeaths++;
      if (vax.covid && hosp) totalCovidHosp++;

      if (died && vax.covid && ym) {
        inc(covidDeathsByMonth_total, ym);
        if (isDomestic(r.STATE)) inc(covidDeathsByMonth_dom, ym); else inc(covidDeathsByMonth_for, ym);
        totalCovidDeaths++;

        if (vax.manus) {
          for (const manu of vax.manus) mfrCounts.set(manu, (mfrCounts.get(manu)||0)+1);
        }
        const sx = ((r.SEX||"").toUpperCase()==="M") ? "Male"
                : ((r.SEX||"").toUpperCase()==="F") ? "Female" : "Unknown";
        sexCounts.set(sx, (sexCounts.get(sx)||0)+1);
        const bin = ageBin(toInt(r.AGE_YRS));
        ageCounts.set(bin, (ageCounts.get(bin)||0)+1);
      }

      if (died && (vax.covid || vax.flu)) {
        let days = toInt(r.NUMDAYS);
        if (!Number.isFinite(days)) {
          const onset = r.ONSET_DATE ? new Date(r.ONSET_DATE) : null;
          const vaxd  = r.VAX_DATE ? new Date(r.VAX_DATE) : null;
          if (onset && vaxd && Number.isFinite(onset.valueOf()) && Number.isFinite(vaxd.valueOf())) {
            days = Math.round((onset - vaxd) / (1000*60*60*24));
          }
        }
        if (Number.isFinite(days)) {
          const bucket = Math.max(0, Math.min(19, days));
          if (vax.covid) daysToOnset_covid[bucket] += 1;
          if (vax.flu)   daysToOnset_flu[bucket]   += 1;
        }
      }
    } }
  );
}

(async () => {
  console.time("vaers-build");
  console.log("Indexing vaccine rows…");
  for (const f of domVAX)  await indexVax(f);
  for (const f of ndVAX)   await indexVax(f);  // may be empty

  console.log("Streaming data rows…");
  for (const f of domDATA) await consumeData(f);
  for (const f of ndDATA)  await consumeData(f); // may be empty

  const manufacturer = Array.from(mfrCounts.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  const sex = Array.from(sexCounts.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  const ageOrder = ["0.5–5","5–12","12–25","25–51","51–66","66–81","81–121","Unknown"];
  const age_bins = ageOrder.map(k => [k, ageCounts.get(k)||0]);
  age_bins.push(["All Ages", totalCovidDeaths]);

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
      all: sortedEntries(reportsByYear_all),
      us_terr_unk: sortedEntries(reportsByYear_dom)
    },
    covid_deaths_by_month: {
      total: sortedEntries(covidDeathsByMonth_total),
      us_terr_unk: sortedEntries(covidDeathsByMonth_dom),
      foreign: sortedEntries(covidDeathsByMonth_for)
    },
    deaths_days_to_onset: {
      covid: daysToOnset_covid.map((v,i)=>[i,v]),
      flu:   daysToOnset_flu.map((v,i)=>[i,v])
    },
    covid_deaths_breakdowns: { manufacturer, sex, age_bins },
    provenance: { mode: "local-extracted", data_dir: DOM_DIR, nondom_dir: NDOM_DIR }
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  console.timeEnd("vaers-build");
  console.log(`Wrote ${OUT_PATH} (as_of ${summary.as_of})`);
})();
