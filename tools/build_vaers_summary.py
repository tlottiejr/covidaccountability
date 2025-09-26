#!/usr/bin/env python3
import os, io, sys, json, zipfile, csv, argparse, glob
from datetime import datetime, date
from collections import defaultdict
from itertools import chain

try:
    csv.field_size_limit(10_000_000)
except Exception:
    pass

MIN_YEAR, MAX_YEAR = 1990, 2100
COVID_KEYS = {"COVID19", "COVID-19", "COVID"}
FLU_KEYS   = {"FLU", "FLU3", "FLUN3", "FLUA", "FLUCOV", "H1N1", "FLU4"}

def parse_date(s):
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try: return datetime.strptime(s, fmt).date()
        except: pass
    return None

def year_of(d): return d.year if isinstance(d, (datetime, date)) else None
def month_key(d): return f"{d.year:04d}-{d.month:02d}" if isinstance(d,(datetime,date)) else None
def clamp_day(delta): return 0 if (delta is not None and delta < 0) else delta

# ---------- CSV iterators (read ALL matching files) ----------
def iter_csv_from_zip(zf: zipfile.ZipFile, token):
    names = [n for n in zf.namelist() if token.lower() in n.lower() and n.lower().endswith(".csv")]
    if not names:
        raise FileNotFoundError(f"No CSV containing '{token}' in {zf.filename}")
    for n in sorted(names):
        data = zf.read(n)
        f = io.StringIO(data.decode("utf-8", errors="ignore"))
        rdr = csv.DictReader(f)
        for r in rdr:
            yield { (k or "").strip(): (v or "").strip() for k,v in r.items() }

def iter_csv_from_dir(root, token):
    pats = [f"**/*{token}*.csv", f"**/{token.upper()}*.csv", f"**/{token.lower()}*.csv"]
    files = []
    for p in pats: files += glob.glob(os.path.join(root, p), recursive=True)
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        raise FileNotFoundError(f"No CSV containing '{token}' under {root}")
    for path in sorted(files):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            rdr = csv.DictReader(f)
            for r in rdr:
                yield { (k or "").strip(): (v or "").strip() for k,v in r.items() }

def load_vaers_source(path, is_foreign=False):
    """returns (data_iter, vax_iter) as generators; DATA rows get _foreign flag"""
    if os.path.isdir(path):
        data_iter = iter_csv_from_dir(path, "VAERSDATA")
        vax_iter  = iter_csv_from_dir(path, "VAERSVAX")
    else:
        try:
            zf = zipfile.ZipFile(path, "r")
        except zipfile.BadZipFile:
            raise SystemExit(f"❌ Not a ZIP: {path}")
        try:
            data_iter = iter_csv_from_zip(zf, "VAERSDATA")
            vax_iter  = iter_csv_from_zip(zf, "VAERSVAX")
        except NotImplementedError:
            raise SystemExit(
                f"\n❌ {os.path.basename(path)} uses a compression Python can't read.\n"
                f"   Extract with 7z and re-run with --dom/--frn pointing to folders."
            )

    def data_with_flag():
        for r in data_iter:
            r["_foreign"] = is_foreign
            yield r

    return data_with_flag(), vax_iter

def build_type_index(vax_iter):
    """Stream build VAERS_ID -> set(VAX_TYPE) and earliest VAX_DATE per VAERS_ID"""
    types = defaultdict(set)
    vdate = {}
    seen = 0
    for r in vax_iter:
        vid = r.get("VAERS_ID","").strip()
        if not vid: 
            continue
        t = r.get("VAX_TYPE","").strip().upper()
        if t: types[vid].add(t)
        vd = parse_date(r.get("VAX_DATE",""))
        if vd and (vid not in vdate or vd < vdate[vid]): vdate[vid] = vd
        seen += 1
        if seen % 250_000 == 0:
            print(f"[index] processed VAERSVAX rows: {seen}", flush=True)
    return types, vdate

