param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out
)

# Converts a Word document to PDF for exact-fidelity preview.
# Prefers LibreOffice (headless) if available; otherwise uses Microsoft Word via COM.

$ErrorActionPreference = 'Stop'

function Find-Soffice {
  $cmd = Get-Command soffice -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @(
    "$env:ProgramFiles\LibreOffice\program\soffice.exe",
    "${env:ProgramFiles(x86)}\LibreOffice\program\soffice.exe"
  )) { if (Test-Path $p) { return $p } }
  return $null
}

$soffice = Find-Soffice
if ($soffice) {
  $outDir = Split-Path -Parent $Out
  & $soffice --headless --norestore --convert-to pdf --outdir $outDir $In | Out-Null
  # LibreOffice names the output <basename>.pdf in $outDir; rename to the requested $Out.
  $produced = Join-Path $outDir ((Split-Path -Leaf $In) -replace '\.[^.]+$', '.pdf')
  if ((Test-Path $produced) -and ($produced -ne $Out)) { Move-Item -Force $produced $Out }
  if (Test-Path $Out) { exit 0 } else { throw "LibreOffice did not produce a PDF" }
}

# Fall back to Microsoft Word COM automation.
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try { $word.DisplayAlerts = 0 } catch {}
$doc = $null
try {
  # Open(FileName, ConfirmConversions=$false, ReadOnly=$true)
  $doc = $word.Documents.Open($In, $false, $true)
  # 17 = wdFormatPDF
  $doc.SaveAs([ref]$Out, [ref]17)
  $doc.Close([ref]$false)
  $doc = $null
} finally {
  if ($doc -ne $null) { try { $doc.Close([ref]$false) } catch {} }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
if (-not (Test-Path $Out)) { throw "Word did not produce a PDF" }
exit 0
