#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Build a compact summary JSON for the About page charts/tables from *local* VAERS
zip files (domestic + non-domestic), entirely offline.

Fixes included:
- Robust CSV decoding (UTF-8 with BOM, but tolerant to bad bytes via errors='replace')
  so UnicodeDecodeError cannot crash the run.
- Zip reading fallback to 7-Zip (p7zip) for Deflate64 archives that stdlib can't open.
- Streaming processing (no full-file loads).

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

# ------------------------------- Zip reading -------------------------------

def _wrap_text_stream(binary_stream) -> io.TextIOBase:
    """
    Always-return a tolerant text wrapper.
    - utf-8-sig to gracefully skip BOMs
    - errors='replace' so we never raise UnicodeDecodeError mid-iteration
    """
    return io.TextIOWrapper(
        binary_stream,
        encoding="utf-8-sig",
        errors="replace",
        newline=""
    )

def _iter_zip_csv(zip_path: str, name_contains: str) -> Iterator[io.TextIOBase]:
    """
    Yield *text* file handles for CSVs inside `zip_path` whose filename contains
    `name_contains` (case-insensitive). Use stdlib ZipFile first; if it raises
    NotImplementedError (e.g., Deflate64), extract with 7z to a temp dir.
    """
    import zipfile

    # First try stdlib zipfile
    try:
        with zipfile.ZipFile(zip_path) as z:
            for info in z.infolist():
                name = info.filename
                if name_contains.lower() in name.lower() and name.lower().endswith(".csv"):
                    raw = z.open(info, "r")          # binary
                    yield _wrap_text_stream(raw)     # tolerant text stream
        return
    except NotImplementedError:
        # Unsupported compression -> use 7z
        pass

    # Fallback: 7z extraction to temp dir
    tmpdir = tempfile.mkdtemp(prefix="vaers7z_")
    try:
        try:
            subprocess.run(
                ["7z", "x", "-y", f"-o{tmpdir}", zip_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )
        except FileNotFoundError:
            raise RuntimeError(
                "7z not found. Install with:\n  sudo apt-get update && sudo apt-get install -y p7zip-full"
            )

        for root, _, files in os.walk(tmpdir):
            for fn in files:
                if fn.lower().endswith(".csv") and name_contains.lower() in fn.lower():
                    raw = open(os.path.join(root, fn), "rb")
                    yield _wrap_text_stream(raw)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# ------------------------------- Utilities ---------------------------------

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

# ------------------------------- Aggregation -------------------------------

class Aggregator:
    """
    Collects all aggregates needed by the About page.
    """
    def __init__(self) -> None:
        # deaths by year (dom+foreign)
        self.deaths_by_year: Counter[int] = Counter()

        # covid deaths by month, split
        self.covid_month_total: Counter[str] = Counter()
        self.covid_month_dom: Counter[str] = Counter()
        self.covid_month_frn: Counter[str] = Counter()

        # covid breakdowns (domestic only)
        self.manufacturer_dom: Counter[str] = Counter()
        self.sex_dom: Counter[str] = Counter()
        self.age_bins_dom: Counter[str] = Counter()
        self.age_total_dom: int = 0

        # days to onset histogram (0..19), covid vs flu (all regions)
        self.days_covid: Counter[int] = Counter()
        self.days_flu: Counter[int] = Counter()

        # join cache from VAERSVAX
        self.vax_by_id_dom: Dict[int, List[Tuple[str, str]]] = defaultdict(list)
        self.vax_by_id_frn: Dict[int, List[Tuple[str, str]]] = defaultdict(list)

    # ---- ingest ----

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

    def ingest_data_csv(self, fh: io.TextIOBase, foreign: bool) -> None:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                vid = _parse_int(row.get("VAERS_ID") or row.get("vaers_id") or "")
                if vid is None:
                    continue

                # only death reports
                if (row.get("DIED") or row.get("died") or "").strip().upper() != "Y":
                    continue

                recv = _parse_date(row.get("RECVDATE") or row.get("recvdate") or "")
                if recv:
                    self.deaths_by_year[recv.year] += 1

                # days to onset
                vax_date = _parse_date(row.get("VAX_DATE") or row.get("vax_date") or "")
                onset_date = _parse_date(row.get("ONSET_DATE") or row.get("onset_date") or "")
                numdays = _parse_int(row.get("NUMDAYS") or row.get("numdays") or "")
                days = (onset_date - vax_date).days if (vax_date and onset_date) else numdays

                # vaccine types for this report
                vlist = (self.vax_by_id_frn if foreign else self.vax_by_id_dom).get(vid, [])
                has_covid = any(vt == "COVID19" for vt, _ in vlist)
                has_flu   = any(vt == "FLU"     for vt, _ in vlist)

                # covid deaths by month
                if recv and has_covid:
                    mk = _month_key(recv)
                    self.covid_month_total[mk] += 1
                    (self.covid_month_frn if foreign else self.covid_month_dom)[mk] += 1

                # breakdowns (domestic COVID only)
                if not foreign and has_covid:
                    # manufacturer (dedup per report)
                    seen = set()
                    for vt, manu in vlist:
                        if vt == "COVID19":
                            key = manu or "Unknown"
                            if key not in seen:
                                self.manufacturer_dom[key] += 1
                                seen.add(key)

                    sex = (row.get("SEX") or row.get("sex") or "Unknown").strip().title()
                    if sex not in ("Male", "Female"):
                        sex = "Unknown"
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

    # ---- export ----

    def to_summary(self) -> dict:
        years_pairs = [[y, c] for y, c in sorted(self.deaths_by_year.items())]

        def _pairs(counter: Counter[str]) -> List[List[object]]:
            return [[k, counter[k]] for k in sorted(counter.keys())]

        def _bkd(counter: Counter[str]) -> List[dict]:
            items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
            return [{"category": k, "count": v} for k, v in items]

        covid_pairs = [[i, self.days_covid.get(i, 0)] for i in range(0, 20)]
        flu_pairs   = [[i, self.days_flu.get(i, 0)]   for i in range(0, 20)]

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
                # compatibility with older front-end shapes
                "deaths": {"all": years_pairs},
                "all": years_pairs
            },
            "covid_deaths_by_month": {
                "total": _pairs(self.covid_month_total),
                "us_territories": _pairs(self.covid_month_dom),
                "foreign": _pairs(self.covid_month_frn),
            },
            "days_to_onset": {
                "covid": covid_pairs,
                "flu":   flu_pairs,
            },
            "covid_deaths_breakdowns": {
                "manufacturer": _bkd(self.manufacturer_dom),
                "sex": _bkd(self.sex_dom),
                "age_bins": age_list,
            },
        }