def summarize(dom_path, frn_path, out_json):
    dom_data_iter, dom_vax_iter = load_vaers_source(dom_path, is_foreign=False)
    frn_data_iter, frn_vax_iter = load_vaers_source(frn_path, is_foreign=True)

    # Build index by streaming both vax iterators
    print("[index] building vaccine type/date index...", flush=True)
    types, vax_date_index = build_type_index(chain(dom_vax_iter, frn_vax_iter))
    print(f"[index] VAERS_ID with vax info: {len(types)}", flush=True)

    # Yearly (DOMESTIC ONLY to match OpenVAERS)
    deaths_by_year_domestic            = defaultdict(int)  # red bars
    non_covid_deaths_by_year_domestic  = defaultdict(int)  # cyan bars

    # Monthly (TOTAL + split)
    covid_month_total = defaultdict(int)   # US+Foreign
    covid_month_us    = defaultdict(int)   # domestic only
    covid_month_fore  = defaultdict(int)   # foreign only

    # Days-to-onset (DOMESTIC ONLY)
    d2o_covid_exact = defaultdict(int); d2o_covid_gte20 = 0; d2o_covid_unk = 0
    d2o_flu_exact   = defaultdict(int); d2o_flu_gte20   = 0; d2o_flu_unk   = 0

    print("[data] streaming VAERSDATA (domestic + foreign)...", flush=True)
    seen = 0
    for r in chain(dom_data_iter, frn_data_iter):
        vid = r.get("VAERS_ID","").strip()
        if not vid: 
            continue
        if r.get("DIED","").strip().upper() != "Y": 
            continue

        recvd = parse_date(r.get("RECVDATE",""))
        y = year_of(recvd)
        if not y or y < MIN_YEAR or y >= MAX_YEAR:
            continue

        tset = {t.upper() for t in types.get(vid, set())}
        has_covid = bool(tset & COVID_KEYS)
        has_flu   = bool(tset & FLU_KEYS)

        # ---- Yearly (DOMESTIC ONLY)
        if not r.get("_foreign"):
            deaths_by_year_domestic[y] += 1
            if not has_covid:                     # non-COVID domestic
                non_covid_deaths_by_year_domestic[y] += 1

        # ---- Monthly (TOTAL + split) by RECVDATE
        mk = month_key(recvd)
        if mk and has_covid:                      # OpenVAERS monthly is COVID-only
            covid_month_total[mk] += 1
            (covid_month_fore if r.get("_foreign") else covid_month_us)[mk] += 1

        # ---- Days to Onset (DOMESTIC ONLY)
        if not r.get("_foreign"):
            onset = parse_date(r.get("ONSET_DATE",""))
            vdate = vax_date_index.get(vid)
            if onset and vdate:
                d = clamp_day((onset - vdate).days)
                if d is not None:
                    if has_covid:
                        if 0 <= d <= 19: d2o_covid_exact[d] += 1
                        elif d >= 20:    d2o_covid_gte20   += 1
                    if has_flu:
                        if 0 <= d <= 19: d2o_flu_exact[d] += 1
                        elif d >= 20:    d2o_flu_gte20   += 1
            else:
                if has_covid: d2o_covid_unk += 1
                if has_flu:   d2o_flu_unk   += 1

        seen += 1
        if seen % 250_000 == 0:
            print(f"[data] processed VAERSDATA deaths: {seen}", flush=True)

    years = sorted(set(deaths_by_year_domestic) | set(non_covid_deaths_by_year_domestic))
    years = [y for y in years if MIN_YEAR <= y < MAX_YEAR]

    deaths_by_year_all_arr   = [[str(y), deaths_by_year_domestic.get(y,0)]            for y in years]
    non_covid_by_year_arr    = [[str(y), non_covid_deaths_by_year_domestic.get(y,0)]  for y in years]

    months = sorted(covid_month_total)
    covid_month_total_arr = [[m, covid_month_total[m]] for m in months]
    covid_month_us_arr    = [[m, covid_month_us[m]]    for m in months]
    covid_month_fore_arr  = [[m, covid_month_fore[m]]  for m in months]

    d2o_covid_exact_arr = [[str(i), d2o_covid_exact.get(i,0)] for i in range(20)]
    d2o_flu_exact_arr   = [[str(i), d2o_flu_exact.get(i,0)]   for i in range(20)]

    # NOTE: we keep your existing JSON keys so the frontend doesn't change:
    #   - deaths_by_year.all                -> domestic all-vaccine deaths (red)
    #   - covid_deaths_by_year.all          -> domestic NON-COVID deaths (cyan)
    summary = {
        "as_of": datetime.utcnow().strftime("%Y-%m-%d"),
        "reports_by_year": {
            "deaths_by_year": { "all": deaths_by_year_all_arr },
            "covid_deaths_by_year": { "all": non_covid_by_year_arr }
        },
        "covid_deaths_by_month": {
            "total": covid_month_total_arr,   # US+Foreign
            "us_terr_unk": covid_month_us_arr,
            "foreign": covid_month_fore_arr
        },
        "deaths_days_to_onset": {
            "covid": { "exact_0_19": d2o_covid_exact_arr, "gte_20": d2o_covid_gte20, "unknown": d2o_covid_unk },
            "flu":   { "exact_0_19": d2o_flu_exact_arr,   "gte_20": d2o_flu_gte20,   "unknown": d2o_flu_unk }
        },
        "provenance": {
            "domestic_source": os.path.basename(dom_path),
            "foreign_source":  os.path.basename(frn_path),
            "notes": "Yearly/D2O are DOMESTIC; Monthly COVID totals are Total + splits. Non-COVID yearly is deaths with no COVID VAX_TYPE."
        }
    }

    out_dir = os.path.dirname(out_json) or "."
    os.makedirs(out_dir, exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_json} ✅")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dom", default="./AllVAERSDataCSVS.zip", help="Domestic path (.zip or extracted folder)")
    ap.add_argument("--frn", default="./NonDomesticVAERSDATA.zip", help="Foreign path (.zip or extracted folder)")
    ap.add_argument("--out", default="./public/data/vaers-summary.json", help="Output JSON path")
    args = ap.parse_args()
    summarize(args.dom, args.frn, args.out)

if __name__ == "__main__":
    main()
