# ==============================================================================
#  Clinix - one-time setup for a clinic PC
# ==============================================================================
#  Run ONCE, as Administrator:
#
#      powershell -ExecutionPolicy Bypass -File deploy\install-clinix.ps1
#
#  Afterwards the nurse turns the PC on, signs in to Windows, and double-clicks
#  the "Clinix" shortcut on the desktop. Nothing else to start - no XAMPP panel,
#  no terminal window.
#
#  What this sets up:
#    1. MySQL as a Windows service        -> starts automatically at boot
#    2. The Clinix server as a logon task -> starts automatically after sign-in
#    3. A desktop shortcut to the app
#
#  Why MySQL is a boot service but Clinix is a logon task: the document preview
#  converts Word files to PDF through Microsoft Word, and Word cannot be driven
#  from a background SYSTEM service - it needs a signed-in Windows session. The
#  logon task keeps that working. (Installing LibreOffice would remove this
#  restriction, but is not required.)
#
#  This file is deliberately plain ASCII: Windows PowerShell 5.1 reads .ps1 files
#  using the system codepage, so accented or box-drawing characters can corrupt
#  the script on a different PC.
#
#  To undo everything: deploy\uninstall-clinix.ps1
# ==============================================================================

param(
  # The Windows account the nurse signs in with. Defaults to whoever runs this
  # script - pass it explicitly if you elevated using a different admin account,
  # e.g. -RunAsUser 'CLINIC-PC\nurse'
  [string]$RunAsUser     = "$env:USERDOMAIN\$env:USERNAME",
  [string]$XamppMysqlBin = 'C:\xampp\mysql\bin',
  [string]$ServiceName   = 'ClinixMySQL',
  [string]$TaskName      = 'Clinix Server',
  # Model used for medicine suggestions; must match a name from 'ollama list'.
  [string]$AiModel       = 'llama3.2:3b'
)

$ErrorActionPreference = 'Stop'

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Note($msg)     { Write-Host "    --  $msg" -ForegroundColor Yellow }

# -- Preconditions -------------------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This script must run as Administrator. Right-click PowerShell, choose "Run as administrator", then run it again.'
}

$root        = Split-Path -Parent $PSScriptRoot
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$mysqld      = Join-Path $XamppMysqlBin 'mysqld.exe'
$mysqlExe    = Join-Path $XamppMysqlBin 'mysql.exe'
$myIni       = Join-Path $XamppMysqlBin 'my.ini'

if (-not (Test-Path $mysqld))     { throw "MySQL not found at $mysqld. Install XAMPP, or pass -XamppMysqlBin <path>." }
if (-not (Test-Path $backendDir)) { throw "backend folder not found at $backendDir" }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js is not installed (or not on PATH). Install it from https://nodejs.org first.' }

Write-Host 'Clinix setup' -ForegroundColor White
Write-Host "  project : $root"
Write-Host "  node    : $node"
Write-Host "  mysql   : $mysqld"
Write-Host "  user    : $RunAsUser"

# -- 1. MySQL as an auto-starting Windows service -------------------------------
Step 1 'Installing MySQL as a Windows service'

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Note "Service '$ServiceName' already exists - leaving it in place."
} else {
  # Stop any MySQL that XAMPP started by hand, or the new service cannot bind
  # port 3306.
  Get-Process mysqld -ErrorAction SilentlyContinue | ForEach-Object {
    Note "Stopping a manually started mysqld (PID $($_.Id))"
    Stop-Process -Id $_.Id -Force
  }
  Start-Sleep -Seconds 3

  # Built as a variable on purpose: PowerShell 5.1 mis-parses an inline
  # --flag="$var" argument to a native executable.
  $defaultsArg = "--defaults-file=$myIni"
  & $mysqld --install $ServiceName $defaultsArg
  if ($LASTEXITCODE -ne 0) { throw "mysqld --install failed (exit $LASTEXITCODE)" }
  Ok "Service '$ServiceName' created"
}

Set-Service -Name $ServiceName -StartupType Automatic
Ok 'Startup type set to Automatic (starts at boot, before anyone signs in)'

