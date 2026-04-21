#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the Golden Path Lifecycle System Test with environment variables from .env.local

.DESCRIPTION
    This script loads environment variables from test/system/.env.local and runs the
    lifecycle system test. It provides a convenient way to run the test without manually
    setting environment variables.

.PARAMETER EnvFile
    Path to the .env file to load (default: test/system/.env.local)

.EXAMPLE
    .\test\system\run-lifecycle-test.ps1
    Runs the test using test/system/.env.local

.EXAMPLE
    .\test\system\run-lifecycle-test.ps1 -EnvFile test/system/.env.production
    Runs the test using a custom env file
#>

param(
    [string]$EnvFile = "test/system/.env.local"
)

# Check if env file exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Error: Environment file not found: $EnvFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please create $EnvFile with the following variables:" -ForegroundColor Yellow
    Write-Host "  RUN_SYSTEM_TESTS=true"
    Write-Host "  SYSTEM_TEST_BASE_URL=http://localhost:3000"
    Write-Host "  USER_TOKEN=your-user-jwt"
    Write-Host "  ADMIN_TOKEN=your-admin-jwt"
    Write-Host ""
    exit 1
}

Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Golden Path Lifecycle System Test" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Loading environment from: $EnvFile" -ForegroundColor Green

# Load environment variables from .env file
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # Remove quotes if present
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
            $value = $matches[1]
        }
        
        $envVars[$key] = $value
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        
        # Mask sensitive values in output
        if ($key -like "*TOKEN*") {
            $maskedValue = $value.Substring(0, [Math]::Min(20, $value.Length)) + "..."
            Write-Host "  ✓ $key = $maskedValue" -ForegroundColor Gray
        } else {
            Write-Host "  ✓ $key = $value" -ForegroundColor Gray
        }
    }
}

Write-Host ""

# Verify required variables
$requiredVars = @('RUN_SYSTEM_TESTS', 'USER_TOKEN', 'ADMIN_TOKEN')
$missingVars = @()

foreach ($var in $requiredVars) {
    if (-not $envVars.ContainsKey($var) -or [string]::IsNullOrWhiteSpace($envVars[$var])) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "❌ Error: Missing required environment variables:" -ForegroundColor Red
    foreach ($var in $missingVars) {
        Write-Host "  - $var" -ForegroundColor Red
    }
    Write-Host ""
    exit 1
}

if ($envVars['RUN_SYSTEM_TESTS'] -ne 'true') {
    Write-Host "⚠️  Warning: RUN_SYSTEM_TESTS is not set to 'true'" -ForegroundColor Yellow
    Write-Host "   Test will be skipped unless RUN_SYSTEM_TESTS=true" -ForegroundColor Yellow
    Write-Host ""
}

# Run the test
Write-Host "Running lifecycle test..." -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Run Jest directly with the specific test file to avoid pattern matching issues
npx jest --config ./test/jest-e2e.json --runInBand "test/system/lifecycle.e2e-spec.ts"

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Host "✅ Test completed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Test failed with exit code: $exitCode" -ForegroundColor Red
}
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan

exit $exitCode
