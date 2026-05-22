param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json

$productName = $tauriConfig.productName
$version = $tauriConfig.version
$releaseDir = Join-Path $projectRoot "src-tauri\target\release"
$sourceExePath = Join-Path $releaseDir "${productName}.exe"
$archiveExePath = Join-Path $releaseDir "${productName}-single-${version}.exe"

Write-Host "Running standalone EXE build pipeline..."
cmd.exe /c "npm.cmd run tauri -- build --no-bundle"
$buildExitCode = $LASTEXITCODE
if ($buildExitCode -ne 0) {
  exit $buildExitCode
}

if (-not (Test-Path $sourceExePath)) {
  Write-Error "Standalone EXE build finished without generating $sourceExePath"
  exit 1
}

if (Test-Path $archiveExePath) {
  Remove-Item -LiteralPath $archiveExePath -Force
}

Move-Item -LiteralPath $sourceExePath -Destination $archiveExePath
Write-Host "Standalone EXE created successfully: $archiveExePath"
