# ==============================================================================
#  Clinix - schedule the daily backup
# ==============================================================================
#  Run ONCE, as Administrator:
#      powershell -ExecutionPolicy Bypass -File deploy\install-backup-task.ps1
#
#  Creates a Windows scheduled task that runs deploy\backup-clinix.ps1 every day.
#  A backup nobody remembers to run is not a backup.
#
#  To remove it:  Unregister-ScheduledTask -TaskName 'Clinix Backup' -Confirm:$false
# ==============================================================================

param(
  [string]$TaskName   = 'Clinix Backup',
  [string]$AtTime     = '18:30',                # after clinic hours
  [string]$BackupRoot = 'C:\ClinixBackups'
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This script must run as Administrator.'
}

$script = Join-Path $PSScriptRoot 'backup-clinix.ps1'
if (-not (Test-Path $script)) { throw "backup-clinix.ps1 not found next to this script" }

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Runs as SYSTEM: the backup only touches mysqldump, files and folders - no
# Microsoft Word automation - so it does not need a signed-in desktop session,
# and it still runs on a day nobody logs in.
$argument = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" -BackupRoot "' + $BackupRoot + '"'
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger  = New-ScheduledTaskTrigger -Daily -At $AtTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
              -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $taskPrincipal `
  -Description 'Daily backup of the Clinix database, encryption key and uploaded documents.' | Out-Null

Write-Host "Scheduled '$TaskName' daily at $AtTime -> $BackupRoot" -ForegroundColor Green
Write-Host ''
Write-Host 'Running it once now to confirm it works...' -ForegroundColor White
Start-ScheduledTask -TaskName $TaskName
Write-Host "Check $BackupRoot in a moment for a dated folder." -ForegroundColor White
Write-Host ''
Write-Host 'REMINDER: the backup folder contains the encryption key as well as the' -ForegroundColor Yellow
Write-Host '  patient data. Keep it as securely as the clinic paper records, and copy' -ForegroundColor Yellow
Write-Host '  it somewhere off this PC - a backup on the same disk does not survive' -ForegroundColor Yellow
Write-Host '  that disk failing.' -ForegroundColor Yellow
