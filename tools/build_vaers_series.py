import csv, json, os, glob
from datetime import datetime

ROOT_JSON = 'public/data/vaers-summary-openvaers.json'
ROOTS = ['data/raw/dom', 'data/raw/non']

def parse_date(s):
    s = (s or '').strip()
    if not s: return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y"):
        try: return datetime.strptime(s, fmt)
        except: pass
    return None

def iter_csv(paths):
    for p in paths:
        try:
            with open(p, 'r', encoding='utf-8', errors='ignore', newline='') as f:
                r = csv.DictReader(f)
                for row in r:
                    yield row
        except Exception as e:
            print("! Skipping unreadable CSV:", p, e)

def collect_csvs():
    data_csvs, vax_csvs = [], []
    for root in ROOTS:
        if not os.path.isdir(root): continue
        # match 1990VAERSDATA.csv, 2021VAERSVAX.csv, mixed case, nested
        data_csvs += glob.glob(os.path.join(root, '**', '*VAERSDATA*.csv'), recursive=True)
        data_csvs += glob.glob(os.path.join(root, '**', '*VAERSDATA*.CSV'), recursive=True)
        vax_csvs  += glob.glob(os.path.join(root, '**', '*VAERSVAX*.csv'),  recursive=True)
        vax_csvs  += glob.glob(os.path.join(root, '**', '*VAERSVAX*.CSV'),  recursive=True)
    # de-dupe, sort for stability
    data_csvs = sorted(set(data_csvs))
    vax_csvs  = sorted(set(vax_csvs))
    return data_csvs, vax_csvs

def has_covid(vtypes): return any('COVID' in t for t in vtypes)
def has_covid_or_flu(vtypes): return any(('COVID' in t) or ('FLU' in t) for t in vtypes)

def main():
    data_csvs, vax_csvs = collect_csvs()
    if not data_csvs or not vax_csvs:
        print("No VAERSDATA/VAERSVAX CSVs found. Check unzip paths.")
        print("data_csvs:", len(data_csvs), "vax_csvs:", len(vax_csvs))
        raise SystemExit(2)
    print(f"Found CSVs -> DATA:{len(data_csvs)}  VAX:{len(vax_csvs)}")

    # Build VAERS_ID -> set(VAX_TYPE) and earliest VAX_DATE
    vax_types_by_id = {}
    earliest_vax_date = {}
    for row in iter_csv(vax_csvs):
        vid = (row.get('VAERS_ID') or row.get('VAERSID') or '').strip()
        if not vid: continue
        vtype = (row.get('VAX_TYPE') or '').strip().upper()
        if vtype:
            vax_types_by_id.setdefault(vid, set()).add(vtype)
        vax_date = parse_date(row.get('VAX_DATE'))
        if vax_date:
            cur = earliest_vax_date.get(vid)
            if cur is None or vax_date < cur:
                earliest_vax_date[vid] = vax_date

    # Aggregators
    by_year  = {}     # all deaths by DATEDIED year (all vaccines)
    by_month = {}     # COVID deaths by DATEDIED month (YYYY-MM)
    onset    = [0]*20 # COVID/FLU: ONSET_DATE - earliest VAX_DATE, clamped 0..19

    n_rows = 0
    for row in iter_csv(data_csvs):
        n_rows += 1
        vid = (row.get('VAERS_ID') or row.get('VAERSID') or '').strip()
        if not vid: continue
        if (row.get('DIED') or '').strip().upper() != 'Y':
            continue

        vtypes = vax_types_by_id.get(vid, set())
        datedied = parse_date(row.get('DATEDIED'))

        # All deaths by year (all vaccines)
        if datedied:
            y = str(datedied.year)
            by_year[y] = by_year.get(y, 0) + 1

        # COVID deaths by month
        if datedied and has_covid(vtypes):
            ym = f"{datedied.year:04d}-{datedied.month:02d}"
            by_month[ym] = by_month.get(ym, 0) + 1

        # Days to onset for COVID/FLU
        onset_date = parse_date(row.get('ONSET_DATE'))
        vax_date   = earliest_vax_date.get(vid)
        if onset_date and vax_date and has_covid_or_flu(vtypes):
            d = (onset_date - vax_date).days
            if d < 0: d = 0
            if d > 19: d = 19
            onset[d] += 1

    print(f"Processed rows: {n_rows}")
    print(f"by_year: {len(by_year)}  by_month: {len(by_month)}  onset nonzero bins: {sum(1 for x in onset if x)}")

    # Normalize series
    by_year_series  = [{"label": y, "count": by_year[y]} for y in sorted(by_year.keys())]
    by_month_series = [{"label": ym, "count": by_month[ym]} for ym in sorted(by_month.keys())]
    onset_series    = [{"day": i, "count": onset[i]} for i in range(20)]

    # Patch JSON in place (don’t touch table breakdowns)
    with open(ROOT_JSON, 'r', encoding='utf-8') as f:
        summary = json.load(f)

    summary["covid_deaths_by_year"]  = by_year_series
    summary["covid_deaths_by_month"] = by_month_series
    summary["days_to_onset"]         = onset_series

    with open(ROOT_JSON, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print("Updated", ROOT_JSON)

if __name__ == "__main__":
    main()