if ((Get-Service $ServiceName).Status -ne 'Running') { Start-Service $ServiceName }
Start-Sleep -Seconds 3
Ok "MySQL service is $((Get-Service $ServiceName).Status)"

# -- 2. Database and dependencies ----------------------------------------------
Step 2 'Preparing the database and dependencies'

& $mysqlExe -u root -e 'CREATE DATABASE IF NOT EXISTS clinix;'
Ok 'Database "clinix" exists'

# schema.sql uses plain CREATE TABLE, so re-importing it into a database that
# already has tables fails on the first one and the client stops reading the
# rest of the file. Import it only into an empty database; from then on the
# backend's own ensureDbUpdates() keeps the schema current.
$schema = Join-Path $backendDir 'db\schema.sql'
if (Test-Path $schema) {
  $tableCount = 0
  try {
    $out = & $mysqlExe -u root -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'clinix';"
    if ($out) { $tableCount = [int]($out | Select-Object -First 1) }
  } catch { $tableCount = 0 }

  if ($tableCount -gt 0) {
    Note "Database already has $tableCount table(s) - skipped importing schema.sql"
  } else {
    Get-Content $schema -Raw | & $mysqlExe -u root clinix
    Ok 'Schema imported'
  }
}

# Always run npm install, even when node_modules exists. This script is also the
# way a teammate applies a pulled update, and a checkout that already has
# node_modules from before will be missing any newly added package - the server
# would then crash on a module it cannot find. npm install is quick when there is
# nothing to do.
Push-Location $backendDir
try {
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed in backend' }
  Ok 'Backend dependencies up to date'
} finally { Pop-Location }

# -- 3. Configuration file and encryption key ----------------------------------
# Runs after the database exists, because it inspects the stored data to decide
# whether generating a fresh key is safe.
Step 3 'Checking backend\.env and the encryption key'

# backend\.env is not in git, so a freshly cloned clinic PC has no configuration
# and, more importantly, no DATA_ENC_KEY. Without that key the app silently falls
# back to an insecure derived key - and if the key ever differs from the one the
# data was written with, every encrypted record becomes unreadable.
$envFile = Join-Path $backendDir '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $backendDir '.env.example') $envFile
  Note 'Created backend\.env from .env.example'
}

$envText = Get-Content $envFile -Raw
if ($envText -match '(?m)^\s*DATA_ENC_KEY\s*=\s*[0-9a-fA-F]{64}\s*$') {
  Ok 'DATA_ENC_KEY is set'
} else {
  # Only safe to generate a key when nothing has been encrypted yet. If the
  # database already holds encrypted rows, a new key would orphan them.
  $encryptedRows = 0
  try {
    # No stderr redirect here: in PowerShell 5.1 redirecting a native command's
    # stderr turns ordinary output into an error record and would abort the run.
    $out = & $mysqlExe -u root clinix -N -B -e "SELECT COUNT(*) FROM accounts WHERE username LIKE 'enc:v1:%';"
    if ($out) { $encryptedRows = [int]($out | Select-Object -First 1) }
  } catch { $encryptedRows = 0 }

  if ($encryptedRows -gt 0) {
    Note 'This database already contains encrypted data but backend\.env has no'
    Note 'DATA_ENC_KEY. Copy the DATA_ENC_KEY from the PC that created the data'
    Note 'into backend\.env before using the system, or those records will not'
    Note 'be readable. No key was generated.'
  } else {
    $newKey = & $node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    if ($envText -match '(?m)^\s*DATA_ENC_KEY\s*=') {
      $envText = $envText -replace '(?m)^\s*DATA_ENC_KEY\s*=.*$', "DATA_ENC_KEY=$newKey"
    } else {
      $envText = "DATA_ENC_KEY=$newKey`r`n" + $envText
    }
    Set-Content -Path $envFile -Value $envText -Encoding ASCII
    Ok 'Generated a new DATA_ENC_KEY in backend\.env'
    Note 'Back this file up. It is the only way to read the encrypted records.'
  }
}

# -- 4. Build the frontend so the server can serve it ---------------------------
Step 4 'Building the user interface'

