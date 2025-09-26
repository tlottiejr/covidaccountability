#!/usr/bin/env python3
# tools/build_vaers_summary.py
# Builds pretty JSON for the About page charts/table.
# - Accepts a zip OR a folder for --dom / --frn
# - Recursively finds VAERSDATA.csv and VAERSVAX.csv
# - Yearly totals: US+Foreign (All Vaccines)
# - Monthly COVID: total + US (domestic) + Foreign
# - Days-to-Onset (0..19): domestic only, COVID + Flu
# - Breakdowns (manufacturer/sex/age): domestic COVID only
import argparse, csv, io, json, os, zipfile
from datetime import datetime, date
from collections import defaultdict, Counter
from itertools import chain

csv.field_size_limit(10_000_000)

MIN_YEAR, MAX_YEAR = 1990, 2100
COVID_KEYS = {"COVID19", "COVID-19", "COVID"}
FLU_KEYS   = {"FLU", "FLU3", "FLUN3", "FLUA", "FLUCOV", "H1N1", "FLU4"}

def log(*a): print(*a, flush=True)

def parse_date(s):
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try: return datetime.strptime(s, fmt).date()
        except Exception: pass
    return None

def year_of(d): return d.year if isinstance(d, (datetime, date)) else None
def month_key(d): return f"{d.year:04d}-{d.month:02d}" if isinstance(d,(datetime,date)) else None

def clamp_day(delta):
    if delta is None: return None
    try: return 0 if delta < 0 else int(delta)
    except Exception: return None

def discover_csvs(path):
    """Return (data_csv_path, vax_csv_path). Works on folders or zips (standard)."""
    if os.path.isdir(path):
        data_path = vax_path = None
        for root, _, files in os.walk(path):
            for n in files:
                low = n.lower()
                p = os.path.join(root, n)
                if low.endswith("vaersdata.csv"): data_path = p
                if low.endswith("vaersvax.csv"):  vax_path  = p
        return data_path, vax_path

    # try reading from zip (fails for Deflate64; extract yourself if so)
    try:
        with zipfile.ZipFile(path) as z:
            members = {m.lower(): m for m in z.namelist()}
            d = next((members[m] for m in members if m.endswith("vaersdata.csv")), None)
            v = next((members[m] for m in members if m.endswith("vaersvax.csv")), None)
            if not d or not v: return None, None
            return path + "::" + d, path + "::" + v
    except NotImplementedError:
        log("[warn] Zip compression not supported here. Extract the files and pass the folder.")
        return None, None

def iter_csv(path):
    if not path: return iter(())
    if "::" in path:
        zip_path, member = path.split("::", 1)
        with zipfile.ZipFile(zip_path) as z:
            with z.open(member) as f:
                rdr = csv.DictReader(io.TextIOWrapper(f, encoding="latin1", newline=""))
                for r in rdr: yield r
    else:
        return csv.DictReader(open(path, encoding="latin1", newline=""))

def load_vaers_source(path, is_foreign=False):
    data_csv, vax_csv = discover_csvs(path)
    if not data_csv or not vax_csv: return iter(()), iter(())
    def tag(rows):
        for r in rows or ():
            r = dict(r)
            if is_foreign: r["_foreign"] = True
            yield r
    return tag(iter_csv(data_csv)), tag(iter_csv(vax_csv))

def build_type_index(vax_iters):
    types  = defaultdict(set)  # VAERS_ID -> {VAX_TYPE}
    vdate  = {}                # VAERS_ID -> earliest VAX_DATE
    manuf  = defaultdict(set)  # VAERS_ID -> {VAX_MANU}
    seen = 0
    for r in vax_iters:
        vid = (r.get("VAERS_ID") or "").strip()
        if not vid: continue
        t = (r.get("VAX_TYPE") or "").strip().upper()
        m = (r.get("VAX_MANU") or "").strip()
        if t: types[vid].add(t)
        if m: manuf[vid].add(m)
        vd = parse_date(r.get("VAX_DATE",""))
        if vd and (vid not in vdate or vd < vdate[vid]): vdate[vid] = vd
        seen += 1
        if seen % 250_000 == 0: log(f"[index] VAERSVAX rows: {seen:,}")
    return types, vdate, manuf

