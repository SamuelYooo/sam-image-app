$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$targets = @(
  (Join-Path $projectRoot "dist"),
  (Join-Path $projectRoot "src-tauri\target"),
  (Join-Path $projectRoot ".vite")
)

foreach ($target in $targets) {
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed: $target"
  } else {
    Write-Host "Skipped: $target"
  }
}
