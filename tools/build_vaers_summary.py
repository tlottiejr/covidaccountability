#!/usr/bin/env python3
import os, io, sys, json, math, zipfile, csv, argparse, glob
from datetime import datetime, date
from collections import defaultdict

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

def read_csv_from_zip(zf: zipfile.ZipFile, name_contains):
    for n in zf.namelist():
        if name_contains.lower() in n.lower() and n.lower().endswith(".csv"):
            data = zf.read(n)
            f = io.StringIO(data.decode("utf-8", errors="ignore"))
            rdr = csv.DictReader(f)
            return [ {k.strip(): v.strip() for k,v in r.items()} for r in rdr ]
    raise FileNotFoundError(f"CSV containing '{name_contains}' not found in {zf.filename}")

def read_csv_from_dir(root, name_contains):
    pats = [
        f"**/*{name_contains}*.csv",
        f"**/{name_contains.upper()}*.csv",
        f"**/{name_contains.lower()}*.csv",
    ]
    files = []
    for p in pats: files += glob.glob(os.path.join(root, p), recursive=True)
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        raise FileNotFoundError(f"No CSV containing '{name_contains}' found under {root}")
    path = sorted(files, key=lambda s: len(s))[0]
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        rdr = csv.DictReader(f)
        return [ {k.strip(): v.strip() for k,v in r.items()} for r in rdr ]

def load_vaers_source(path, is_foreign=False):
    """
    path: .zip (any compression) OR a directory with extracted CSVs
    returns data_rows, vax_rows
    """
    if os.path.isdir(path):
        data_rows = read_csv_from_dir(path, "VAERSDATA")
        vax_rows  = read_csv_from_dir(path, "VAERSVAX")
    else:
        # try python zipfile first
        try:
            with zipfile.ZipFile(path, "r") as zf:
                data_rows = read_csv_from_zip(zf, "VAERSDATA")
                vax_rows  = read_csv_from_zip(zf, "VAERSVAX")
        except NotImplementedError:
            # Deflate64 etc. → ask user to extract with 7z and rerun with --dom/--frn set to folders
            raise SystemExit(
                f"\n❌ {os.path.basename(path)} uses a compression zipfile cannot read.\n"
                f"   Run:\n"
                f"     7z x {os.path.basename(path)} -o/tmp/extract_here\n"
                f"   then re-run this script with --dom/--frn pointing to those folders."
            )
    for r in data_rows: r["_foreign"] = is_foreign
    return data_rows, vax_rows

def build_type_index(vax_rows):
    types = defaultdict(set)
    vdate = {}
    for r in vax_rows:
        vid = r.get("VAERS_ID","").strip()
        if not vid: continue
        t = r.get("VAX_TYPE","").strip().upper()
        if t: types[vid].add(t)
        vd = parse_date(r.get("VAX_DATE",""))
        if vd and (vid not in vdate or vd < vdate[vid]): vdate[vid] = vd
    return types, vdate

def summarize(dom_path, frn_path, out_json):
    dom_data, dom_vax = load_vaers_source(dom_path, is_foreign=False)
    frn_data, frn_vax = load_vaers_source(frn_path, is_foreign=True)

    all_data = dom_data + frn_data
    all_vax  = dom_vax  + frn_vax

    type_index, vax_date_index = build_type_index(all_vax)

    deaths_by_year_all   = defaultdict(int)
    covid_deaths_by_year = defaultdict(int)

    covid_month_total = defaultdict(int)
    covid_month_us    = defaultdict(int)
    covid_month_fore  = defaultdict(int)

    d2o_covid_exact = defaultdict(int); d2o_covid_gte20 = 0; d2o_covid_unk = 0
    d2o_flu_exact   = defaultdict(int); d2o_flu_gte20   = 0; d2o_flu_unk   = 0

    seen = set()
    for r in all_data:
        vid = r.get("VAERS_ID","").strip()
        if not vid or vid in seen: continue
        seen.add(vid)

        if r.get("DIED","").strip().upper() != "Y": continue

        recvd = parse_date(r.get("RECVDATE",""))
        y = year_of(recvd)
        if not y or y < MIN_YEAR or y >= MAX_YEAR: continue

        deaths_by_year_all[y] += 1

        types = {t.upper() for t in type_index.get(vid, set())}
        is_covid = bool(types & COVID_KEYS)
        is_flu   = bool(types & FLU_KEYS)

        if is_covid:
            covid_deaths_by_year[y] += 1
            mk = month_key(recvd)
            if mk:
                covid_month_total[mk] += 1
                (covid_month_fore if r.get("_foreign") else covid_month_us)[mk] += 1

        onset = parse_date(r.get("ONSET_DATE",""))
        vdate = vax_date_index.get(vid)
        if onset and vdate:
            d = clamp_day((onset - vdate).days)
            if d is not None:
                if is_covid:
                    (d2o_covid_exact if 0 <= d <= 19 else (lambda x: None))(d)
                    if 0 <= d <= 19: d2o_covid_exact[d] += 1
                    elif d >= 20:    d2o_covid_gte20   += 1
                if is_flu:
                    if 0 <= d <= 19: d2o_flu_exact[d] += 1
                    elif d >= 20:    d2o_flu_gte20   += 1
        else:
            if is_covid: d2o_covid_unk += 1
            if is_flu:   d2o_flu_unk   += 1

    years = sorted(set(deaths_by_year_all) | set(covid_deaths_by_year))
    years = [y for y in years if MIN_YEAR <= y < MAX_YEAR]

    deaths_by_year_all_arr   = [[str(y), deaths_by_year_all.get(y,0)]   for y in years]
    covid_deaths_by_year_arr = [[str(y), covid_deaths_by_year.get(y,0)] for y in years if y >= 2020]

    months = sorted(covid_month_total)
    covid_month_total_arr = [[m, covid_month_total[m]] for m in months]
    covid_month_us_arr    = [[m, covid_month_us[m]]    for m in months]
    covid_month_fore_arr  = [[m, covid_month_fore[m]]  for m in months]

    d2o_covid_exact_arr = [[str(i), d2o_covid_exact.get(i,0)] for i in range(20)]
    d2o_flu_exact_arr   = [[str(i), d2o_flu_exact.get(i,0)]   for i in range(20)]

    summary = {
        "as_of": datetime.utcnow().strftime("%Y-%m-%d"),
        "reports_by_year": {
            "deaths_by_year": { "all": deaths_by_year_all_arr },
            "covid_deaths_by_year": { "all": covid_deaths_by_year_arr }
        },
        "covid_deaths_by_month": {
            "total": covid_month_total_arr,
            "us_terr_unk": covid_month_us_arr,
            "foreign": covid_month_fore_arr
        },
        "deaths_days_to_onset": {
            "covid": { "exact_0_19": d2o_covid_exact_arr, "gte_20": d2o_covid_gte20, "unknown": d2o_covid_unk },
            "flu":   { "exact_0_19": d2o_flu_exact_arr,   "gte_20": d2o_flu_gte20,   "unknown": d2o_flu_unk }
        },
        "provenance": {
            "domestic_path": os.path.basename(dom_path),
            "foreign_path":  os.path.basename(frn_path),
            "notes": "All per-year totals are Domestic+Foreign; COVID by VAX_TYPE∈{COVID19}."
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