# ------------------------------- Orchestration ------------------------------

def summarize(dom_zip: str, frn_zip: str) -> dict:
    agg = Aggregator()

    # Join data first (VAX tables)
    for fh in _iter_zip_csv(dom_zip, "VAERSVAX"):
        with fh:
            agg.ingest_vax_csv(fh, foreign=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSVAX"):
        with fh:
            agg.ingest_vax_csv(fh, foreign=True)

    # Then process DATA tables
    for fh in _iter_zip_csv(dom_zip, "VAERSDATA"):
        with fh:
            agg.ingest_data_csv(fh, foreign=False)
    for fh in _iter_zip_csv(frn_zip, "VAERSDATA"):
        with fh:
            agg.ingest_data_csv(fh, foreign=True)

    return agg.to_summary()

# ------------------------------------ CLI -----------------------------------

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
                "Counts reports with DIED=='Y'. Domestic=domestic ZIP; Foreign=non-domestic ZIP. "
                "COVID/FLU via VAX_TYPE in VAERSVAX. Days-to-onset = ONSET_DATE - VAX_DATE or NUMDAYS. "
                "Compatibility keys included for front-end fallbacks."
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
    print(f"[done] wrote {out}", file=sys.stderr)
    print(f"  years={len(ry)}  months={len(cm)}  manuf={len(mf)}", file=sys.stderr)

if __name__ == "__main__":
    main()
