# ===============================================================================
#  Clinix - undo the automatic startup setup
# ===============================================================================
#  Run as Administrator:
#
#      powershell -ExecutionPolicy Bypass -File deploy\uninstall-clinix.ps1
#
#  Removes the MySQL service, the logon task and the desktop shortcut, putting
#  the PC back to "start XAMPP and npm run dev by hand".
#  Your database contents and files are NOT touched.
# ===============================================================================

param(
  [string]$XamppMysqlBin = 'C:\xampp\mysql\bin',
  [string]$ServiceName   = 'ClinixMySQL',
  [string]$TaskName      = 'Clinix Server'
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This script must run as Administrator.'
}

# -- Logon task + running server ----------------------------------------------
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'" -ForegroundColor Green
} else {
  Write-Host "No scheduled task '$TaskName' found" -ForegroundColor Yellow
}

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.js' } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Host "Stopped Clinix server (PID $($_.ProcessId))" -ForegroundColor Green
  }

# -- MySQL service (data is left completely untouched) ------------------------
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  & (Join-Path $XamppMysqlBin 'mysqld.exe') --remove $ServiceName
  Write-Host "Removed MySQL service '$ServiceName' (databases untouched)" -ForegroundColor Green
} else {
  Write-Host "No MySQL service '$ServiceName' found" -ForegroundColor Yellow
}

# -- Desktop shortcut ---------------------------------------------------------
$shortcut = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Clinix.url'
if (Test-Path $shortcut) {
  Remove-Item $shortcut -Force
  Write-Host 'Removed the desktop shortcut' -ForegroundColor Green
}

Write-Host "`nDone. Start MySQL from the XAMPP Control Panel again if you need it." -ForegroundColor White
