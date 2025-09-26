#!/usr/bin/env python3
# tools/build_vaers_summary.py
import argparse, csv, io, json, os, re, shutil, subprocess, sys, tempfile, zipfile
from datetime import datetime, date
from collections import defaultdict, Counter
from itertools import chain

csv.field_size_limit(10_000_000)

MIN_YEAR, MAX_YEAR = 1990, 2100
COVID_KEYS = {"COVID19", "COVID-19", "COVID"}
FLU_KEYS   = {"FLU", "FLU3", "FLUN3", "FLUA", "FLUCOV", "H1N1", "FLU4"}

# -------------------- util --------------------

def log(msg): print(msg, file=sys.stderr, flush=True)

def parse_date(s):
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None

def year_of(d): return d.year if isinstance(d, (datetime, date)) else None
def month_key(d): return f"{d.year:04d}-{d.month:02d}" if isinstance(d,(datetime,date)) else None

def clamp_day(delta):
    if delta is None: return None
    try:
        return 0 if delta < 0 else int(delta)
    except Exception:
        return None

def first_existing(*paths):
    for p in paths:
        if p and os.path.isfile(p): return p
    return None

def have_7z():
    return shutil.which("7z") is not None

def extract_with_7z(zip_path, out_dir):
    """Extract only VAERSDATA/VAERSVAX with 7z (works with Deflate64)."""
    os.makedirs(out_dir, exist_ok=True)
    cmd = ["7z", "x", "-y", f"-o{out_dir}", zip_path, "*VAERSDATA.csv", "*VAERSVAX.csv"]
    log("[7z] " + " ".join(cmd))
    try:
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        return True
    except Exception as e:
        log(f"[warn] 7z extract failed: {e}")
        return False

# -------------------- source readers --------------------

def iter_csv_file(path):
    if not path or not os.path.isfile(path): return iter(())
    return csv.DictReader(open(path, encoding="latin1", newline=""))

def iter_csv_from_zip(zip_path, member_suffix):
    """Try Python's zipfile first (fails on Deflate64)."""
    with zipfile.ZipFile(zip_path) as z:
        member = next((m for m in z.namelist() if m.lower().endswith(member_suffix)), None)
        if not member: return iter(())
        f = z.open(member)
        return csv.DictReader(io.TextIOWrapper(f, encoding="latin1", newline=""))

def discover_csvs(path):
    """
    Return (data_csv_path, vax_csv_path, cleanup_dir)
    - If 'path' is a dir: search recursively for VAERSDATA.csv and VAERSVAX.csv
    - If 'path' is a zip: try zipfile; if unsupported compression, try 7z to temp dir
    """
    if os.path.isdir(path):
        data_path = None
        vax_path  = None
        for root, _, files in os.walk(path):
            for n in files:
                low = n.lower()
                p = os.path.join(root, n)
                if low.endswith("vaersdata.csv"): data_path = p
                if low.endswith("vaersvax.csv"):  vax_path  = p
        return data_path, vax_path, None

    # path is a file; prefer zip streaming if possible
    try:
        rdr = iter_csv_from_zip(path, "vaersdata.csv"); next(iter(rdr), None)
        data_rdr_ok = True
    except NotImplementedError:
        data_rdr_ok = False
    except Exception:
        data_rdr_ok = False

    if data_rdr_ok:
        # We'll read via zipfile for each iterator call
        return path + "::vaersdata.csv", path + "::vaersvax.csv", None

    # Fallback: extract with 7z to temp
    if have_7z():
        tmp = tempfile.mkdtemp(prefix="vaers_")
        if extract_with_7z(path, tmp):
            # after extract, find the files
            return discover_csvs(tmp)  # returns cleanup_dir=None, but we need to clean tmp
        else:
            log("[error] Could not extract with 7z. Please extract manually and pass the folder.")
            return None, None, None
    else:
        log("[error] Zip uses unsupported compression (likely Deflate64). Install 7z and rerun, or extract manually.")
        return None, None, None

def load_vaers_source(path, is_foreign=False):
    """
    Yields (data_rows_iter, vax_rows_iter). Supports:
      - directory with VAERSDATA.csv and VAERSVAX.csv (recursively)
      - zip file (standard compression) streamed
      - zip file (Deflate64) auto-extracted with 7z if available
    """
    data_csv, vax_csv, _ = discover_csvs(path)
    if not data_csv or not vax_csv:
        return iter(()), iter(())

    # streamed from zip?
    if "::" in data_csv:
        zip_path, _ = data_csv.split("::", 1)
        def _tag(rows):
            for r in rows or ():
                r = dict(r); 
                if is_foreign: r["_foreign"] = True
                yield r
        return (
            _tag(iter_csv_from_zip(zip_path, "vaersdata.csv")),
            _tag(iter_csv_from_zip(zip_path, "vaersvax.csv")),
        )

    # files on disk
    def _tag(rows):
        for r in rows or ():
            r = dict(r)
            if is_foreign: r["_foreign"] = True
            yield r
    return _tag(iter_csv_file(data_csv)), _tag(iter_csv_file(vax_csv))

