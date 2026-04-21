> Documentation Layer: Canonical Contract

# System Validation Guide

This document describes the authoritative system validation process. The `validate:all` command is the single source of truth for system health.

## Quick Start

```bash
# Run all validation checks
npm run validate:all

# Run with verbose output
npm run validate:all -- --verbose
```

## Exit Codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| `0`  | All critical checks passed (warnings may exist) |
| `1`  | One or more critical checks failed              |

This makes the script suitable for CI/CD pipelines:

```bash
npm run validate:all && echo "Deploy OK" || echo "Deploy BLOCKED"
```

---

## Check Categories

The validation system organizes checks into categories:

### 🔴 Critical Checks (Blocking)

These must pass for the system to function. Failures block deployment.

| Check               | Script                           | Description                                 |
| ------------------- | -------------------------------- | ------------------------------------------- |
| Database Connection | `test-db-connection.js`          | PostgreSQL connectivity and credentials     |
| Database Schema     | `validate-db.js`                 | Prisma models, migrations, indexes          |
| Bootstrap Contract  | `validate-bootstrap-contract.js` | API contract for `/api/v1/public/bootstrap` |

### 🟡 Non-Critical Checks (Warnings)

These indicate issues that require attention but don't block deployment.

| Check                   | Script                             | Description                                |
| ----------------------- | ---------------------------------- | ------------------------------------------ |
| GDPR Export Coverage    | `validate-gdpr-coverage.js`        | All user data tables registered for export |
| GDPR Dynamic Collector  | `test-dynamic-collector.js`        | Registry-driven data collection            |
| Notification Invariants | `verify-notification-invariant.js` | 1 log per event, delivery logs present     |

### ℹ️ Diagnostic Checks (Informational)

These provide system status information without asserting invariants.

| Check               | Script                   | Description                           |
| ------------------- | ------------------------ | ------------------------------------- |
| Notification Status | `check-notifications.js` | Table statistics, recent activity     |
| GDPR Export Status  | `check-gdpr-export.js`   | Latest export request and file status |

---

## What Gets Validated

### Infrastructure Checks

1. **Database Connection** (CRITICAL)
   - Tests connection to PostgreSQL
   - Verifies credentials and connectivity
   - Checks server version and configuration

2. **Database Schema Validation** (CRITICAL)
   - Validates Prisma schema matches database
   - Checks all models are accessible
   - Verifies migration status (no pending/rolled back)
   - Validates critical indexes exist

### Contract Checks

3. **Bootstrap DTO Contract** (CRITICAL)
   - Validates `/api/v1/public/bootstrap` response structure
   - Checks required top-level keys: `updatePolicy`, `metadata`, `features`, `i18n`
   - Validates nested structures and types
   - Ensures EN fallback exists in update messages

### GDPR Compliance Checks

4. **GDPR Export Coverage**
   - Checks all tables are registered in GDPR registry
   - Identifies missing or unregistered tables
   - Validates export field metadata

5. **GDPR Dynamic Collector**
   - Tests registry-driven data collection
   - Validates field types and formatting
   - Checks masking for sensitive data

### Notification System Checks

6. **Notification Invariants**
   - Verifies 1 notification_log per event (no duplicates)
   - Checks delivery_logs >= notification_logs
   - Validates no orphaned delivery logs

### Diagnostic Checks

7. **Notification System Status**
   - Shows table counts
   - Displays recent records
   - Reports potential issues

8. **GDPR Export Status**
   - Shows latest export request
   - Verifies file storage
   - Displays export metadata

---

## Running Individual Checks

### Database

```bash
# Quick connection test
npm run db:test-connection

# Full database schema validation
npm run db:validate

# Prisma schema validation + database validation
npm run db:verify
```

### GDPR System

```bash
# Check GDPR export coverage
node scripts/validate-gdpr-coverage.js

# Test the dynamic collector
node scripts/test-dynamic-collector.js

# Check latest GDPR export status
node scripts/check-gdpr-export.js
```

