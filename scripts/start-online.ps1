# 一键启动联机服务器，并通过 Cloudflare 免费隧道生成外网 https 链接。
# 手机用流量、外地朋友都能直接打开；关闭此窗口即停止。
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24（https://nodejs.org/）。' }
if (-not (Test-Path -LiteralPath 'node_modules/socket.io') -or -not (Test-Path -LiteralPath 'node_modules/react') -or -not (Test-Path -LiteralPath 'node_modules/qrcode')) {
    Write-Host '首次运行：正在安装依赖……'
    & npm install --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}
Write-Host '正在构建网页……'
& npm run -s build
if ($LASTEXITCODE -ne 0) { throw '网页构建失败。' }

# Cloudflare 官方隧道工具：免注册、免费。首次使用时从 Cloudflare 官方 GitHub 下载到 tools\
$cf = Join-Path (Get-Location) 'tools\cloudflared.exe'
if (-not (Test-Path -LiteralPath $cf)) {
    New-Item -ItemType Directory -Force -Path 'tools' | Out-Null
    Write-Host '首次使用：正在从 Cloudflare 官方 GitHub 下载隧道工具（约 60MB）……'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -OutFile $cf `
        -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
}

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$log = Join-Path $env:TEMP ("dbd-tunnel-" + $PID + ".log")
Write-Host '正在生成外网链接（约 10 秒）……'
$tunnel = Start-Process -FilePath $cf -NoNewWindow -PassThru `
    -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$port") `
    -RedirectStandardError $log -RedirectStandardOutput ($log + '.out')
try {
    $url = $null
    for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path -LiteralPath $log) {
            $m = Select-String -LiteralPath $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($m) { $url = $m.Matches[0].Value }
        }
    }
    if (-not $url) { throw '没有拿到外网链接。请检查电脑是否能上网，或改用“启动局域网联机.cmd”。' }
    $env:DBD_PUBLIC_URL = $url
    Write-Host ''
    Write-Host "外网链接：$url" -ForegroundColor Yellow
    Write-Host '链接刚生成时可能要等几秒才能打开；每次启动链接都会变化。'
    Write-Host '任何拿到链接的人都能进入房间页面，只发给你信任的朋友。'
    Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 6; Start-Process "$u/?online=1" } -ArgumentList $url | Out-Null
    & npx tsx apps/server/src/main.ts
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
}
