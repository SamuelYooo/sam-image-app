param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ForwardArgs
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$tauriCmd = Join-Path $projectRoot "node_modules\.bin\tauri.cmd"
$tauriLocalToolsRoot = Join-Path $projectRoot "src-tauri\target\.tauri"
$tauriLocalWixDirs = @(
  (Join-Path $tauriLocalToolsRoot "WixTools314"),
  (Join-Path $tauriLocalToolsRoot "WixTools")
)

if (-not (Test-Path $tauriCmd)) {
  Write-Error "Tauri CLI not found: $tauriCmd"
  exit 1
}

$wixCandidates = @(
  $env:SAMIMAGE_WIX_DIR,
  "D:\DevFiles\wix314-binaries"
) | Where-Object { $_ -and (Test-Path $_) }

$resolvedWixDir = $wixCandidates | Select-Object -First 1

if ($resolvedWixDir) {
  $candle = Join-Path $resolvedWixDir "candle.exe"
  $light = Join-Path $resolvedWixDir "light.exe"

  if ((Test-Path $candle) -and (Test-Path $light)) {
    New-Item -ItemType Directory -Force -Path $tauriLocalToolsRoot | Out-Null

    foreach ($wixCacheDir in $tauriLocalWixDirs) {
      New-Item -ItemType Directory -Force -Path $wixCacheDir | Out-Null
      try {
        Copy-Item -Path (Join-Path $resolvedWixDir "*") -Destination $wixCacheDir -Recurse -Force -ErrorAction Stop
        Write-Host "Synced WiX cache to: $wixCacheDir"
      } catch {
        Write-Warning "Failed to fully sync WiX cache to $wixCacheDir. Continuing with existing cache."
      }
    }

    $env:PATH = "$resolvedWixDir;$env:PATH"
    $env:WIX = $resolvedWixDir
    Write-Host "Using local WiX: $resolvedWixDir"
  } else {
    Write-Warning "WiX directory found, but candle.exe or light.exe is missing: $resolvedWixDir"
  }
} else {
  Write-Host "Local WiX not found. Falling back to default system configuration."
}

& $tauriCmd @ForwardArgs
$exitCode = $LASTEXITCODE
if ($null -ne $exitCode) {
  exit $exitCode
}
