# VAERS Monthly Update – Runbook (README)

**Goal**  
Regenerate `public/data/vaers-summary.json` each month from official VAERS CSVs and push **only that JSON** to GitHub. Cloudflare redeploys and the **About** page charts/tables update automatically.

> Save this file as: `ops/README-vaers-monthly-update.md`

---

## Prerequisites

- **Windows + PowerShell**
- **Node.js 20+** (any recent LTS is fine)
- **7-Zip** at `C:\Program Files\7-Zip\7z.exe`  
  *(Some VAERS ZIPs use Deflate64; Windows’ unzip can fail.)*
- GitHub access to upload a single file via the web UI  
- No `npm install` required. The builder scripts are self-contained.

---

## One-Time Repo Hygiene (do this once)

Ensure these files exist in the repo:

- `scripts/vaers-build-from-dir.mjs` — main builder that reads extracted CSV folders
- `scripts/vaers-compute-deaths-by-year.mjs` — **adds `deaths_by_year` to JSON (NEW)**
- `public/about.html` — contains the VAERS section + **3 script tags**
- `public/assets/js/vaers-charts.js`
- `public/assets/js/vaers-tables.js`

Ignore local working folders so you never commit raw CSVs:

```gitignore
_vaers/
```

(Each month you’ll extract ZIPs into `_vaers/domestic` and `_vaers/non_domestic`.)

Optional placeholders to keep folders in git:

```
public/data/.gitkeep
data/vaers/.gitkeep
```

---

## Monthly Workflow (start → finish)

### 1) Download the official VAERS bundles (captcha page)

From the VAERS Data page (you’ll pass a captcha), download:

- **Domestic (All Years Data → Zip File)** — e.g. `AllVAERSDataCSVS.zip`
- **Non-Domestic (All Years Data → Zip File)** — the ZIP must include:
  - `NonDomesticVAERSDATA.csv`
  - `NonDomesticVAERSVAX.csv`

Save both ZIPs (e.g., in your Downloads folder).

---

### 2) Extract with 7-Zip (Deflate64-safe) into the repo

Open **PowerShell** at the **repo root** (folder with `public/`, `scripts/`, `ops/`, …) and run:

```powershell
# --- Adjust these two paths to where you saved the zips ---
$domZip = "C:\Users\<you>\Downloads\AllVAERSDataCSVS.zip"
$nonZip = "C:\Users\<you>\Downloads\NonDomesticVAERSDATA.zip"  # must contain DATA and VAX CSVs

# --- Stable extract folders inside the repo (repeat month-to-month) ---
$domDir = "_vaers\domestic"
$nonDir = "_vaers\non_domestic"
New-Item -ItemType Directory -Force -Path $domDir, $nonDir | Out-Null

# --- 7-Zip extraction (handles Deflate64) ---
$sevenZip = "C:\Program Files\7-Zip\7z.exe"
& $sevenZip x $domZip -o$domDir -y
& $sevenZip x $nonZip -o$nonDir -y
```

Expected structure after extraction:

```
_vaers/domestic/
  1990VAERSDATA.csv
  1990VAERSVAX.csv
  1991VAERSDATA.csv
  1991VAERSVAX.csv
  ... (many years)

_vaers/non_domestic/
  NonDomesticVAERSDATA.csv
  NonDomesticVAERSVAX.csv
```

> If you accidentally created literal folders named `.\$domDir` or `.\$nonDir`, re-extract with the commands above (`$` names are variables).

---

### 3) Build the **base** summary JSON (no npm)

```powershell
# Point the builder at the two extracted folders
$env:VAERS_DATA_DIR   = (Resolve-Path $domDir)
$env:VAERS_NONDOM_DIR = (Resolve-Path $nonDir)

Write-Host "Building vaers-summary.json from:`n  $env:VAERS_DATA_DIR`n  $env:VAERS_NONDOM_DIR" -ForegroundColor Cyan

node scripts/vaers-build-from-dir.mjs

Write-Host "Base JSON built." -ForegroundColor Green
Resolve-Path "public\data\vaers-summary.json"
```

This creates/overwrites: `public/data/vaers-summary.json`.

---

### 3b) **NEW — Inject `deaths_by_year` (required for Chart #1)**

Chart #1 on **About** uses **yearly deaths** (Total vs **Non-COVID**), not “all reports.”  
Run the injector to scan VAERS DATA/VAX CSVs and merge `deaths_by_year`:

```powershell
# Uses the same VAERS_DATA_DIR and VAERS_NONDOM_DIR set in step 3
node scripts/vaers-compute-deaths-by-year.mjs

Write-Host "Injected deaths_by_year." -ForegroundColor Green
Resolve-Path "public\data\vaers-summary.json"
```

You should now see a block like:

```json
"deaths_by_year": [
  { "year": 1990, "all": 123, "non_covid": 120 },
  { "year": 1991, "all": 110, "non_covid": 108 }
]
```

---

### 4) Upload the JSON to GitHub (web UI)

1. In GitHub: repo → **Add file** → **Upload files**  
2. Upload **only**: `public/data/vaers-summary.json`  
3. Commit to the default branch (usually `main`)  
4. Cloudflare Pages redeploys; the **About** page updates automatically

> **Do not commit the CSVs or ZIPs.** Only the generated JSON goes to git.

---

## About Page – Quick Verification

