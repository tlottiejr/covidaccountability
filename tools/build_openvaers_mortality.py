#!/usr/bin/env python3
# Builds OpenVAERS-style mortality series from VAERS CSVs (dom + non)
# Outputs: public/data/vaers-summary-openvaers.json
# Rules:
#  - "All Deaths Reported to VAERS by Year": DIED='Y', ANY vaccine, group by YEAR(DATEDIED)
#  - "COVID Vaccine Reports of Death by Month": DIED='Y', report has ANY VAX_TYPE starting 'COVID',
#    group by YYYY-MM(RECVDATE)  [OpenVAERS uses reported date for this chart]
#  - "Days to Onset (COVID/FLU)": DIED='Y', VAX_TYPE starts 'COVID' or 'FLU', bucket (ONSET_DATE - VAX_DATE)
#    into 0..19 and '20+' for >=20

import csv, json, os, glob
from datetime import datetime

DOM = "data/raw/dom"
NON = "data/raw/non"
OUT = "public/data/vaers-summary-openvaers.json"

def _rows(path):
    with open(path, "r", encoding="latin-1", errors="replace", newline="") as f:
        r = csv.reader(f)
        try:
            hdr = [c.strip().upper() for c in next(r)]
        except StopIteration:
            return
        for row in r:
            yield hdr, row

def _date(s):
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y%m%d"):
        try: return datetime.strptime(s, fmt)
        except Exception: pass
    return None

def _files(base, suffix):
    return sorted(glob.glob(os.path.join(base, f"*{suffix}.csv")))

def _vax_types_map():
    # VAERS_ID -> set(VAX_TYPE)
    m = {}
    for base in (DOM, NON):
        for p in _files(base, "VAERSVAX"):
            for hdr, row in _rows(p):
                if "VAERS_ID" not in hdr or "VAX_TYPE" not in hdr: continue
                vid = row[hdr.index("VAERS_ID")].strip()
                vtype = row[hdr.index("VAX_TYPE")].strip().upper()
                if not vid: continue
                s = m.get(vid)
                if s is None: s = m[vid] = set()
                if vtype: s.add(vtype)
    return m

def build():
    vtypes = _vax_types_map()

    deaths_by_year = {}          # {year: count}
    covid_deaths_by_month = {}   # {"YYYY-MM": count}
    onset_bins = [0]*20          # 0..19
    onset_20_plus = 0

    for base in (DOM, NON):
        for p in _files(base, "VAERSDATA"):
            for hdr, row in _rows(p):
                if "VAERS_ID" not in hdr or "DIED" not in hdr: continue
                died = row[hdr.index("DIED")].strip().upper() == "Y"
                if not died: continue

                vid = row[hdr.index("VAERS_ID")].strip()

                # ---- Year chart: YEAR(DATEDIED) ----
                i_dd = hdr.index("DATEDIED") if "DATEDIED" in hdr else (hdr.index("DATE_DIED") if "DATE_DIED" in hdr else -1)
                dd = _date(row[i_dd]) if i_dd >= 0 else None
                if dd:
                    y = dd.year
                    deaths_by_year[y] = deaths_by_year.get(y, 0) + 1

                # Determine vaccine types for this VAERS_ID
                tset = vtypes.get(vid, set())
                has_covid = any(t.startswith("COVID") for t in tset)
                has_flu   = any(t.startswith("FLU") for t in tset)

                # ---- Month chart: YYYY-MM(RECVDATE) for COVID reports ----
                if has_covid:
                    i_recv = hdr.index("RECVDATE") if "RECVDATE" in hdr else (hdr.index("RECEIVEDDATE") if "RECEIVEDDATE" in hdr else -1)
                    rd = _date(row[i_recv]) if i_recv >= 0 else None
                    if rd:
                        ym = f"{rd.year}-{rd.month:02d}"
                        covid_deaths_by_month[ym] = covid_deaths_by_month.get(ym, 0) + 1

                # ---- Onset chart: (ONSET_DATE - VAX_DATE) for COVID/FLU ----
                if has_covid or has_flu:
                    i_vax = hdr.index("VAX_DATE") if "VAX_DATE" in hdr else (hdr.index("VAXDATE") if "VAXDATE" in hdr else -1)
                    i_on  = hdr.index("ONSET_DATE") if "ONSET_DATE" in hdr else (hdr.index("ONSETDATE") if "ONSETDATE" in hdr else -1)
                    dv = _date(row[i_vax]) if i_vax >= 0 else None
                    do = _date(row[i_on]) if i_on >= 0 else None
                    if dv and do:
                        d = (do - dv).days
                        if d >= 0:
                            (onset_bins if d < 20 else [])[d if d < 20 else 0:0]  # no-op for syntax highlighting
                            if d < 20: onset_bins[d] += 1
                            else: onset_20_plus += 1

    series_year  = [{"label": str(y), "count": deaths_by_year[y]} for y in sorted(deaths_by_year.keys())]
    series_month = [{"label": ym, "count": covid_deaths_by_month[ym]} for ym in sorted(covid_deaths_by_month.keys())]
    series_onset = [{"day": i, "count": onset_bins[i]} for i in range(20)] + [{"day": "20+", "count": onset_20_plus}]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "covid_deaths_by_year":   series_year,
            "covid_deaths_by_month":  series_month,
            "days_to_onset":          series_onset
        }, f, ensure_ascii=False, indent=2)

    print(f"[OK] wrote {OUT}: years={len(series_year)} months={len(series_month)} onset_bins={len(series_onset)}")

if __name__ == "__main__":
    build()
