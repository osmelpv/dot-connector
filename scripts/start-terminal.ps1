param([string]$WezTerm, [string]$StateDir, [string]$ProjectDirectory, [string]$Distribution = 'Ubuntu')
$ErrorActionPreference = 'Stop'
if (-not $WezTerm -or -not (Test-Path -LiteralPath $WezTerm)) { throw 'Provide an existing portable wezterm.exe path.' }
if (-not $StateDir) { throw 'StateDir required.' }
if (-not $ProjectDirectory -or $ProjectDirectory -notmatch '^/[a-zA-Z0-9_./-]+$') { throw 'An explicit WSL project directory without spaces is required.' }
if ($Distribution -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Unsupported distribution name.' }
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
if (Test-Path -LiteralPath (Join-Path $StateDir 'session.json')) { throw 'State already owns a session. Use a fresh state directory; do not attach arbitrary panes.' }
if (Test-Path -LiteralPath (Join-Path $StateDir 'launch-attempt.json')) { throw 'A launch was already attempted here. Inspect that exact process before retrying; do not open duplicate windows.' }
$session = [guid]::NewGuid().ToString()
$class = 'dot-connector-' + $session
$luaDir = $StateDir.Replace('\','/')
if ($luaDir.Contains("'") -or $luaDir.Contains("`n")) { throw 'Unsupported state path' }
$lua = @"
local wezterm = require 'wezterm'
local pause = '$luaDir/PAUSED'
wezterm.on('dot-pause', function(window, pane)
  local f = assert(io.open(pause, 'w')); f:write('human pause'); f:close()
  window:set_right_status('PAUSED | Ctrl+Shift+F11 to resume')
end)
wezterm.on('dot-resume', function(window, pane)
  os.remove(pause)
  window:set_right_status('Agent enabled | Ctrl+Shift+F12 to pause')
end)
return {
  check_for_updates = false,
  front_end = 'Software',
  initial_cols = 100, initial_rows = 28,
  window_close_confirmation = 'AlwaysPrompt',
  keys = {
    {key='F12', mods='CTRL|SHIFT', action=wezterm.action.EmitEvent('dot-pause')},
    {key='F11', mods='CTRL|SHIFT', action=wezterm.action.EmitEvent('dot-resume')},
  },
}
"@
$config = Join-Path $StateDir 'wezterm.lua'
[IO.File]::WriteAllText($config,$lua)
# A visible interactive terminal is explicitly requested; no hidden GUI launch.
$arguments = @('--config-file', ('"' + $config + '"'), 'start', '--always-new-process', '--no-auto-connect', '--class', $class, '--', 'wsl.exe', '-d', $Distribution, '--cd', $ProjectDirectory, '--', 'bash', '--noprofile', '--norc', '-i')
[IO.File]::WriteAllText((Join-Path $StateDir 'launch-attempt.json'),(@{className=$class;status='attempted'} | ConvertTo-Json))
$gui = Start-Process -FilePath $WezTerm -ArgumentList $arguments -PassThru
[IO.File]::WriteAllText((Join-Path $StateDir 'launch-attempt.json'),(@{className=$class;status='spawned';launcherPid=$gui.Id} | ConvertTo-Json))
$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
  Start-Sleep -Milliseconds 250
  $raw = & $WezTerm cli --no-auto-start --class $class list --format json 2>$null
  if ($LASTEXITCODE -eq 0) { $panes = @($raw | ConvertFrom-Json); if ($panes.Count -eq 1) { break } }
} while ([DateTime]::UtcNow -lt $deadline)
if ($panes.Count -ne 1) { throw 'No unique dedicated pane discovered; do not retry launch blindly.' }
$state = @{session=$session;className=$class;paneId=$panes[0].pane_id;windowId=$panes[0].window_id;guiLauncherPid=$gui.Id}
[IO.File]::WriteAllText((Join-Path $StateDir 'session.json'),($state | ConvertTo-Json))
& $WezTerm cli --no-auto-start --class $class set-window-title --window-id $state.windowId 'dot-connector | Ctrl+Shift+F12 pause | Ctrl+Shift+F11 resume'
$state | ConvertTo-Json
