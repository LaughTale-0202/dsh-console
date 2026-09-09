# dsh-console 引导：确保 Node 运行时满足版本要求，然后启动 Node 主程序。
# 只用 Windows 自带能力；在 Node 就绪前即可读取工具 config.json 的镜像预设。
$ErrorActionPreference = 'Stop'
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
    Write-Host "x Node $ver 不满足要求（需 22.19+ 或 24+），改用便携安装"
    $nodeCmd = $null
  }
} else {
  Write-Host '. 未检测到 Node.js，开始安装（约 1-3 分钟）…'
}

if (-not $nodeCmd) {
  $zip = $mirrorNodeZip
  if (-not $zip) { $zip = 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-win-x64.zip' }
  if (-not $mirrorNodeZip -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host '. 尝试 winget 安装 Node LTS（可能弹出 UAC 确认）…'
    try {
      winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements | Out-Null
      $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + $env:Path
      $nodeCmd = Get-NodeCmd
    } catch { Write-Host '. winget 失败，回退便携 zip 安装' }
  }
  if (-not $nodeCmd) {
    $tmpZip = Join-Path $env:TEMP 'dsh-console-node.zip'
    Write-Host ". 下载 $zip"
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
  if (-not (Test-NodeOk $ver)) { throw "安装后的 Node $ver 仍不满足版本要求" }
  Write-Host "+ Node $ver 就绪（便携目录无需管理员）"
}

# PATH 前置 node 目录：子进程（corepack 等）必须能解析
$env:Path = "$(Split-Path -Parent $nodeCmd);$env:Path"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Write-Host "+ Node $(& $nodeCmd -v)"

# 任何启动失败都保留窗口并提示，避免“闪一下就消失、看不到报错”。
try {
  & $nodeCmd (Join-Path $toolDir 'app\main.js')
} catch {
  Write-Host ""
  Write-Host "x 程序启动失败：" -ForegroundColor Red
  Write-Host "  $($_.Exception.Message)"
  Write-Host "  详情见 $toolDir\data\logs\fatal.log"
  Read-Host "  按 Enter 退出"
  exit 1
}
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "x 程序异常退出（码 $LASTEXITCODE）。" -ForegroundColor Red
  Write-Host "  详情见 $toolDir\data\logs\fatal.log"
  Read-Host "  按 Enter 退出"
}
exit $LASTEXITCODE
