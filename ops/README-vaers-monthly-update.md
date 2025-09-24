# VAERS Monthly Update – Runbook (README)

**Goal**  
Regenerate `public/data/vaers-summary.json` each month from official VAERS CSVs and push **only that JSON** to GitHub. Cloudflare redeploys and the **About** page charts/tables update automatically.

> Save this file as: `ops/README-vaers-monthly-update.md`

---

## Prerequisites

- **Windows + PowerShell**
- **Node.js 20+** (any recent LTS is fine)
- **7-Zip** installed at `C:\Program Files\7-Zip\7z.exe`  
  (VAERS ZIPs sometimes use **Deflate64**; Windows’ built-in unzip won’t extract those reliably.)
- GitHub access to upload a single file via the web UI

> No `npm install` required for the monthly run. The builder script is self-contained.

---

## One-Time Repo Hygiene (do this once)

Ensure these files exist in the repo (they already do in the current live ZIP):

- `scripts/vaers-build-from-dir.mjs`  ← local builder that reads extracted CSV folders
- `public/about.html`                 ← contains the VAERS section + **3 script tags** (see below)
- `public/assets/js/vaers-charts.js`
- `public/assets/js/vaers-tables.js`

Ignore the local working folders so you never commit raw CSVs:

    # .gitignore
    _vaers/

(You’ll extract VAERS ZIPs into `_vaers/domestic` and `_vaers/non_domestic` each month.)

Optional: keep empty placeholders so folders exist in git (handy for structure):

    public/data/.gitkeep
    data/vaers/.gitkeep

---

## Monthly Workflow (start → finish)

### 1) Download the official VAERS bundles (captcha page)

Use your browser to download from the VAERS Data page (you’ll pass a captcha):

- **Domestic (All Years Data → Zip File)** – e.g. `AllVAERSDataCSVS.zip`
- **Non-Domestic (All Years Data → Zip File)** – must include both:
  - `NonDomesticVAERSDATA.csv`
  - `NonDomesticVAERSVAX.csv`

Save the two ZIPs somewhere convenient (e.g., your Downloads folder).

---

### 2) Extract with 7-Zip (Deflate64-safe) into the repo

Open **PowerShell** at the **repo root** (the folder that contains `public/`, `scripts/`, `ops/`, etc.) and run:

    # --- Adjust these two paths to where you saved the zips ---
    $domZip = "C:\Users\<you>\Downloads\AllVAERSDataCSVS.zip"
    $nonZip = "C:\Users\<you>\Downloads\NonDomesticVAERSDATA.zip"  # must contain DATA and VAX CSVs

    # --- Choose stable extract folders inside the repo (repeatable month-to-month) ---
    $domDir = "_vaers\domestic"
    $nonDir = "_vaers\non_domestic"
    New-Item -ItemType Directory -Force -Path $domDir, $nonDir | Out-Null

    # --- 7-Zip extraction (handles Deflate64) ---
    $sevenZip = "C:\Program Files\7-Zip\7z.exe"
    & $sevenZip x $domZip -o$domDir -y
    & $sevenZip x $nonZip -o$nonDir -y

After extraction you should have something like:

    _vaers/domestic/
      1990VAERSDATA.csv
      1990VAERSVAX.csv
      1991VAERSDATA.csv
      1991VAERSVAX.csv
      ... (many years)

    _vaers/non_domestic/
      NonDomesticVAERSDATA.csv
      NonDomesticVAERSVAX.csv

> If you accidentally created literal folders named `.\$domDir` or `.\$nonDir`, re-extract using the commands above (those `$` names were meant to be variables).

---

### 3) Build the summary JSON (no npm)

From the repo root in **PowerShell**:

    # Point the builder at the two extracted folders
    $env:VAERS_DATA_DIR   = (Resolve-Path $domDir)
    $env:VAERS_NONDOM_DIR = (Resolve-Path $nonDir)

    Write-Host "Building vaers-summary.json from:`n  $env:VAERS_DATA_DIR`n  $env:VAERS_NONDOM_DIR" -ForegroundColor Cyan

    node scripts/vaers-build-from-dir.mjs

    Write-Host "Done. Upload this file in GitHub web UI:" -ForegroundColor Green
    Resolve-Path "public\data\vaers-summary.json"

This generates/overwrites: `public/data/vaers-summary.json`.

---

### 4) Upload the JSON to GitHub (web UI)

1. In GitHub, open your repo → **Add file** → **Upload files**.  
2. Upload **only**: `public/data/vaers-summary.json`  
3. Commit directly to your default branch (usually `main`).  
4. Cloudflare Pages detects the commit and redeploys; the **About** page charts update.

> **We never commit the raw CSVs or ZIPs.** Only the generated JSON goes to git.

---

## About Page – Hooks (already present; reference for verification)

Make sure the **section block** exists near the end of `public/about.html` (before `</main>`):

    <!-- VAERS Figures (Official Data) -->
    <section class="module" aria-labelledby="vaers-figures">
      <div class="rule"></div>
      <div class="inner">
        <h2 id="vaers-figures">VAERS Figures (Official Data)</h2>

        <!-- Charts grid -->
        <div class="grid" style="margin-top:12px">
          <div id="vaers-by-year" style="height:320px"></div>
          <div id="vaers-covid-deaths-monthly" style="height:320px"></div>
          <div id="vaers-days-to-onset" style="height:320px"></div>
        </div>

        <!-- Wide 3-column table (Manufacturer / Sex / Age) -->
        <div id="vaers-breakdowns" class="table-like" style="margin-top:16px"></div>

        <p class="muted" id="vaers-asof" style="margin-top:8px"></p>
      </div>
    </section>

And add these **three** scripts before `</body>` (keep order):

    <!-- ECharts (UMD) -->
    <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js" defer></script>

    <!-- VAERS renderers -->
    <script src="/assets/js/vaers-charts.js" defer></script>
    <script src="/assets/js/vaers-tables.js" defer></script>

These scripts load `/data/vaers-summary.json`, render the three charts:
- **All Reports to VAERS by Year** (two series)
- **COVID Vaccine Reports of Death by Month** (Total / US-Terr-Unk / Foreign)
- **Deaths by Days to Onset (COVID vs Flu)**

…and the **wide table** (Manufacturer / Sex / Age bins for COVID deaths). Colors/typography follow your existing CSS variables.

---

## (Optional) One-Command Helper (PowerShell)

Save as `ops/update-vaers.ps1` for a one-shot monthly run:

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

    Write-Host "Building vaers-summary.json from:`n  $env:VAERS_DATA_DIR`n  $env:VAERS_NONDOM_DIR" -ForegroundColor Cyan
    node scripts/vaers-build-from-dir.mjs

    Write-Host "Done. Upload this file in GitHub web UI:" -ForegroundColor Green
    Resolve-Path "public\data\vaers-summary.json"

Usage each month (from repo root):

    pwsh ops/update-vaers.ps1

---

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