### Notifications

```bash
# Check notification tables and recent records
node scripts/check-notifications.js

# Verify notification system invariants
node scripts/verify-notification-invariant.js
```

### Jobs

```bash
# Run all background jobs manually
npm run job:all

# Individual jobs
npm run job:notifications
npm run job:retries
npm run job:cleanup
npm run job:gdpr
```

---

## Adding New Validations

### Step 1: Create the Script

Create a new script in `scripts/` with these requirements:

```javascript
#!/usr/bin/env node
/**
 * Validation Script: [Name]
 *
 * [Description of what this validates]
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 *
 * @see docs/VALIDATION.md
 */

// ... validation logic ...

if (hasFailures) {
  console.log('❌ Validation failed');
  process.exit(1);
} else {
  console.log('✅ Validation passed');
  process.exit(0);
}
```

**Requirements for automation:**

- Clear console output (use ✅/❌/⚠️ markers)
- Proper exit codes (0 = pass, 1 = fail)
- No interactive prompts
- No reliance on external state that may not exist

### Step 2: Add to validate-all.js

Edit `scripts/validate-all.js` and add your check to the `CHECKS` array:

```javascript
const CHECKS = [
  // ... existing checks ...
  {
    name: 'Your New Check',
    command: 'node scripts/your-new-check.js',
    critical: false, // or true for blocking checks
    category: 'gdpr', // infrastructure, contract, gdpr, notification, diagnostic
    description: 'What this check validates',
  },
];
```

### Step 3: Update This Documentation

Add your check to the appropriate table in this document.

---

## Scripts NOT Included in Validation

The following scripts exist but are **intentionally excluded** from `validate:all`:

### Scenario / Integration Tests

These modify state significantly and should run in isolation:

| Script                           | Reason                                   |
| -------------------------------- | ---------------------------------------- |
| `test-notification-scenarios.js` | Creates GDPR requests, modifies channels |
| `test-suspension-backup.js`      | Full suspension/recovery cycle           |
| `test-gdpr.js`                   | E2E GDPR export test                     |
| `test-gdpr-export.js`            | Triggers job processing                  |
| `test-notification.js`           | Sends test notifications                 |
| `test-profile-update.js`         | Requires running API server              |

### Operational Scripts

These are for maintenance and operations, not validation:

| Script                        | Purpose                       |
| ----------------------------- | ----------------------------- |
| `cleanup-cron.js`             | External cron trigger example |
| `process-gdpr-requests.js`    | Manual job runner             |
| `reset-gdpr-request.js`       | Test data reset               |
| `reset-server.ps1`            | Server reset                  |
| `sync-docker-env.*`           | Docker utilities              |
| `check-and-create-request.js` | Creates test data             |
| `test-spanish-export.js`      | Creates test data             |

### Diagnostic Scripts (Exploratory)

These are for manual investigation:

| Script                     | Purpose             |
| -------------------------- | ------------------- |
| `check-requests-simple.js` | Basic DB inspection |

---

## Troubleshooting

### Validation Fails in CI but Passes Locally

1. Check environment variables are set correctly
2. Verify Docker containers are running: `docker ps`
3. Ensure database is migrated: `npm run db:migrate`

### Critical Check Fails

1. Run the individual script for detailed output:

   ```bash
   node scripts/<script-name>.js
   ```

2. Check logs for specific error messages

3. Run with verbose flag:
   ```bash
   npm run validate:all -- --verbose
   ```

### Non-Critical Warning

Warnings don't block deployment but should be investigated:

1. Review the warning output
2. Check if it's a configuration issue
3. Create a ticket if action is needed

---

## Design Principles

1. **VALIDATION scripts are read-only** — They check state, they don't modify it
2. **Critical checks must be reliable** — No flaky tests in the critical path
3. **Explicit failure over silent skipping** — If a check can't run, it should fail
4. **Proper exit codes** — 0 = pass, 1 = fail, always
5. **Clear output** — Use markers (✅/❌/⚠️) for machine and human readability

