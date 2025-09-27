#!/usr/bin/env python3
# tools/build_vaers_series.py
import csv, json, os, glob, sys
from datetime import datetime

ROOT_JSON = "public/data/vaers-summary.json"
DOM = "data/raw/dom"
NON = "data/raw/non"

def parse_date(s):
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y","%Y-%m-%d","%Y%m%d"):
        try: return datetime.strptime(s, fmt)
        except Exception: pass
    # last chance: python date
    try: return datetime.fromisoformat(s)
    except Exception: return None

def norm_hdr(h):
    return [c.strip().upper() for c in h]

def files():
    # include year-sliced files and single non-domestic bundle
    return sorted(glob.glob(os.path.join(DOM, "*VAERSDATA.csv"))) + \
           sorted(glob.glob(os.path.join(NON, "*VAERSDATA.csv")))

def main():
    by_year = {}         # death counts by year of DATEDIED
    by_month = {}        # death counts by month of DATEDIED (YYYY-MM)
    onset = [0]*20       # 0..19 days between VAX_DATE and ONSET_DATE
    total_rows = 0
    total_died = 0

    for path in files():
        with open(path, "r", encoding="latin-1", errors="replace", newline="") as f:
            reader = csv.reader(f)
            try:
                hdr = norm_hdr(next(reader))
            except StopIteration:
                continue

            # column indexes (tolerant to drift)
            idx = {k:-1 for k in ["DIED","DATEDIED","RECVDATE","VAX_DATE","ONSET_DATE"]}
            for k in list(idx.keys()):
                if k in hdr: idx[k] = hdr.index(k)
            # some vintages use VAXDATE/ONSETDATE
            if idx["VAX_DATE"] == -1 and "VAXDATE" in hdr: idx["VAX_DATE"] = hdr.index("VAXDATE")
            if idx["ONSET_DATE"] == -1 and "ONSETDATE" in hdr: idx["ONSET_DATE"] = hdr.index("ONSETDATE")
            if idx["DATEDIED"] == -1 and "DATE_DIED" in hdr: idx["DATEDIED"] = hdr.index("DATE_DIED")

            for row in reader:
                total_rows += 1
                died = False
                if idx["DIED"] >= 0:
                    died = (row[idx["DIED"]].strip().upper() == "Y")

                # Only count deaths when DIED == Y (OpenVAERS mortality is based on death reports)
                if died:
                    total_died += 1
                    dd = parse_date(row[idx["DATEDIED"]]) if idx["DATEDIED"] >= 0 else None
                    if dd:
                        by_year[dd.year] = by_year.get(dd.year, 0) + 1
                        ym = f"{dd.year}-{dd.month:02d}"
                        by_month[ym] = by_month.get(ym, 0) + 1

                # onset histogram (0..19 days)
                vax = parse_date(row[idx["VAX_DATE"]]) if idx["VAX_DATE"] >= 0 else None
                ons = parse_date(row[idx["ONSET_DATE"]]) if idx["ONSET_DATE"] >= 0 else None
                if vax and ons:
                    delta = (ons - vax).days
                    if 0 <= delta < 20:
                        onset[delta] += 1

    by_year_series  = [{"label": y, "count": by_year[y]}  for y in sorted(by_year.keys())]
    by_month_series = [{"label": ym, "count": by_month[ym]} for ym in sorted(by_month.keys())]
    onset_series    = [{"label": i, "count": onset[i]} for i in range(20)]

    summary = {
        "total_rows": total_rows,
        "total_died": total_died,
        "by_year_series": by_year_series,
        "by_month_series": by_month_series,
        "onset_series": onset_series,
    }

    os.makedirs(os.path.dirname(ROOT_JSON), exist_ok=True)
    with open(ROOT_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"[OK] Updated {ROOT_JSON}")
    print(f"rows={total_rows} died={total_died} years={len(by_year_series)} months={len(by_month_series)} onset_nonzero={sum(1 for x in onset if x)}")

if __name__ == "__main__":
    sys.exit(main())
