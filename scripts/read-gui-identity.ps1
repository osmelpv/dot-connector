param([int]$GuiPid = [int]$env:DOT_GUI_PID)
$ErrorActionPreference = 'Stop'
if ($GuiPid -le 0) { throw 'A positive GUI PID is required.' }
$process = Get-Process -Id $GuiPid -ErrorAction Stop
$info = Get-CimInstance Win32_Process -Filter "ProcessId=$GuiPid"
if (-not $info -or -not $info.CommandLine) { throw 'GUI command line unavailable.' }
$match = [regex]::Match($info.CommandLine, '(?:^|\s)--class\s+"?(dot-connector-[a-f0-9-]{36})"?(?:\s|$)')
if (-not $match.Success) { throw 'Not a dedicated connector GUI class.' }
$socket = Join-Path $env:USERPROFILE ".local\share\wezterm\gui-sock-$GuiPid"
if (-not (Test-Path -LiteralPath $socket)) { throw 'Owned GUI socket not present.' }
@{
  guiPid = $GuiPid
  guiStartTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
  guiExecutable = $info.ExecutablePath
  className = $match.Groups[1].Value
  socketPath = $socket
} | ConvertTo-Json -Compress
