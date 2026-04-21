# Golden Path Lifecycle System Test

> **Manual release-confidence test for validating complete user lifecycle**

---

## What This Is

This is a comprehensive end-to-end system test that validates the entire user lifecycle against a **REAL running backend** using:

- Real HTTP calls
- Real JWTs
- Real database operations

**This is NOT a unit test.**  
**This is NOT a CI test.**  
**This is a release-confidence / system validation test.**

---

## When to Run

| Scenario                          | Run This Test? |
| --------------------------------- | -------------- |
| Before major releases             | ✅ Yes         |
| After large refactors             | ✅ Yes         |
| After GDPR/notification changes   | ✅ Yes         |
| After infrastructure changes      | ✅ Yes         |
| When validating a new environment | ✅ Yes         |
| During normal development         | ❌ No          |
| In CI pipeline                    | ❌ No          |

---

## Prerequisites

### 1. Running Backend

The backend must be running and accessible:

```bash
# Option 1: Docker
npm run docker:up

# Option 2: Local development
npm run start:dev
```

### 2. Valid JWT Tokens

You need two tokens:

| Token         | Requirements                                                            |
| ------------- | ----------------------------------------------------------------------- |
| `USER_TOKEN`  | Valid JWT with `USER` role                                              |
| `ADMIN_TOKEN` | Valid JWT with `internal_admin: true` and `internal_admin_level: write` |

**How to obtain tokens:**

- From your authentication provider (Supabase, Keycloak, etc.)
- From the Test UI after logging in
- Using your auth provider's admin console

### 3. GDPR Job Processing

The test requires GDPR background jobs to process requests. Options:

1. **Manual trigger** (recommended for testing):

   ```bash
   npm run job:gdpr
   ```

2. **Automatic cron**: If cron is configured and running, jobs will execute automatically

---

## How to Run

### Quick Start (Recommended)

The easiest way to run the test is using the helper script:

```powershell
# Make sure your test/system/.env.local file exists with the required variables
.\test\system\run-lifecycle-test.ps1
```

This script:

- Loads variables from `test/system/.env.local`
- Validates required variables are present
- Runs the test with proper environment setup

---

### Manual Setup

### PowerShell

```powershell
# Set environment variables
$env:RUN_SYSTEM_TESTS = "true"
$env:SYSTEM_TEST_BASE_URL = "http://localhost:3000"
$env:USER_TOKEN = "eyJhbGciOiJSUzI1NiIs..."
$env:ADMIN_TOKEN = "eyJhbGciOiJSUzI1NiIs..."

# Run the test
npm run test:e2e -- --testPathPattern=lifecycle
```

### Bash

```bash
# Set environment variables
export RUN_SYSTEM_TESTS=true
export SYSTEM_TEST_BASE_URL=http://localhost:3000
export USER_TOKEN="eyJhbGciOiJSUzI1NiIs..."
export ADMIN_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Run the test
npm run test:e2e -- --testPathPattern=lifecycle
```

### Using a Config File

Create `test/system/.env.local` (git-ignored):

```env
RUN_SYSTEM_TESTS=true
SYSTEM_TEST_BASE_URL=http://localhost:3000
USER_TOKEN=eyJhbGciOiJSUzI1NiIs...
ADMIN_TOKEN=eyJhbGciOiJSUzI1NiIs...
```

Then load and run:

**PowerShell:**

```powershell
# Load from .env.local file
Get-Content test/system/.env.local | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}

# Run the test
npm run test:e2e -- --testPathPattern=lifecycle
```

**Bash:**

```bash
# Load from .env.local file
export $(cat test/system/.env.local | xargs)

# Run the test
npm run test:e2e -- --testPathPattern=lifecycle
```

**Using dotenv-cli** (requires installation):

```bash
# Install dotenv-cli first
npm install -g dotenv-cli

# Then run
dotenv -e test/system/.env.local -- npm run test:e2e -- --testPathPattern=lifecycle
```

---

## Test Phases

The test runs sequentially through these phases:

| Phase | Description           | Destructive? |
| ----- | --------------------- | ------------ |
| 0     | Setup & Prerequisites | No           |
| 1     | Public Endpoints      | No           |
| 2     | Profile Lifecycle     | No           |
| 3     | Notification Channels | No           |
| 4     | GDPR Export           | No           |
| 5     | Suspension & Recovery | No           |
| 6     | Deletion              | ⚠️ **YES**   |

### ⚠️ Phase 6 Warning

**Phase 6 permanently deletes all user data for the test user.**

After running this test, the user associated with `USER_TOKEN` will have:

- No profile
- No notification channels
- No accessible data
- Anonymized records

---

## Why It's Gated

This test is gated behind `RUN_SYSTEM_TESTS=true` because:

1. **Requires infrastructure**: Needs a running backend, database, and valid tokens
2. **Destructive**: Permanently deletes user data
3. **Slow**: Takes several minutes with polling
4. **Manual tokens**: Requires real authentication tokens
5. **Not for CI**: Designed for manual release validation

---

## Troubleshooting

### Test hangs at "WAITING FOR GDPR EXPORT PROCESSING"

GDPR jobs need to be triggered. In another terminal:

```bash
npm run job:gdpr
```

### 401 Unauthorized errors

Your tokens are invalid or expired. Obtain fresh tokens.

### 403 Forbidden on admin endpoints

Your `ADMIN_TOKEN` lacks admin privileges. Ensure it has:

```json
{
  "internal_admin": true,
  "internal_admin_level": "write"
}
```

### Connection refused

Backend is not running. Start it with:

```bash
npm run docker:up
# or
npm run start:dev
```

### Test fails at Phase 5 or 6

These phases depend on successful GDPR job processing. Ensure:

1. Jobs are running (`npm run job:gdpr`)
2. No pending requests blocking new ones
3. User is not already suspended/deleted

---

## Success Criteria

The test is successful when:

1. ✅ All phases complete without errors
2. ✅ Public endpoints return expected structures
3. ✅ Profile CRUD works correctly
4. ✅ Notification channels can be created/updated/deleted
5. ✅ GDPR export completes and download URL exists
6. ✅ Suspension blocks access, recovery restores it
7. ✅ Deletion removes all user data

If any step fails, the failure message indicates which lifecycle phase broke.

---

## Files

```
test/system/
├── README.md                 # This file
├── lifecycle.e2e-spec.ts     # The test file
├── run-lifecycle-test.ps1    # PowerShell helper script
└── .env.local                # Local config (git-ignored)
```
