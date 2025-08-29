# scripts/tools/clipboard-tsv-to-states.ps1
$txt = Get-Clipboard -Format Text
if (-not $txt) { Write-Error "Clipboard empty. Copy the D1 grid first (Ctrl+A, Ctrl+C)."; exit 1 }

$lines = $txt -split "(\r?\n)" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
if ($lines.Count -lt 2) { Write-Error "Not enough lines (need header + rows)."; exit 1 }

function Parse-TSVLine([string]$line) { $line -split "`t" }

$header = (Parse-TSVLine $lines[0]) | ForEach-Object { $_.Trim().ToLower() }
$expected = @('code','name','link','unavailable')
$map = @{}
for ($i=0; $i -lt $header.Count; $i++) {
  $h = $header[$i]; if ($expected -contains $h) { $map[$h] = $i }
}
foreach ($col in $expected) { if (-not $map.ContainsKey($col)) { Write-Error "Missing column '$col'."; exit 1 } }

$rows = @()
for ($i=1; $i -lt $lines.Count; $i++) {
  $cols = Parse-TSVLine $lines[$i]
  if ($cols.Count -lt $header.Count) { continue }
  $code = ($cols[$map['code']]).Trim().ToUpper()
  $name = ($cols[$map['name']]).Trim()
  $link = ($cols[$map['link']]).Trim()
  $unav = ($cols[$map['unavailable']]).Trim()
  if ($unav -notmatch '^(0|1)$') { $unav = '0' }
  if (-not $code) { continue }
  $rows += [pscustomobject]@{ code=$code; name=$name; link=$link; unavailable=$unav }
}

New-Item -ItemType Directory -Force -Path db | Out-Null
$dest = "db/states.csv"
$rows | Select-Object code,name,link,unavailable |
  Export-Csv -Path $dest -NoTypeInformation -Encoding UTF8
Write-Host "Wrote $($rows.Count) rows to $dest"
