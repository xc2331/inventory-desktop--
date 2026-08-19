$ErrorActionPreference = 'Stop'
$LogPath = "C:\Users\4070\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a69bff1700b850e63b3d704\inventory-desktop\batch-build.log"

function Log($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  Write-Host $line
}

Set-Location "C:\Users\4070\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a69bff1700b850e63b3d704\inventory-desktop"
New-Item -ItemType File -Path $LogPath -Force | Out-Null

$VERSIONS = @('1.3.2', '1.3.3', '1.3.4')
for ($vi = 0; $vi -lt $VERSIONS.Count; $vi++) {
  $ver = $VERSIONS[$vi]
  Log "=== Building v$ver ==="

  node -e "(p=require('./package.json'),p.version='$ver',require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n'))"
  Log "Version bumped to $ver"

  $maxRetries = 3
  $buildOk = $false
  for ($try = 1; $try -le $maxRetries; $try++) {
    Log "Build attempt $try/$maxRetries"
    if (Test-Path "node_modules\.cache\electron-builder") {
      Remove-Item -Recurse -Force "node_modules\.cache\electron-builder" -ErrorAction SilentlyContinue
    }

    $result = & npm run build:win 2>&1
    $ec = $LASTEXITCODE
    Log "Exit code=$ec"

    if ($ec -eq 0) {
      $buildOk = $true
      Log "Build SUCCESS for v$ver"
      break
    } else {
      if ($try -lt $maxRetries) { Start-Sleep -Seconds 10 }
    }
  }

  if (-not $buildOk) {
    Log "FAILED all retries for v$ver, skipping"
    continue
  }

  git add package.json release-v19/ dist/ 2>$null
  $gc = git commit -m "release: v$ver" 2>&1
  $gt = git tag "v$ver" 2>&1
  $gp = git push origin main --tags 2>&1
  Log "Git commit+tag+push done for v$ver"

  Log "Publishing v$ver to GitHub..."
  $pub = node scripts/publish-github.js 2>&1
  Log "GitHub publish done for v$ver"
}

Log "ALL DONE"