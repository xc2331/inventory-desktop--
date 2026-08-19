$ErrorActionPreference = 'Continue'
$bp = "C:\Users\4070\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a69bff1700b850e63b3d704\inventory-desktop"
$lp = "$bp\build-v2.log"
Set-Location $bp

function L([string]$m) {
  $line = "[$(Get-Date -Format HH:mm:ss)] $m"
  Add-Content -Path $lp -Value $line -Encoding UTF8
}

[System.IO.File]::WriteAllText($lp, "STARTED`t$(Get-Date)`r`n")
L "STARTED"

$versions = @('1.3.2', '1.3.3', '1.3.4')
foreach ($v in $versions) {
  L "=== v$v ==="
  node -e "(p=require('./package.json'),p.version='$v',require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n'))"
  L "bumped"

  $ok = $false
  for ($i = 1; $i -le 3 -and -not $ok; $i++) {
    L "attempt $i/3"
    Remove-Item -Recurse -Force "$bp\node_modules\.cache\electron-builder" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$bp\release-v19" -ErrorAction SilentlyContinue

    $r = & npm run build:win 2>&1
    $ec = $LASTEXITCODE
    L "exit=$ec"

    if ($ec -eq 0) {
      $ok = $true
      L "BUILD OK"
    } else {
      if ($i -lt 3) { Start-Sleep -Seconds 20 }
    }
  }

  if (-not $ok) { L "SKIP v$v" ; continue }

  git add package.json release-v19/ dist/ 2>$null
  $gc = git commit -m "release: v$v" 2>&1
  $gt = git tag "v$v" 2>&1
  $gp = git push origin main --tags 2>&1
  L "git pushed"

  $pub = node scripts/publish-github.js 2>&1
  L "published"
}

L "ALL DONE"