Confirm these three scripts are present just before `</body>` in `public/about.html`:

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js" defer></script>
<script src="/assets/js/vaers-charts.js" defer></script>
<script src="/assets/js/vaers-tables.js" defer></script>
```

The charts rendered:

1. **All Deaths Reported to VAERS by Year**  
   - Uses `deaths_by_year` (from **Step 3b**)  
   - Lines: **Reports of Death** and **All Non-COVID-Vaccine Deaths**
2. **COVID Vaccine Reports of Death by Month**  
   - Uses `covid_deaths_by_month` (base builder)  
   - Series: **Total**, **US/Terr/Unknown**, **Foreign**
3. **VAERS COVID/FLU Vaccine Reported Deaths by Days to Onset**  
   - Uses `deaths_days_to_onset` (base builder)  
   - Series: **COVID-19**, **Flu**

The **wide table** (Manufacturer / Sex / Age) is unchanged and reads from the breakdowns in the JSON.

---

## Post-Update Checklist

- About page shows updated **“As of …”** date  
- Chart #1 shows **deaths** (two lines: All & Non-COVID)  
- Monthly and Days-to-Onset charts populate  
- Wide table populates  
- If stale, hard-refresh (Ctrl+F5)

---

## Troubleshooting

**Chart #1 blank / NaN**  
- Step **3b** wasn’t run, or `deaths_by_year` wasn’t written.  
- Open `/public/data/vaers-summary.json` and confirm the array exists.

**ECharts blocked**  
- `public/_headers` must allow `https://cdn.jsdelivr.net` in `script-src`.

**Extraction errors**  
- Use **7-Zip**; some VAERS bundles are **Deflate64**.

---

## Data Definitions (reference)

- **Deaths by Year (All vs Non-COVID)**  
  - From `VAERSDATA`: `DIED='Y'`; year = `year(RECVDATE)`  
  - A death is **COVID** if any joined `VAERSVAX` row has `VAX_TYPE='COVID19'`  
  - `non_covid = all - covid`
- **COVID Deaths by Month**  
  - `DIED='Y'` + `VAX_TYPE='COVID19'`; group by `month(RECVDATE)`  
  - Split **US/Terr/Unknown** vs **Foreign** using `STATE` membership (blank/Unknown → US/Terr/Unknown)
- **Days to Onset (COVID vs Flu)**  
  - Prefer `NUMDAYS`; else `ONSET_DATE - VAX_DATE` in days; bucket `0…19`  
  - COVID = `VAX_TYPE='COVID19'`; Flu = `VAX_TYPE` starts with `FLU`

---

## Optional: One-Command Helper

Save as `ops/update-vaers.ps1` to run steps 3 + 3b in one shot (after manual downloads/extraction):

```powershell
param(
  [string]$Domestic    = "_vaers\domestic",
  [string]$NonDomestic = "_vaers\non_domestic"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path $Domestic))    { throw "Domestic dir not found: $Domestic" }
if (!(Test-Path $NonDomestic)) { throw "Non-domestic dir not found: $NonDomestic" }

$env:VAERS_DATA_DIR   = (Resolve-Path $Domestic)
$env:VAERS_NONDOM_DIR = (Resolve-Path $NonDomestic)

Write-Host "Building base JSON..." -ForegroundColor Cyan
node scripts/vaers-build-from-dir.mjs

Write-Host "Injecting deaths_by_year..." -ForegroundColor Cyan
node scripts/vaers-compute-deaths-by-year.mjs

Write-Host "Ready to upload:" -ForegroundColor Green
Resolve-Path "public\data\vaers-summary.json"
```

Usage each month:

```powershell
pwsh ops/update-vaers.ps1
```

## Post-Update Checklist

- Open the deployed site (e.g., `https://<your-domain>/about.html`).
- Confirm the timestamp text **“As of …”** reflects this month’s VAERS refresh.
- Verify all three charts render and the table populates.
- Hard refresh (Ctrl+F5) if your browser cached an older JSON.

---

## FAQ

**Do we commit CSVs or ZIPs?**  
No. Only `public/data/vaers-summary.json` is committed.

**Can we automate downloads in CI?**  
No. The VAERS site uses a captcha before download. That’s why the monthly **local** step is: download zips → extract → run builder → upload the JSON.

**What if the CDC changes filenames/years?**  
No problem. You’re extracting locally by hand each month; the builder reads the actual CSVs from the two folders you point at. No code changes needed for a simple year rollover.

---

## Data Fields & Figure Definitions (reference)

- **Reports by Year:** count `VAERS_ID` by `year(RECVDATE)`; split **US/Terr/Unk** vs **Foreign** using `STATE` membership (US states + DC + territories; blank/Unknown counted with US/Terr/Unk).
- **COVID Deaths by Month:** `DIED='Y'` joined with `VAERSVAX` where `VAX_TYPE='COVID19'`; group by `month(RECVDATE)` into **Total / US-Terr-Unk / Foreign**.
- **Days to Onset (COVID vs Flu):** for `DIED='Y'`, prefer `NUMDAYS`, else `ONSET_DATE - VAX_DATE` (days); bucket `0…19`. COVID = `VAX_TYPE='COVID19'`; Flu = `VAX_TYPE` starts with `FLU`.
- **Breakdowns table (COVID deaths):** counts by `VAX_MANU`, `SEX`, and age bins `0.5–5, 5–12, 12–25, 25–51, 51–66, 66–81, 81–121, Unknown, All Ages`.