# -------------------- aggregation --------------------

def build_type_index(vax_iterables):
    types  = defaultdict(set)   # VAERS_ID -> set(VAX_TYPE)
    vdate  = {}                 # VAERS_ID -> earliest VAX_DATE
    manuf  = defaultdict(set)   # VAERS_ID -> set(VAX_MANU)
    seen = 0
    for r in vax_iterables:
        vid = (r.get("VAERS_ID") or "").strip()
        if not vid: 
            continue
        t = (r.get("VAX_TYPE") or "").strip().upper()
        m = (r.get("VAX_MANU") or "").strip()
        if t: types[vid].add(t)
        if m: manuf[vid].add(m)
        vd = parse_date(r.get("VAX_DATE",""))
        if vd and (vid not in vdate or vd < vdate[vid]):
            vdate[vid] = vd
        seen += 1
        if seen % 250_000 == 0:
            log(f"[index] processed VAERSVAX rows: {seen}")
    return types, vdate, manuf

def summarize(dom_path, frn_path, out_json):
    # ingest
    log("[stage] indexing vaccine types/dates/manufacturers…")
    dom_data_iter, dom_vax_iter = load_vaers_source(dom_path, is_foreign=False)
    frn_data_iter, frn_vax_iter = load_vaers_source(frn_path, is_foreign=True)

    types, vax_date_index, manuf_index = build_type_index(chain(dom_vax_iter, frn_vax_iter))
    log(f"[ok] VAERS_ID with VAX info: {len(types):,}")

    # accumulators
    deaths_by_year_total           = defaultdict(int)  # US + Foreign
    non_covid_deaths_by_year_total = defaultdict(int)  # derived: total - covid

    covid_month_total = defaultdict(int)   # US + Foreign
    covid_month_us    = defaultdict(int)   # domestic only
    covid_month_fore  = defaultdict(int)   # foreign only

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
    for r in chain(dom_data_iter, frn_data_iter):
        vid = (r.get("VAERS_ID") or "").strip()
        if not vid: 
            continue
        if (r.get("DIED") or "").strip().upper() != "Y":
            continue

        recvd = parse_date(r.get("RECVDATE",""))
        y = year_of(recvd)
        if not y or y < MIN_YEAR or y >= MAX_YEAR:
            continue

        tset = {t.upper() for t in types.get(vid, set())}
        has_covid = bool(tset & COVID_KEYS)
        has_flu   = bool(tset & FLU_KEYS)
        is_foreign = bool(r.get("_foreign"))

        # yearly: total (US+Foreign)
        deaths_by_year_total[y] += 1
        if not has_covid:
            non_covid_deaths_by_year_total[y] += 1

        # monthly: COVID only
        mk = month_key(recvd)
        if mk and has_covid:
            covid_month_total[mk] += 1
            (covid_month_fore if is_foreign else covid_month_us)[mk] += 1

        # d2o: domestic only, COVID+FLU
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

        # breakdowns: COVID domestic only
        if has_covid and not is_foreign:
            mans = manuf_index.get(vid) or {"Unknown"}
            for m in mans: manuf_counts[(m or "Unknown")] += 1
            sex = (r.get("SEX","") or "Unknown").strip().title()
            if sex not in {"Male","Female"}: sex = "Unknown"
            sex_counts[sex] += 1
            age_bins[age_bin(r.get("AGE_YRS",""))] += 1

        seen += 1
        if seen % 250_000 == 0:
            log(f"[data] processed VAERSDATA deaths: {seen:,}")

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

    # pretty JSON
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    log(f"[ok] wrote {out_json}")

# -------------------- cli --------------------

def main():
    ap = argparse.ArgumentParser(description="Build VAERS summary JSON for About page charts/table.")
    ap.add_argument("--dom", required=True, help="Domestic VAERS zip or folder (contains VAERSDATA.csv, VAERSVAX.csv)")
    ap.add_argument("--frn", required=True, help="Foreign/NonDomestic VAERS zip or folder")
    ap.add_argument("--out", default="./public/data/vaers-summary.json", help="Output JSON path")
    args = ap.parse_args()
    summarize(args.dom, args.frn, args.out)

if __name__ == "__main__":
    main()
