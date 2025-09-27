#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Build vaers-summary.json from local VAERS zips, aligned to OpenVAERS rules.

Usage:
  python3 tools/build_vaers_summary.py \
    --dom vaers-data/AllVAERSDataCSVS.zip \
    --frn vaers-data/NonDomesticVAERSDATA.zip \
    --out public/data/vaers-summary.json
"""

from __future__ import annotations

import argparse, csv, datetime as dt, io, json, os, shutil, subprocess, sys, tempfile
from collections import Counter, defaultdict
from typing import Dict, Iterator, List, Optional, Tuple

# ------------------------ date/num helpers ------------------------

def _parse_date(s: str) -> Optional[dt.date]:
    if not s: return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try: return dt.datetime.strptime(s, fmt).date()
        except Exception: pass
    return None

def _parse_int(s: str) -> Optional[int]:
    try: return int(s)
    except Exception: return None

def _month_key(d: dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"

def _normalize_sex(val: str) -> str:
    s = (val or "").strip().upper()
    if s in ("M", "MALE"): return "Male"
    if s in ("F", "FEMALE"): return "Female"
    if s in ("U", "UNK", "UNKNOWN", "OTHER", "OT"): return "Unknown"
    return "Unknown"

# ------------------------ US/Territories set (OpenVAERS convention) ------------------------

US_TERR = {
    # 50 states + DC
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
    "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
    "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
    # Territories counted by OpenVAERS as US/Territories
    "PR","GU","VI","AS","MP"
}

def _is_us_territory(state: str) -> bool:
    return (state or "").strip().upper() in US_TERR

# ------------------------ zip reading (with 7z fallback) ------------------------

def _wrap_text(binary_stream) -> io.TextIOBase:
    return io.TextIOWrapper(binary_stream, encoding="utf-8-sig", errors="replace", newline="")

def _iter_zip_csv(zip_path: str, name_contains: str) -> Iterator[io.TextIOBase]:
    import zipfile
    try:
        with zipfile.ZipFile(zip_path) as z:
            for info in z.infolist():
                fn = info.filename
                if name_contains.lower() in fn.lower() and fn.lower().endswith(".csv"):
                    raw = z.open(info, "r")
                    yield _wrap_text(raw)
        return
    except NotImplementedError:
        pass
    tmpdir = tempfile.mkdtemp(prefix="vaers7z_")
    try:
        try:
            subprocess.run(["7z","x","-y",f"-o{tmpdir}",zip_path],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except FileNotFoundError:
            raise RuntimeError("7z not found. Install: sudo apt-get update && sudo apt-get install -y p7zip-full")
        for root, _, files in os.walk(tmpdir):
            for fn in files:
                if name_contains.lower() in fn.lower() and fn.lower().endswith(".csv"):
                    raw = open(os.path.join(root, fn), "rb")
                    yield _wrap_text(raw)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# ------------------------ aggregator ------------------------

class Aggregator:
    def __init__(self) -> None:
        # All deaths by year (domestic + foreign)
        self.deaths_by_year: Counter[int] = Counter()

        # COVID deaths by month
        self.covid_month_total: Counter[str] = Counter()
        self.covid_month_dom: Counter[str] = Counter()   # US/Territories
        self.covid_month_frn: Counter[str] = Counter()   # Foreign*

        # Domestic (US/Territories) COVID breakdowns
        self.manufacturer_dom: Counter[str] = Counter()
        self.sex_dom: Counter[str] = Counter()
        self.age_bins_dom: Counter[str] = Counter()
        self.age_total_dom: int = 0

        # Days to onset histograms (0..19)
        self.days_covid: Counter[int] = Counter()
        self.days_flu: Counter[int] = Counter()

        # VAX joins
        self.vax_by_id_dom: Dict[int, List[Tuple[str, str]]] = defaultdict(list)
        self.vax_by_id_frn: Dict[int, List[Tuple[str, str]]] = defaultdict(list)

    # ---- VAX (join) ----
    def ingest_vax_csv(self, fh: io.TextIOBase, foreign: bool) -> None:
        reader = csv.DictReader(fh)
        target = self.vax_by_id_frn if foreign else self.vax_by_id_dom
        for row in reader:
            try:
                vid = _parse_int(row.get("VAERS_ID") or row.get("vaers_id") or "")
                if vid is None: continue
                vtype = (row.get("VAX_TYPE") or row.get("vax_type") or "").strip().upper()
                vmanu = (row.get("VAX_MANU") or row.get("vax_manu") or "Unknown").strip()
                target[vid].append((vtype, vmanu))
            except Exception:
                continue

    # ---- DATA (aggregate) ----
    def ingest_data_csv(self, fh: io.TextIOBase, foreign_zip: bool) -> None:
        """
        foreign_zip=True means NonDomestic zip (always Foreign*).
        For domestic zip, we classify per record using STATE into US/Territories vs Foreign*.
        """
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                vid = _parse_int(row.get("VAERS_ID") or row.get("vaers_id") or "")
                if vid is None:
                    continue

                # Only death reports
                if (row.get("DIED") or row.get("died") or "").strip().upper() != "Y":
                    continue

                # Year (all)
                recv = _parse_date(row.get("RECVDATE") or row.get("recvdate") or "")
                if recv:
                    self.deaths_by_year[recv.year] += 1

                # Join vaccines
                vlist = (self.vax_by_id_frn if foreign_zip else self.vax_by_id_dom).get(vid, [])
                has_covid = any(vt == "COVID19" for vt, _ in vlist)
                has_flu   = any(vt == "FLU"     for vt, _ in vlist)

                # Days to onset
                vax_date   = _parse_date(row.get("VAX_DATE") or row.get("vax_date") or "")
                onset_date = _parse_date(row.get("ONSET_DATE") or row.get("onset_date") or "")
                numdays    = _parse_int(row.get("NUMDAYS")   or row.get("numdays")   or "")
                days = (onset_date - vax_date).days if (vax_date and onset_date) else numdays
                if days is not None and 0 <= days <= 19:
                    if has_covid: self.days_covid[days] += 1
                    if has_flu:   self.days_flu[days]   += 1

                # US/Territories vs Foreign* classification (OpenVAERS style)
                if foreign_zip:
                    is_us_terr = False
                else:
                    state = (row.get("STATE") or row.get("state") or "").strip().upper()
                    is_us_terr = _is_us_territory(state)

                # Monthly COVID
                if recv and has_covid:
                    mk = _month_key(recv)
                    self.covid_month_total[mk] += 1
                    if is_us_terr:
                        self.covid_month_dom[mk] += 1
                    else:
                        self.covid_month_frn[mk] += 1

                # Breakdowns are COVID, US/Territories only
                if has_covid and is_us_terr:
                    # manufacturer (unique per report)
                    seen = set()
                    for vt, manu in vlist:
                        if vt == "COVID19":
                            key = manu or "Unknown"
                            if key not in seen:
                                self.manufacturer_dom[key] += 1
                                seen.add(key)

                    # sex
                    sex = _normalize_sex(row.get("SEX") or row.get("sex"))
                    self.sex_dom[sex] += 1

                    # age bins
                    age_years = None
                    try: age_years = float(row.get("AGE_YRS") or row.get("age_yrs") or "")
                    except Exception: pass
                    label = "Unknown"
                    if age_years is not None:
                        a = age_years
                        if 0 <= a <= 5: label = "0-5"
                        elif a <= 12:  label = "5-12"
                        elif a <= 25:  label = "12-25"
                        elif a <= 51:  label = "25-51"
                        elif a <= 66:  label = "51-66"
                        elif a <= 81:  label = "66-81"
                        elif a <= 121: label = "81-121"
                        else:          label = "Unknown"
                    self.age_bins_dom[label] += 1
                    self.age_total_dom += 1

            except Exception:
                continue

    # ---- export ----
    def to_summary(self) -> dict:
        def _pairs(counter: Counter[str]) -> List[List[object]]:
            return [[k, counter[k]] for k in sorted(counter.keys())]

        def _bkd(counter: Counter[str]) -> List[dict]:
            items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
            return [{"category": k, "count": v} for k, v in items]

        years_pairs = [[y, c] for y, c in sorted(self.deaths_by_year.items())]

        # days to onset 0..19
        covid_pairs = [[i, self.days_covid.get(i, 0)] for i in range(0, 20)]
        flu_pairs   = [[i, self.days_flu.get(i, 0)]   for i in range(0, 20)]

        # age ordered + All Ages
        age_list = _bkd(self.age_bins_dom)
        desired = ["0-5","5-12","12-25","25-51","51-66","66-81","81-121","Unknown"]
        present = {e["category"] for e in age_list}
        for lab in desired:
            if lab not in present:
                age_list.append({"category": lab, "count": 0})
        age_list.sort(key=lambda e: desired.index(e["category"]))
        age_list.append({"category": "All Ages", "count": self.age_total_dom})

        return {
            "reports_by_year": {
                "deaths_by_year": {"all": years_pairs},
                "deaths": {"all": years_pairs},  # legacy key used by old JS
                "all": years_pairs,
            },
            "covid_deaths_by_month": {
                "total": _pairs(self.covid_month_total),
                "us_territories": _pairs(self.covid_month_dom),
                "foreign": _pairs(self.covid_month_frn),
            },
            "days_to_onset": {"covid": covid_pairs, "flu": flu_pairs},
            "covid_deaths_breakdowns": {
                "manufacturer": _bkd(self.manufacturer_dom),
                "sex": _bkd(self.sex_dom),
                "age_bins": age_list,
            },
        }

# ------------------------ pipeline ------------------------

def summarize(dom_zip: str, frn_zip: str) -> dict:
    agg = Aggregator()
    # build joins first
    for fh in _iter_zip_csv(dom_zip, "VAERSVAX"):  ############ domestic
        with fh: agg.ingest_vax_csv(fh, foreign=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSVAX"):  ############ foreign
        with fh: agg.ingest_vax_csv(fh, foreign=True)
    # then data
    for fh in _iter_zip_csv(dom_zip, "VAERSDATA"):
        with fh: agg.ingest_data_csv(fh, foreign_zip=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSDATA"):
        with fh: agg.ingest_data_csv(fh, foreign_zip=True)
    return agg.to_summary()

def main() -> None:
    ap = argparse.ArgumentParser(description="Build VAERS summary JSON for About page.")
    ap.add_argument("--dom", required=True)
    ap.add_argument("--frn", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    dom = os.path.abspath(args.dom)
    frn = os.path.abspath(args.frn)
    out = os.path.abspath(args.out)

    if not os.path.exists(dom): sys.exit(f"Domestic zip not found: {dom}")
    if not os.path.exists(frn): sys.exit(f"Foreign zip not found: {frn}")

    print("[stage] building summary aligned to OpenVAERS…", file=sys.stderr)
    payload = summarize(dom, frn)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, separators=(",", ":"))

    print(f"[done] wrote {out}", file=sys.stderr)

if __name__ == "__main__":
    main()
