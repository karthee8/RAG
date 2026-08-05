# ============================================================
#  StrongRAG - Stop All Services
# ============================================================

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ROOT       = Split-Path -Parent $SCRIPT_DIR
$PID_FILE = Join-Path $ROOT ".rag_pids"

Write-Host ""
Write-Host "  Stopping StrongRAG..." -ForegroundColor Yellow

# Kill saved PIDs
if (Test-Path $PID_FILE) {
    $pids = Get-Content $PID_FILE | Where-Object { $_.Trim() -ne "" }
    foreach ($p in $pids) {
        try {
            $proc = Get-Process -Id $p -ErrorAction Stop
            Stop-Process -Id $p -Force -ErrorAction Stop
            Write-Host "  [OK] Stopped PID $p ($($proc.ProcessName))" -ForegroundColor Green
        } catch {
            Write-Host "  [--] PID $p already stopped" -ForegroundColor DarkGray
        }
    }
    Remove-Item $PID_FILE -Force
}

# Also kill any remaining processes on our ports
$portProcesses = @()
try {
    $portProcesses += Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -ExpandProperty OwningProcess
} catch { }
try {
    $portProcesses += Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } |
        Select-Object -ExpandProperty OwningProcess
} catch { }

foreach ($p in ($portProcesses | Sort-Object -Unique)) {
    try {
        $proc = Get-Process -Id $p -ErrorAction Stop
        Stop-Process -Id $p -Force -ErrorAction Stop
        Write-Host "  [OK] Stopped port listener PID $p ($($proc.ProcessName))" -ForegroundColor Green
    } catch { }
}

Write-Host ""
Write-Host "  [OK] StrongRAG stopped." -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to close"
