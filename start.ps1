# Starts the betting API (port 8000) and the game (port 5173) together.
# Ctrl+C stops both. Run it with start.bat, or:  powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Find a working Python 3 (skips the Microsoft Store stub, which exists but doesn't run).
$py = $null
foreach ($name in 'py', 'python', 'python3') {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    try {
        & $cmd.Source --version *> $null
        if ($LASTEXITCODE -eq 0) { $py = $cmd.Source; break }
    } catch { }
}
if (-not $py) { Write-Host 'Python 3.10+ is required but was not found.' -ForegroundColor Red; exit 1 }

# Install the API's dependencies only if they are missing.
& $py -c 'import fastapi, uvicorn' *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing backend requirements...'
    & $py -m pip install -r (Join-Path $root 'backend\requirements.txt')
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

function Test-PortBusy([int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $client.Close() }
}
foreach ($port in 8000, 5173) {
    if (Test-PortBusy $port) {
        Write-Host "Port $port is already in use. Stop whatever is using it and try again." -ForegroundColor Red
        exit 1
    }
}

$api = $null
$web = $null
try {
    $api = Start-Process $py -ArgumentList '-m', 'uvicorn', 'main:app', '--port', '8000' `
        -WorkingDirectory (Join-Path $root 'backend') -NoNewWindow -PassThru
    $web = Start-Process $py -ArgumentList '-m', 'http.server', '5173', '--bind', '127.0.0.1' `
        -WorkingDirectory (Join-Path $root 'fly-poker') -NoNewWindow -PassThru

    Start-Sleep -Seconds 2
    $url = 'http://127.0.0.1:5173/'
    Write-Host ''
    Write-Host "Fly Poker is running at $url   (API docs: http://127.0.0.1:8000/docs)" -ForegroundColor Green
    Write-Host 'Press Ctrl+C to stop.'
    Start-Process $url

    # Exit (and clean up) as soon as either server dies.
    while (-not $api.HasExited -and -not $web.HasExited) { Start-Sleep -Seconds 1 }
}
finally {
    Write-Host ''
    Write-Host 'Shutting down...'
    foreach ($p in $api, $web) {
        if ($p -and -not $p.HasExited) { & taskkill /PID $p.Id /T /F *> $null }
    }
}
