param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
$productName = $tauriConfig.productName
$version = $tauriConfig.version
$msiFileName = "${productName}_${version}_x64_en-US.msi"

$buildCommand = "npm.cmd run tauri -- build --bundles msi"
$wixObjectDir = Join-Path $projectRoot "src-tauri\target\release\wix\x64"
$wixObjectPath = Join-Path $wixObjectDir "main.wixobj"
$localePath = Join-Path $wixObjectDir "locale.wxl"
$wixLightPath = Join-Path $projectRoot "src-tauri\target\.tauri\WixTools314\light.exe"
$msiOutputDir = Join-Path $projectRoot "src-tauri\target\release\bundle\msi"
$msiOutputPath = Join-Path $msiOutputDir $msiFileName

Write-Host "Running Tauri MSI build pipeline..."
cmd.exe /c $buildCommand
$tauriExitCode = $LASTEXITCODE

if ($tauriExitCode -eq 0) {
  exit 0
}

if (-not (Test-Path $wixObjectPath)) {
  Write-Error "MSI fallback unavailable because main.wixobj was not generated."
  exit $tauriExitCode
}

if (-not (Test-Path $wixLightPath)) {
  Write-Error "MSI fallback unavailable because light.exe was not found at $wixLightPath"
  exit $tauriExitCode
}

New-Item -ItemType Directory -Force -Path $msiOutputDir | Out-Null

Write-Warning "Tauri MSI bundling failed. Retrying with local WiX light.exe and -sval."
& $wixLightPath `
  -sval `
  -ext WixUIExtension `
  -ext WixUtilExtension `
  -cultures:en-us `
  -loc $localePath `
  -o $msiOutputPath `
  $wixObjectPath

$fallbackExitCode = $LASTEXITCODE
if ($fallbackExitCode -ne 0) {
  exit $fallbackExitCode
}

if (-not (Test-Path $msiOutputPath)) {
  Write-Error "MSI fallback finished without generating $msiOutputPath"
  exit 1
}

Write-Host "MSI created successfully: $msiOutputPath"
