$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
foreach ($taskName in @('typecheck', 'test', 'simulate', 'verify:replays')) {
    & npm run $taskName
    if ($LASTEXITCODE -ne 0) { throw "Phase 1 check failed: $taskName" }
}
