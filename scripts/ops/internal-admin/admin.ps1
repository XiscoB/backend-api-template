#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Internal Admin Console CLI Helper (PowerShell wrapper)

.DESCRIPTION
    Convenient wrapper for the admin-cli.js script on Windows.
    Forwards all arguments to the Node.js CLI.

.EXAMPLE
    .\admin.ps1 tables
    .\admin.ps1 query profiles --limit 10
    .\admin.ps1 get profiles abc-123
    .\admin.ps1 update notifications abc-123 '{"isRead": true}'
    .\admin.ps1 health

.NOTES
    Requires:
    - Node.js installed
    - ADMIN_JWT environment variable set
    - Backend running with ADMIN_CONSOLE_ENABLED=true
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliScript = Join-Path $ScriptDir "admin-cli.js"

if (-not (Test-Path $CliScript)) {
    Write-Error "admin-cli.js not found at: $CliScript"
    exit 1
}

# Check for ADMIN_JWT
if (-not $env:ADMIN_JWT) {
    Write-Host @"
❌ Error: ADMIN_JWT environment variable is required

Set it with a valid admin JWT token:
  `$env:ADMIN_JWT = "your-jwt-token"

"@ -ForegroundColor Red
    exit 1
}

# Forward all arguments to the Node.js script
node $CliScript @args
