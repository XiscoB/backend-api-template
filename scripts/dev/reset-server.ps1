# -------------------------------------------------------------------
# Reset Server Script
# -------------------------------------------------------------------
# Stops running services, syncs configuration, rebuilds, and restarts.
#
# Usage:
#   .\scripts\reset-server.ps1           # Reset Docker environment
#   .\scripts\reset-server.ps1 -Local    # Reset local dev environment
#   .\scripts\reset-server.ps1 -Full     # Full reset (wipes DB volumes)
#
#   npm run reset                         # Docker reset
#   npm run reset:local                   # Local reset
#   npm run reset:full                    # Full reset with DB wipe
# -------------------------------------------------------------------

param(
    [switch]$Local,
    [switch]$Full,
    [switch]$Help
)

if ($env:NODE_ENV -eq 'production') {
    if (-not $env:ALLOW_DEV_DESTRUCTIVE) {
        Write-Host "❌ Refusing to run in production environment." -ForegroundColor Red
        Write-Host "   Set ALLOW_DEV_DESTRUCTIVE=1 to override." -ForegroundColor Yellow
        exit 1
    }
}

$ErrorActionPreference = "Continue"

if ($Help) {
    Write-Host ""
    Write-Host "Reset Server Script" -ForegroundColor Cyan
    Write-Host "-------------------------------------------------------------------"
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\reset-server.ps1           # Reset Docker environment"
    Write-Host "  .\scripts\reset-server.ps1 -Local    # Reset local dev environment"
    Write-Host "  .\scripts\reset-server.ps1 -Full     # Full reset (wipes DB volumes)"
    Write-Host ""
    Write-Host "npm scripts:" -ForegroundColor Yellow
    Write-Host "  npm run reset                        # Docker reset"
    Write-Host "  npm run reset:local                  # Local reset"
    Write-Host "  npm run reset:full                   # Full reset with DB wipe"
    Write-Host ""
    exit 0
}

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $rootDir

Write-Host ""
Write-Host "[RESET] Resetting server..." -ForegroundColor Cyan
Write-Host "-------------------------------------------------------------------"

if ($Local) {
    # -------------------------------------------------------------------
    # Local Development Reset
    # -------------------------------------------------------------------
    Write-Host "Mode: Local Development" -ForegroundColor Yellow
    Write-Host ""

    # Step 1: Kill any running node processes on port 3000
    Write-Host "1. Stopping running processes..." -ForegroundColor White
    $portProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | 
                   Select-Object -ExpandProperty OwningProcess -Unique
    if ($portProcess) {
        foreach ($p in $portProcess) {
            try {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                Write-Host "   Stopped process $p" -ForegroundColor Gray
            }
            catch {
                Write-Host "   Process already stopped" -ForegroundColor Gray
            }
        }
    }
    else {
        Write-Host "   No processes running on port 3000" -ForegroundColor Gray
    }

    # Step 2: Clean build artifacts
    Write-Host "2. Cleaning build artifacts..." -ForegroundColor White
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force "dist"
        Write-Host "   Removed dist/" -ForegroundColor Gray
    }

    # Step 3: Regenerate Prisma client
    Write-Host "3. Regenerating Prisma client..." -ForegroundColor White
    npm run prisma:generate 2>&1 | Out-Null
    Write-Host "   Prisma client generated" -ForegroundColor Gray

    # Step 4: Build
    Write-Host "4. Building application..." -ForegroundColor White
    npm run build 2>&1 | Out-Null
    Write-Host "   Build complete" -ForegroundColor Gray

    Write-Host ""
    Write-Host "[OK] Local reset complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Start the server with:" -ForegroundColor Yellow
    Write-Host "  npm run start:dev" -ForegroundColor White
    Write-Host ""
}
else {
    # -------------------------------------------------------------------
    # Docker Reset
    # -------------------------------------------------------------------
    if ($Full) {
        Write-Host "Mode: Docker (Full Reset - DB will be wiped)" -ForegroundColor Red
    }
    else {
        Write-Host "Mode: Docker" -ForegroundColor Yellow
    }
    Write-Host ""

    # Step 1: Stop running containers
    Write-Host "1. Stopping containers..." -ForegroundColor White
    docker-compose down 2>&1 | Out-Null
    Write-Host "   Containers stopped" -ForegroundColor Gray

    # Step 2: Remove volumes if full reset
    if ($Full) {
        Write-Host "2. Removing volumes (DB data will be lost)..." -ForegroundColor White
        docker-compose down -v 2>&1 | Out-Null
        Write-Host "   Volumes removed" -ForegroundColor Gray
    }
    else {
        Write-Host "2. Keeping volumes (DB data preserved)" -ForegroundColor White
    }

    # Step 3: Sync environment
    Write-Host "3. Syncing environment configuration..." -ForegroundColor White
    & "$rootDir\scripts\ci\sync-docker-env.ps1" 2>&1 | Out-Null
    Write-Host "   Environment synced" -ForegroundColor Gray

    # Step 4: Rebuild and start
    Write-Host "4. Rebuilding and starting containers..." -ForegroundColor White
    Write-Host ""
    
    docker-compose up --build -d
    
    Write-Host ""
    Write-Host "[OK] Docker reset complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "View logs with:" -ForegroundColor Yellow
    Write-Host "  docker-compose logs -f backend" -ForegroundColor White
    Write-Host ""
    Write-Host "Stop with:" -ForegroundColor Yellow
    Write-Host "  npm run docker:down" -ForegroundColor White
    Write-Host ""
}
