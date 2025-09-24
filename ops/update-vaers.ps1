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
