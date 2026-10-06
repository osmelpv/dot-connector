param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathRooted($Destination)) { throw 'Destination must be an absolute new directory.' }
$outputRoot = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $outputRoot) { throw 'Destination already exists; never overwrite target, grants or locks.' }
$sourceRoot = Split-Path -Parent $PSScriptRoot
if ($outputRoot.StartsWith($sourceRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Destination must be outside the source checkout.' }
$frameworkRoot = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $frameworkRoot 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Existing .NET Framework x64 compiler required; no installer is run.' }
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$modules = @('native-control.mjs','native-reader.mjs','native-supervisor.mjs','native-mcp-server.mjs','native-integration-server.mjs','manual-native-mcp.mjs')
foreach ($module in $modules) { Copy-Item -LiteralPath (Join-Path $sourceRoot "src/$module") -Destination $outputRoot }
foreach ($manifest in @('package.json','package-lock.json')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $manifest) -Destination $outputRoot }
& $compiler /nologo /target:library /platform:x64 /optimize+ /warnaserror+ "/out:$outputRoot\DotConnector.Native.dll" "/reference:$frameworkRoot\WPF\UIAutomationClient.dll" "/reference:$frameworkRoot\WPF\UIAutomationTypes.dll" "/reference:$frameworkRoot\WPF\WindowsBase.dll" (Join-Path $sourceRoot 'src/native-uia-provider.cs')
if ($LASTEXITCODE -ne 0) { throw 'Provider compilation failed; leave artifact for inspection.' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ /define:MANUAL_NATIVE_INTEGRATION "/out:$outputRoot\DotConnector.NativeControl.exe" "/reference:$outputRoot\DotConnector.Native.dll" "/reference:$frameworkRoot\System.Web.Extensions.dll" (Join-Path $sourceRoot 'src/native-control-host.cs')
if ($LASTEXITCODE -ne 0) { throw 'Host compilation failed; leave artifact for inspection.' }
Push-Location -LiteralPath $outputRoot
try {
  & npm.cmd ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Isolated dependency installation failed.' }
  & (Join-Path $outputRoot 'DotConnector.NativeControl.exe') --self-test
  if ($LASTEXITCODE -ne 0) { throw 'No-GUI host self-test failed.' }
} finally { Pop-Location }
$hashes = @{}
foreach ($name in ($modules + @('package.json','package-lock.json','DotConnector.Native.dll','DotConnector.NativeControl.exe'))) {
  $hashes[$name] = (Get-FileHash -LiteralPath (Join-Path $outputRoot $name) -Algorithm SHA256).Hash
}
$hashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot 'artifact-sha256.json') -Encoding UTF8
Write-Output 'Prepared only. No UIA/SendInput, target selection, grant, claim or consumer launch occurred.'