def summarize(dom_path, frn_path, out_json):
    dom_data, dom_vax = load_vaers_source(dom_path, is_foreign=False)
    frn_data, frn_vax = load_vaers_source(frn_path, is_foreign=True)

    log("[stage] indexing types/dates/manufacturers…")
    types, vax_date_index, manuf_index = build_type_index(chain(dom_vax, frn_vax))
    log(f"[ok] VAERS_ID with vaccine info: {len(types):,}")

    deaths_by_year_total           = defaultdict(int)  # US+Foreign
    non_covid_deaths_by_year_total = defaultdict(int)

    covid_month_total = defaultdict(int)   # US+Foreign
    covid_month_us    = defaultdict(int)   # domestic
    covid_month_fore  = defaultdict(int)   # foreign

    d2o_covid_exact = defaultdict(int); d2o_covid_gte20 = 0; d2o_covid_unk = 0
    d2o_flu_exact   = defaultdict(int); d2o_flu_gte20   = 0; d2o_flu_unk   = 0

    manuf_counts = Counter()
    sex_counts   = Counter()
    age_bins     = Counter()

    def age_bin(a):
        try: a = float(a)
        except Exception: return "Unknown"
        if a < 0: return "Unknown"
        if a <= 17: return "0-17"
        if a <= 29: return "18-29"
        if a <= 39: return "30-39"
        if a <= 49: return "40-49"
        if a <= 59: return "50-59"
        if a <= 69: return "60-69"
        if a <= 79: return "70-79"
        return "80+"

    log("[stage] streaming VAERSDATA (domestic + foreign)…")
    seen = 0
    for r in chain(dom_data, frn_data):
        vid = (r.get("VAERS_ID") or "").strip()
        if not vid: continue
        if (r.get("DIED") or "").strip().upper() != "Y": continue

        recvd = parse_date(r.get("RECVDATE",""))
        y = year_of(recvd)
        if not y or y < MIN_YEAR or y >= MAX_YEAR: continue

        tset = {t.upper() for t in types.get(vid, set())}
        has_covid = bool(tset & COVID_KEYS)
        has_flu   = bool(tset & FLU_KEYS)
        is_foreign = bool(r.get("_foreign"))

        # Yearly totals
        deaths_by_year_total[y] += 1
        if not has_covid:
            non_covid_deaths_by_year_total[y] += 1

        # Monthly COVID (by received month)
        mk = month_key(recvd)
        if mk and has_covid:
          covid_month_total[mk] += 1
          (covid_month_fore if is_foreign else covid_month_us)[mk] += 1

        # Days to onset (domestic only)
        if not is_foreign:
            onset = parse_date(r.get("ONSET_DATE","")) or parse_date(r.get("SYMPTOM_ONSET_DATE",""))
            vdate = vax_date_index.get(vid)
            if onset and vdate:
                d = clamp_day((onset - vdate).days)
                if d is not None:
                    if has_covid:
                        if 0 <= d <= 19: d2o_covid_exact[d] += 1
                        elif d >= 20:    d2o_covid_gte20   += 1
                    if has_flu:
                        if 0 <= d <= 19: d2o_flu_exact[d] += 1
                        elif d >= 20:    d2o_flu_gte20     += 1
            else:
                if has_covid: d2o_covid_unk += 1
                if has_flu:   d2o_flu_unk   += 1

        # Breakdowns (domestic COVID only)
        if has_covid and not is_foreign:
            mans = manuf_index.get(vid) or {"Unknown"}
            for m in mans: manuf_counts[(m or "Unknown")] += 1
            sex = (r.get("SEX","") or "Unknown").strip().title()
            if sex not in {"Male","Female"}: sex = "Unknown"
            sex_counts[sex] += 1
            age = r.get("AGE_YRS","")
            try:
                age_bins[age_bin(age)] += 1
            except Exception:
                age_bins["Unknown"] += 1

        seen += 1
        if seen % 250_000 == 0: log(f"[data] processed deaths: {seen:,}")

    # Assemble results
    years = sorted(set(deaths_by_year_total) | set(non_covid_deaths_by_year_total))
    years = [y for y in years if MIN_YEAR <= y < MAX_YEAR]
    months = sorted(covid_month_total)

    def pairs_year(d):  return [[str(y), d.get(y,0)] for y in years]
    def pairs_month(d): return [[m, d.get(m,0)] for m in months]
    def arr20(d):       return [[str(i), d.get(i,0)] for i in range(20)]

    summary = {
        "as_of": datetime.utcnow().strftime("%Y-%m-%d"),
        "reports_by_year": {
            "deaths_by_year": { "all": pairs_year(deaths_by_year_total) },
            "non_covid_deaths_by_year": { "all": pairs_year(non_covid_deaths_by_year_total) }
        },
        "covid_deaths_by_month": {
            "total":      pairs_month(covid_month_total),
            "us_terr_unk":pairs_month(covid_month_us),
            "foreign":    pairs_month(covid_month_fore)
        },
        "deaths_days_to_onset": {
            "covid": { "exact_0_19": arr20(d2o_covid_exact), "gte_20": d2o_covid_gte20, "unknown": d2o_covid_unk },
            "flu":   { "exact_0_19": arr20(d2o_flu_exact),   "gte_20": d2o_flu_gte20,   "unknown": d2o_flu_unk }
        },
        "covid_deaths_breakdowns": {
            "manufacturer": sorted([[k, v] for k,v in manuf_counts.items()], key=lambda x: (-x[1], x[0])),
            "sex":          sorted([[k, v] for k,v in sex_counts.items()],   key=lambda x: (-x[1], x[0])),
            "age_bins":     sorted([[k, v] for k,v in age_bins.items()],     key=lambda x: (-x[1], x[0])),
        },
        "provenance": {
            "domestic_source": os.path.basename(dom_path.rstrip(os.sep)),
            "foreign_source":  os.path.basename(frn_path.rstrip(os.sep))
        }
    }

    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    log(f"[ok] wrote {out_json}")

def main():
    ap = argparse.ArgumentParser(description="Build VAERS summary JSON for the About page.")
    ap.add_argument("--dom", required=True, help="Domestic VAERS folder or zip")
    ap.add_argument("--frn", required=True, help="Foreign VAERS folder or zip")
    ap.add_argument("--out", default="./public/data/vaers-summary.json", help="Output JSON path")
    globals().update(vars(ap.parse_args()))
    summarize(dom, frn, out)

if __name__ == "__main__":
    main()
