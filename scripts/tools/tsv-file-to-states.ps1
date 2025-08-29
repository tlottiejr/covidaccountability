param(
  [string]$In = "db\states.tsv",
  [string]$Out = "db\states.csv"
)

if (-not (Test-Path $In)) { Write-Error "Missing $In"; exit 1 }

# Import as TSV, export as CSV with required header order
$rows = Import-Csv -Delimiter "`t" -Path $In
if (-not $rows -or $rows.Count -eq 0) { Write-Error "No rows in TSV"; exit 1 }

$rows |
  Select-Object @{n='code';e={($_.code).ToUpper().Trim()}},
                @{n='name';e={$_.name.Trim()}},
                @{n='link';e={$_.link.Trim()}},
                @{n='unavailable';e={ if ($_.unavailable -match '^(1|true)$') { 1 } else { 0 }}} |
  Export-Csv -Path $Out -NoTypeInformation -Encoding UTF8

Write-Host "Wrote $($rows.Count) rows to $Out"
