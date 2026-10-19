$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24（https://nodejs.org/）。' }
if (-not (Test-Path -LiteralPath 'node_modules/socket.io')) {
    Write-Host '首次运行：正在安装依赖……'
    & npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}
Write-Host '正在构建网页……'
& npm run -s build
if ($LASTEXITCODE -ne 0) { throw '网页构建失败。' }
$port = if ($env:PORT) { $env:PORT } else { 3000 }
Write-Host ''
Write-Host '提示：如果 Windows 弹出防火墙询问，请勾选“专用网络”并允许，否则手机连不上。'
Write-Host '手机与电脑必须连接同一个 Wi-Fi。'
Start-Process "http://localhost:$port/?online=1"
& npx tsx apps/server/src/main.ts
if ($LASTEXITCODE -ne 0) { throw "服务器启动失败；检查 $port 端口是否已被占用。" }
