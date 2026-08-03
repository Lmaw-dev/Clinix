# ==============================================================================
#  Clinix - back up the database, the encryption key, and uploaded files
# ==============================================================================
#  Run by hand:
#      powershell -ExecutionPolicy Bypass -File deploy\backup-clinix.ps1
#
#  Or schedule it (as Administrator, once):
#      powershell -ExecutionPolicy Bypass -File deploy\install-backup-task.ps1
#
#  WHY THE KEY IS IN HERE. The personal and medical fields are encrypted with
#  DATA_ENC_KEY from backend\.env. A database dump on its own is unreadable
#  without it - restoring one while holding a different key gives you a clinic
#  full of blank records. The key therefore has to travel with the backup.
#
#  THE FLIP SIDE: a backup folder holds the data AND the key that unlocks it.
#  Treat it exactly as you would the clinic's paper records - keep it somewhere
#  only the nurse and administrator can reach, and do not sync it to a personal
#  cloud drive.
#
#  Plain ASCII on purpose: PowerShell 5.1 reads .ps1 using the system codepage.
# ==============================================================================

param(
  [string]$BackupRoot    = 'C:\ClinixBackups',
  [string]$XamppMysqlBin = 'C:\xampp\mysql\bin',
  [string]$Database      = 'clinix',
  [int]$KeepDays         = 30
)

$ErrorActionPreference = 'Stop'

function Ok($m)   { Write-Host "  OK  $m" -ForegroundColor Green }
function Note($m) { Write-Host "  --  $m" -ForegroundColor Yellow }

$root       = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$mysqldump  = Join-Path $XamppMysqlBin 'mysqldump.exe'

if (-not (Test-Path $mysqldump)) { throw "mysqldump.exe not found at $mysqldump" }

$stamp  = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$outDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Clinix backup -> $outDir" -ForegroundColor White

# -- 1. Database ---------------------------------------------------------------
# --single-transaction takes a consistent snapshot without locking the tables,
# so a backup running mid-shift does not block the nurse.
$dumpPath = Join-Path $outDir 'clinix.sql'
& $mysqldump -u root --single-transaction --routines --events $Database |
  Out-File -FilePath $dumpPath -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed (exit $LASTEXITCODE)" }

$dumpSize = (Get-Item $dumpPath).Length
if ($dumpSize -lt 1024) { throw "The dump is only $dumpSize bytes - treating it as failed rather than keeping a useless backup." }
Ok ("Database dumped ({0:N0} KB)" -f ($dumpSize / 1KB))

# -- 2. The encryption key and configuration -----------------------------------
$envFile = Join-Path $backendDir '.env'
if (Test-Path $envFile) {
  Copy-Item $envFile (Join-Path $outDir 'env.backup') -Force
  $hasKey = (Get-Content $envFile -Raw) -match '(?m)^\s*DATA_ENC_KEY\s*=\s*[0-9a-fA-F]{64}\s*$'
  if ($hasKey) { Ok 'backend\.env saved (contains DATA_ENC_KEY)' }
  else { Note 'backend\.env saved, but it has no DATA_ENC_KEY - check that the app is configured' }
} else {
  Note 'backend\.env not found - the encrypted fields could NOT be recovered from this backup'
}

# -- 3. Uploaded documents -----------------------------------------------------
# The database stores only the metadata; the files themselves live on disk, so a
# dump alone would restore a list of documents that no longer open.
$uploads = Join-Path $backendDir 'uploads'
if ((Test-Path $uploads) -and (Get-ChildItem $uploads -File -ErrorAction SilentlyContinue)) {
  $zip = Join-Path $outDir 'uploads.zip'
  Compress-Archive -Path (Join-Path $uploads '*') -DestinationPath $zip -Force
  Ok ("Uploaded documents archived ({0:N0} KB)" -f ((Get-Item $zip).Length / 1KB))
} else {
  Note 'No uploaded documents to archive'
}

# -- 4. Restore instructions, written next to the data -------------------------
# A backup nobody knows how to restore is not a backup.
$readme = @"
Clinix backup - $stamp

Contents
  clinix.sql   full database dump
  env.backup   backend configuration, INCLUDING DATA_ENC_KEY
  uploads.zip  uploaded documents (if any existed)

To restore on a clean machine:

  1. Install XAMPP and Node.js, and copy the Clinix project across.
  2. Recreate the database and load the dump:
       C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS $Database;"
       Get-Content clinix.sql | C:\xampp\mysql\bin\mysql.exe -u root $Database
  3. Copy env.backup to backend\.env
       THIS STEP IS NOT OPTIONAL. Without the DATA_ENC_KEY it contains, every
       encrypted field (names, medical details, consultations) reads as blank.
  4. Unzip uploads.zip into backend\uploads\
  5. Start the app: deploy\install-clinix.ps1, or 'npm start' in backend\

Keep this folder as securely as the clinic's paper records: it holds the patient
data and the key that decrypts it.
"@
Set-Content -Path (Join-Path $outDir 'RESTORE.txt') -Value $readme -Encoding ASCII
Ok 'RESTORE.txt written'

# -- 5. Retention --------------------------------------------------------------
$cutoff = (Get-Date).AddDays(-$KeepDays)
$old = Get-ChildItem $BackupRoot -Directory -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' -and $_.CreationTime -lt $cutoff }
foreach ($dir in $old) {
  Remove-Item $dir.FullName -Recurse -Force
  Note "Removed old backup $($dir.Name)"
}

$kept = (Get-ChildItem $BackupRoot -Directory -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' }).Count
Write-Host ''
Write-Host "Backup complete. $kept backup(s) kept in $BackupRoot (retention: $KeepDays days)." -ForegroundColor Green
