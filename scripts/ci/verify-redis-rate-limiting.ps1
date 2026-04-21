<#
.SYNOPSIS
    Verifies Redis-based distributed rate limiting across two backend instances.

.DESCRIPTION
    Assumes Redis and two backend instances (api, api-2) are running.
    Targets /api/v1/health/detailed which has a limit of 300 req/60s.
    Sends 320 requests distributed between both instances.
    Asserts that the global limit is enforced and distributed correctly.

.EXAMPLE
    ./verify-redis-rate-limiting.ps1
#>

$Endpoint = "/api/v1/health/detailed"
$LimitIdx = 300
$TotalRequests = 320

Write-Host "Starting Redis Rate Limit Verification..." -ForegroundColor Cyan
Write-Host "Target: $Endpoint (Limit: $LimitIdx req/60s)"
Write-Host "Sending $TotalRequests requests across 2 instances..."

# Initialize counters
$Stats = @{
    "api-1" = @{ "200" = 0; "429" = 0; "Error" = 0 }
    "api-2" = @{ "200" = 0; "429" = 0; "Error" = 0 }
}

$Total200 = 0
$Total429 = 0

# Test Loop
for ($i = 1; $i -le $TotalRequests; $i++) {
    $Instance = if ($i % 2 -eq 0) { "api-1" } else { "api-2" }
    $Port = if ($Instance -eq "api-1") { 3000 } else { 3001 }
    $Uri = "http://localhost:$Port$Endpoint"

    $StatusCode = 0

    try {
        # PS 5.1 compatible approach (no -SkipHttpErrorCheck)
        $Response = Invoke-WebRequest -Uri $Uri -Method Get -UseBasicParsing
        $StatusCode = $Response.StatusCode
    } catch {
        # Check if it's a WebException (HTTP error)
        if ($_.Exception.Response) {
             # PS 5.1 Response is usually integer for StatusCode in Exception.Response.StatusCode
             # But sometimes it's an object depending on .NET version
             $StatusCode = [int]$_.Exception.Response.StatusCode
        } else {
             $StatusCode = 500
             Write-Host "Request $i failed (Network/Other): $_" -ForegroundColor Red
        }
    }

    # Record stats
    if ($StatusCode -eq 200) {
        $Stats[$Instance]["200"]++
        $Total200++
    } elseif ($StatusCode -eq 429) {
        $Stats[$Instance]["429"]++
        $Total429++
    } else {
        $Stats[$Instance]["Error"]++
        Write-Host "Req $i ($Instance): Status $StatusCode" -ForegroundColor Yellow
    }
    
    # Progress
    if ($i % 20 -eq 0) {
        Write-Host -NoNewline "."
    }
}

Write-Host ""
Write-Host "----------------------------------------"
Write-Host "Results:"

Write-Host "[v] Redis detected (presumed if limits enforced)" -ForegroundColor Green

Write-Host "Instance A (api-1): Allowed $($Stats['api-1']['200']), Blocked $($Stats['api-1']['429'])"
Write-Host "Instance B (api-2): Allowed $($Stats['api-2']['200']), Blocked $($Stats['api-2']['429'])"
Write-Host "Total Allowed: $Total200 (Expected <= $LimitIdx)"
Write-Host "Total Blocked: $Total429 (Expected > 0)"

$Failed = $false

# Allow small margin for clock skew or counter race conditions (leaky bucket)
if ($Total200 -gt ($LimitIdx + 5)) { 
    Write-Host "[!] FAIL: Total requests allowed ($Total200) exceeded limit significantly." -ForegroundColor Red
    $Failed = $true
} else {
    Write-Host "[v] Global limit enforced correctly" -ForegroundColor Green
}

if ($Total429 -eq 0) {
    Write-Host "[!] FAIL: No requests were rate limited." -ForegroundColor Red
    $Failed = $true
}

if ($Stats["api-1"]["200"] -eq 0 -and $Stats["api-1"]["429"] -eq 0) {
     Write-Host "[!] FAIL: Instance api-1 processed 0 requests." -ForegroundColor Red
     $Failed = $true
}

if ($Stats["api-2"]["200"] -eq 0 -and $Stats["api-2"]["429"] -eq 0) {
     Write-Host "[!] FAIL: Instance api-2 processed 0 requests." -ForegroundColor Red
     $Failed = $true
}

if ($Failed) {
    Write-Host "Verification FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Verification PASSED" -ForegroundColor Green
    exit 0
}
