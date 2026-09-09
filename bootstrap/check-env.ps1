# dsh-console 寮曞锛氱‘淇?Node 杩愯鏃舵弧瓒崇増鏈姹傦紝鐒跺悗鍚姩 Node 涓荤▼搴忋€?# 鍙敤 Windows 鑷甫鑳藉姏锛涘湪 Node 灏辩华鍓嶅嵆鍙鍙栧伐鍏?config.json 鐨勯暅鍍忛璁俱€?$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $PSScriptRoot

$mirrorNodeZip = $null
if (Test-Path -LiteralPath (Join-Path $toolDir 'config.json')) {
  try {
    $cfg = Get-Content -LiteralPath (Join-Path $toolDir 'config.json') -Raw | ConvertFrom-Json
    $mirrorNodeZip = $cfg.presets.intranet.mirrors.nodeDistUrl
  } catch { $mirrorNodeZip = $null }
}

function Test-NodeOk([string]$v) {
  if ($v -notmatch '^v?(\d+)\.(\d+)\.(\d+)') { return $false }
  $maj = [int]$Matches[1]; $min = [int]$Matches[2]
  return ($maj -eq 22 -and $min -ge 19) -or ($maj -ge 24)
}

function Get-NodeCmd {
  try { return (Get-Command node -ErrorAction Stop).Source } catch { return $null }
}
$runtimeDir = Join-Path $env:LOCALAPPDATA 'dsh-console\runtime'
$portableNode = Join-Path $runtimeDir 'node\node.exe'

$nodeCmd = Get-NodeCmd
if (-not $nodeCmd -and (Test-Path -LiteralPath $portableNode)) { $nodeCmd = $portableNode }

if ($nodeCmd) {
  $ver = & $nodeCmd -v 2>$null
  if (-not (Test-NodeOk $ver)) {
    Write-Host "x Node $ver 涓嶆弧瓒宠姹傦紙闇€ 22.19+ 鎴?24+锛夛紝鏀圭敤渚挎惡瀹夎"
    $nodeCmd = $null
  }
} else {
  Write-Host '. 鏈娴嬪埌 Node.js锛屽紑濮嬪畨瑁咃紙绾?1-3 鍒嗛挓锛夆€?
}

if (-not $nodeCmd) {
  $zip = $mirrorNodeZip
  if (-not $zip) { $zip = 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-win-x64.zip' }
  if (-not $mirrorNodeZip -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host '. 灏濊瘯 winget 瀹夎 Node LTS锛堝彲鑳藉脊鍑?UAC 纭锛夆€?
    try {
      winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements | Out-Null
      $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + $env:Path
      $nodeCmd = Get-NodeCmd
    } catch { Write-Host '. winget 澶辫触锛屽洖閫€渚挎惡 zip 瀹夎' }
  }
  if (-not $nodeCmd) {
    $tmpZip = Join-Path $env:TEMP 'dsh-console-node.zip'
    Write-Host ". 涓嬭浇 $zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zip -OutFile $tmpZip -UseBasicParsing
    $dest = Join-Path $runtimeDir 'node-pack'
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $dest -Force
    $inner = Get-ChildItem -LiteralPath $dest -Directory | Select-Object -First 1
    $final = Join-Path $runtimeDir 'node'
    if (Test-Path -LiteralPath $final) { Remove-Item -LiteralPath $final -Recurse -Force }
    Move-Item -LiteralPath $inner.FullName -Destination $final
    Remove-Item -LiteralPath $tmpZip -Force
    $nodeCmd = Join-Path $final 'node.exe'
  }
  $ver = & $nodeCmd -v
  if (-not (Test-NodeOk $ver)) { throw "瀹夎鍚庣殑 Node $ver 浠嶄笉婊¤冻鐗堟湰瑕佹眰" }
  Write-Host "+ Node $ver 灏辩华锛堜究鎼虹洰褰曟棤闇€绠＄悊鍛橈級"
}

# PATH 鍓嶇疆 node 鐩綍锛氬瓙杩涚▼锛坈orepack 绛夛級蹇呴』鑳借В鏋?$env:Path = "$(Split-Path -Parent $nodeCmd);$env:Path"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Write-Host "+ Node $(& $nodeCmd -v)"
& $nodeCmd (Join-Path $toolDir 'app\main.js')
exit $LASTEXITCODE
