#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Build vaers-summary.json for the About page from local VAERS zip files.

Usage:
  python3 tools/build_vaers_summary.py \
    --dom vaers-data/AllVAERSDataCSVS.zip \
    --frn vaers-data/NonDomesticVAERSDATA.zip \
    --out public/data/vaers-summary.json
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from typing import Dict, Iterator, List, Optional, Tuple

# ------------------------ helpers: parsing & normalization ------------------------

def _parse_date(s: str) -> Optional[dt.date]:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None

def _parse_int(s: str) -> Optional[int]:
    try:
        return int(s)
    except Exception:
        return None

def _month_key(d: dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"

def _normalize_sex(val: str) -> str:
    """
    Robust VAERS sex normalization.
    Raw values appear as M/F/U, MALE/FEMALE/UNKNOWN, UNK, blank.
    """
    s = (val or "").strip().upper()
    if s in ("M", "MALE"):
        return "Male"
    if s in ("F", "FEMALE"):
        return "Female"
    if s in ("U", "UNK", "UNKNOWN", "OTHER", "OT"):
        return "Unknown"
    return "Unknown"

# ------------------------ zip reading with 7z fallback ------------------------

def _wrap_text(binary_stream) -> io.TextIOBase:
    """
    Always return a tolerant text stream (no decode crashes).
    """
    return io.TextIOWrapper(binary_stream, encoding="utf-8-sig", errors="replace", newline="")

def _iter_zip_csv(zip_path: str, name_contains: str) -> Iterator[io.TextIOBase]:
    """
    Yield text file handles for CSV files inside `zip_path` whose filename
    contains `name_contains` (case-insensitive).
    Use stdlib zipfile first; fallback to 7z for Deflate64 archives.
    """
    import zipfile

    # Try stdlib first
    try:
        with zipfile.ZipFile(zip_path) as z:
            for info in z.infolist():
                fn = info.filename
                if name_contains.lower() in fn.lower() and fn.lower().endswith(".csv"):
                    raw = z.open(info, "r")
                    yield _wrap_text(raw)
        return
    except NotImplementedError:
        pass  # Deflate64 etc.

    # Fallback to 7z extraction
    tmpdir = tempfile.mkdtemp(prefix="vaers7z_")
    try:
        try:
            subprocess.run(
                ["7z", "x", "-y", f"-o{tmpdir}", zip_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
        except FileNotFoundError:
            raise RuntimeError(
                "7z not found. Install with:\n  sudo apt-get update && sudo apt-get install -y p7zip-full"
            )
        for root, _, files in os.walk(tmpdir):
            for fn in files:
                if name_contains.lower() in fn.lower() and fn.lower().endswith(".csv"):
                    raw = open(os.path.join(root, fn), "rb")
                    yield _wrap_text(raw)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# ------------------------ aggregator ------------------------

class Aggregator:
    """
    Collects aggregates required by the About page.
    """

    def __init__(self) -> None:
        # deaths by received year (domestic + foreign)
        self.deaths_by_year: Counter[int] = Counter()

        # covid deaths by month (total/domestic/foreign)
        self.covid_month_total: Counter[str] = Counter()
        self.covid_month_dom: Counter[str] = Counter()
        self.covid_month_frn: Counter[str] = Counter()

        # domestic COVID breakdowns
        self.manufacturer_dom: Counter[str] = Counter()
        self.sex_dom: Counter[str] = Counter()
        self.age_bins_dom: Counter[str] = Counter()
        self.age_total_dom: int = 0

        # days to onset histograms (0..19), COVID vs FLU
        self.days_covid: Counter[int] = Counter()
        self.days_flu: Counter[int] = Counter()

        # join cache from VAERSVAX
        self.vax_by_id_dom: Dict[int, List[Tuple[str, str]]] = defaultdict(list)
        self.vax_by_id_frn: Dict[int, List[Tuple[str, str]]] = defaultdict(list)

    # -------- ingest VAX (build join) --------

    def ingest_vax_csv(self, fh: io.TextIOBase, foreign: bool) -> None:
        reader = csv.DictReader(fh)
        target = self.vax_by_id_frn if foreign else self.vax_by_id_dom
        for row in reader:
            try:
                vid = _parse_int(row.get("VAERS_ID") or row.get("vaers_id") or "")
                if vid is None:
                    continue
                vtype = (row.get("VAX_TYPE") or row.get("vax_type") or "").strip().upper()
                vmanu = (row.get("VAX_MANU") or row.get("vax_manu") or "Unknown").strip()
                target[vid].append((vtype, vmanu))
            except Exception:
                continue

    # -------- ingest DATA (aggregate) --------

    def ingest_data_csv(self, fh: io.TextIOBase, foreign: bool) -> None:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                vid = _parse_int(row.get("VAERS_ID") or row.get("vaers_id") or "")
                if vid is None:
                    continue

                # Only death reports
                if (row.get("DIED") or row.get("died") or "").strip().upper() != "Y":
                    continue

                recv = _parse_date(row.get("RECVDATE") or row.get("recvdate") or "")
                if recv:
                    self.deaths_by_year[recv.year] += 1

                # Determine days to onset
                vax_date = _parse_date(row.get("VAX_DATE") or row.get("vax_date") or "")
                onset_date = _parse_date(row.get("ONSET_DATE") or row.get("onset_date") or "")
                numdays = _parse_int(row.get("NUMDAYS") or row.get("numdays") or "")
                days = (onset_date - vax_date).days if (vax_date and onset_date) else numdays

                # Vaccines attached to this report
                vlist = (self.vax_by_id_frn if foreign else self.vax_by_id_dom).get(vid, [])
                has_covid = any(vt == "COVID19" for vt, _ in vlist)
                has_flu   = any(vt == "FLU"     for vt, _ in vlist)

                # Monthly COVID deaths
                if recv and has_covid:
                    mk = _month_key(recv)
                    self.covid_month_total[mk] += 1
                    (self.covid_month_frn if foreign else self.covid_month_dom)[mk] += 1

                # Domestic-only breakdowns for COVID
                if not foreign and has_covid:
                    # manufacturer (unique per report)
                    seen = set()
                    for vt, manu in vlist:
                        if vt == "COVID19":
                            key = manu or "Unknown"
                            if key not in seen:
                                self.manufacturer_dom[key] += 1
                                seen.add(key)

                    # ✅ Correct sex normalization
                    sex = _normalize_sex(row.get("SEX") or row.get("sex"))
                    self.sex_dom[sex] += 1

                    # age bins
                    age_years = None
                    try:
                        age_years = float(row.get("AGE_YRS") or row.get("age_yrs") or "")
                    except Exception:
                        pass

                    bin_label = "Unknown"
                    if age_years is not None:
                        a = age_years
                        if 0 <= a <= 5: bin_label = "0-5"
                        elif a <= 12:   bin_label = "5-12"
                        elif a <= 25:   bin_label = "12-25"
                        elif a <= 51:   bin_label = "25-51"
                        elif a <= 66:   bin_label = "51-66"
                        elif a <= 81:   bin_label = "66-81"
                        elif a <= 121:  bin_label = "81-121"
                        else:           bin_label = "Unknown"
                    self.age_bins_dom[bin_label] += 1
                    self.age_total_dom += 1

                # days to onset histograms
                if days is not None and 0 <= days <= 19:
                    if has_covid: self.days_covid[days] += 1
                    if has_flu:   self.days_flu[days] += 1

            except Exception:
                continue

    # -------- export --------

    def to_summary(self) -> dict:
        # deaths by year
        years_pairs = [[y, c] for y, c in sorted(self.deaths_by_year.items())]

        # monthly helpers
        def _pairs(counter: Counter[str]) -> List[List[object]]:
            return [[k, counter[k]] for k in sorted(counter.keys())]

        # breakdown helpers
        def _bkd(counter: Counter[str]) -> List[dict]:
            items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
            return [{"category": k, "count": v} for k, v in items]

        # days to onset 0..19
        covid_pairs = [[i, self.days_covid.get(i, 0)] for i in range(0, 20)]
        flu_pairs   = [[i, self.days_flu.get(i, 0)]   for i in range(0, 20)]

        # age list with guaranteed order + "All Ages"
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
                # compatibility keys (older front-end fallbacks)
                "deaths": {"all": years_pairs},
                "all": years_pairs,
            },
            "covid_deaths_by_month": {
                "total": _pairs(self.covid_month_total),
                "us_territories": _pairs(self.covid_month_dom),
                "foreign": _pairs(self.covid_month_frn),
            },
            "days_to_onset": { "covid": covid_pairs, "flu": flu_pairs },
            "covid_deaths_breakdowns": {
                "manufacturer": _bkd(self.manufacturer_dom),
                "sex": _bkd(self.sex_dom),
                "age_bins": age_list,
            },
        }

# ------------------------ orchestration ------------------------

def summarize(dom_zip: str, frn_zip: str) -> dict:
    agg = Aggregator()

    # Build joins first (VAX tables)
    for fh in _iter_zip_csv(dom_zip, "VAERSVAX"):
        with fh: agg.ingest_vax_csv(fh, foreign=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSVAX"):
        with fh: agg.ingest_vax_csv(fh, foreign=True)

    # Aggregate data (DATA tables)
    for fh in _iter_zip_csv(dom_zip, "VAERSDATA"):
        with fh: agg.ingest_data_csv(fh, foreign=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSDATA"):
        with fh: agg.ingest_data_csv(fh, foreign=True)

    return agg.to_summary()

# ------------------------ CLI ------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Build VAERS summary JSON for About page (offline).")
    ap.add_argument("--dom", required=True, help="Path to domestic VAERS zip (AllVAERSDataCSVS.zip)")
    ap.add_argument("--frn", required=True, help="Path to non-domestic VAERS zip (NonDomesticVAERSDATA.zip)")
    ap.add_argument("--out", required=True, help="Output JSON path (e.g., public/data/vaers-summary.json)")
    args = ap.parse_args()

    dom = os.path.abspath(args.dom)
    frn = os.path.abspath(args.frn)
    out = os.path.abspath(args.out)

    if not os.path.exists(dom):
        sys.exit(f"Domestic zip not found: {dom}")
    if not os.path.exists(frn):
        sys.exit(f"Foreign zip not found: {frn}")

    print("[stage] indexing types/dates/manufacturers…", file=sys.stderr)
    summary = summarize(dom, frn)

    payload = {
        "provenance": {
            "built_at_utc": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "inputs": {"dom": dom, "frn": frn},
            "builder": "tools/build_vaers_summary.py",
            "notes": (
                "Counts DIED=='Y'. Domestic=domestic ZIP; Foreign=non-domestic ZIP. "
                "COVID/FLU via VAX_TYPE. Days-to-onset from ONSET_DATE - VAX_DATE or NUMDAYS. "
                "Sex normalized from VAERS values (M/F/U, MALE/FEMALE/UNKNOWN, UNK)."
            ),
        },
        **summary,
    }

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), indent=2)

    ry = payload["reports_by_year"]["deaths_by_year"]["all"]
    cm = payload["covid_deaths_by_month"]["total"]
    mf = payload["covid_deaths_breakdowns"]["manufacturer"]
    sx = payload["covid_deaths_breakdowns"]["sex"]
    print(f"[done] wrote {out}", file=sys.stderr)
    print(f"  years={len(ry)}  months={len(cm)}  manuf={len(mf)}  sex={sx}", file=sys.stderr)

if __name__ == "__main__":
    main()
