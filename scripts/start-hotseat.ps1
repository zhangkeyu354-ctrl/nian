$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24。' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    & npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}
Write-Host '热座界面：http://127.0.0.1:5173/；按 Ctrl+C 停止。'
& npm run dev -- --open
if ($LASTEXITCODE -ne 0) { throw '界面启动失败；检查 5173 端口是否已被占用。' }