# Always rebuild. An existing frontend\dist from an earlier checkout would keep
# serving the OLD interface after a git pull, which looks exactly like "my
# changes did not arrive" and is miserable to diagnose.
Push-Location $frontendDir
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed in frontend' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed in frontend' }
  Ok 'Interface rebuilt into frontend\dist'
} finally { Pop-Location }

# -- 5. Start the Clinix server automatically at sign-in ------------------------
Step 5 'Registering the Clinix server to start at sign-in'

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Launch through a tiny VBScript so no console window appears. A visible black
# node.exe window is not just untidy: the nurse can close it by accident, which
# silently takes the whole system down. wscript.exe starts the server hidden and
# exits immediately, and the output goes to a log file instead of the screen.
$logFile  = Join-Path $backendDir 'clinix-server.log'
$launcher = Join-Path $PSScriptRoot 'start-clinix-hidden.vbs'

# The whole command is wrapped in one extra pair of quotes because that is how
# cmd.exe accepts a quoted program path (needed when Node sits in
# "C:\Program Files\nodejs"). The quotes are then doubled to escape them for
# VBScript, mechanically rather than by hand.
$command   = 'cmd /c "' + '"' + $node + '" src\server.js > "' + $logFile + '" 2>&1' + '"'
$vbsString = '"' + ($command -replace '"', '""') + '"'

# Each concatenated line is parenthesised: in PowerShell the comma binds tighter
# than +, so without them an element becomes a nested array instead of a string.
$vbsLines = @(
  "' Generated by install-clinix.ps1 - starts the Clinix server with no window.",
  "' Regenerated every time the installer runs; edit the installer, not this file.",
  'Set sh = CreateObject("WScript.Shell")',
  ('sh.CurrentDirectory = "' + $backendDir + '"'),
  ('sh.Run ' + $vbsString + ', 0, False')
)
Set-Content -Path $launcher -Value $vbsLines -Encoding ASCII
Ok "Hidden launcher written: $launcher"

$action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $launcher + '"') -WorkingDirectory $backendDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $RunAsUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $taskPrincipal `
  -Description 'Starts the Clinix clinic records server when a user signs in.' | Out-Null
Ok "Task '$TaskName' registered for $RunAsUser"

# The server should also be running right now, not only after the next sign-in.
# Any server already running is running the PREVIOUS code, so it is stopped and
# started again rather than left alone. Otherwise a teammate would run this after
# a git pull, see it report success, and still be using the old build.
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
           Where-Object { $_.CommandLine -match 'server\.js' }
if ($running) {
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Note 'Stopped the previously running server so the new code takes effect'
  Start-Sleep -Seconds 2
}
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 6
Ok 'Clinix server started'

# -- 6. Desktop shortcut --------------------------------------------------------
Step 6 'Creating the desktop shortcut'

$url = 'http://localhost:4001'
$shortcut = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Clinix.url'
$shortcutBody = "[InternetShortcut]`r`nURL=$url`r`nIconIndex=0`r`n"
Set-Content -Path $shortcut -Value $shortcutBody -Encoding ASCII
Ok "Shortcut created: $shortcut"

# -- Verify --------------------------------------------------------------------
Step 7 'Checking that the app answers'

$healthy = $false
foreach ($attempt in 1..10) {
  try {
    $r = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) { Ok "$url responded" }
else { Note "No response from $url yet. Check the 'Clinix Server' task in Task Scheduler." }

# -- Done ----------------------------------------------------------------------
Write-Host ''
Write-Host '--------------------------------------------------------' -ForegroundColor White
Write-Host ' Setup complete.' -ForegroundColor Green
Write-Host "   The nurse only has to sign in to Windows and double-click 'Clinix'."
Write-Host "   Address: $url"
Write-Host ''
Write-Host ' IMPORTANT: do NOT press Start next to MySQL in the XAMPP Control' -ForegroundColor Yellow
Write-Host '   Panel any more. MySQL is now a service and starts on its own;'
Write-Host '   starting a second copy by hand will fail on port 3306.'
Write-Host '--------------------------------------------------------' -ForegroundColor White
