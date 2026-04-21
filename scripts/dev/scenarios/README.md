# Scenario Testing

End-to-end scenario tests that verify documented behavior from TEST_UI_CONTRACT.md.

## Purpose

These tests verify **real user and admin workflows** against the documented API contract.
They are **destructive** tests that create and delete fake data - never run in production!

## Sealed Test Authentication Mode

The scenario tests use a **sealed test authentication mode** that enables fully automated
E2E testing without any manual JWT configuration or token copying.

### How It Works

1. **Shared Static Keys**: Both the scenario runner and backend use the same RSA key pair
   from `scripts/dev/scenarios/lib/test-keys.js`
2. **Scenario Testing Mode**: When `SCENARIO_TESTING=true`, the backend accepts JWTs
   signed with the test private key instead of production JWKS
3. **Full JWT Validation**: All JWT validation still applies - signature, issuer,
   audience, expiry, and roles are all verified

### Safety Guarantees

- ❌ **Production blocked**: `process.exit(1)` if `NODE_ENV=production` AND `SCENARIO_TESTING=true`
- ⚠️ **Visible warnings**: Console warnings at startup when scenario mode is active
- 🔒 **No bypass**: Guards and validation remain fully active

## Quick Start

```bash
# 1. Start backend in scenario testing mode (Terminal 1)
SCENARIO_TESTING=true npm run start:dev

# 2. Run scenarios (Terminal 2)
SCENARIO_TESTING=true npm run test:scenarios

# Windows PowerShell:
$env:SCENARIO_TESTING="true"; npm run start:dev
# In another terminal:
$env:SCENARIO_TESTING="true"; npm run test:scenarios
```

## When to Run

| Situation                         | Run this? |
| --------------------------------- | --------- |
| Before deploying to staging       | ✅ Yes    |
| After major API changes           | ✅ Yes    |
| When debugging integration issues | ✅ Yes    |
| In production environment         | ❌ NEVER  |
| In CI/CD with test JWT config     | ✅ Yes    |

## Differences from validate:all

| Aspect         | validate:all         | test:scenarios             |
| -------------- | -------------------- | -------------------------- |
| Purpose        | Verify system health | Verify documented behavior |
| Data           | Reads existing data  | Creates fake data          |
| Destructive    | No                   | Yes                        |
| Contract focus | Schema/structure     | API behavior               |
| Auth testing   | No                   | Yes (JWT flows)            |
| Admin testing  | No                   | Yes (privilege levels)     |

## Safety Checks

The test runner will **refuse to execute** if:

1. `SCENARIO_TESTING=true` is not set
2. `NODE_ENV=production` is detected
3. Database URL contains production indicators
4. API URL points to production

## Scenarios Tested

### Public Endpoints

- Bootstrap configuration
- Health checks (basic and detailed)

### User Workflows (Scenarios 1-4)

1. First login / profile creation
2. Notification channel management
3. List and read notifications
4. Mark all notifications read

### GDPR Workflows (Scenarios 5-6)

5. Request GDPR export
6. Suspend and recover account

### Error Handling (Scenarios 7-9)

7. No duplicate notifications
8. Authentication failures (401)
9. Validation errors (400)

### Admin Workflows (Scenarios 10-14)

10. Admin health check
11. Admin table query
12. Admin record update
13. GDPR admin monitoring
14. Cleanup job execution

## Test Data Strategy

- All test data is namespaced with `scenario_*` prefix
- External user IDs use format: `scenario-test-{timestamp}-{random}`
- Data is cleaned up after test completion (best effort)
- Tests are designed to be re-runnable

## Error Codes Tested

| Code                 | HTTP | Scenarios |
| -------------------- | ---- | --------- |
| `AUTH_UNAUTHORIZED`  | 401  | 8         |
| `AUTH_TOKEN_EXPIRED` | 401  | 8         |
| `AUTH_TOKEN_INVALID` | 401  | 8         |
| `AUTH_FORBIDDEN`     | 403  | 10-14     |
| `RESOURCE_NOT_FOUND` | 404  | 1, 3      |
| `VALIDATION_ERROR`   | 400  | 9         |
| `CONFLICT`           | 409  | 5         |

## Output

The runner produces clear console output:

```
═══════════════════════════════════════════════════════════════
  SCENARIO TESTING - TEST_UI_CONTRACT.md Verification
═══════════════════════════════════════════════════════════════

🔒 Safety Checks:
  ✓ SCENARIO_TESTING=true enabled
  ✓ Not running in production
  ✓ Database URL safe
  ✓ API URL safe

📋 Scenario 1: First Login / Profile Creation
  ├─ Step 1: GET /profiles/me (no profile) → 404 ✓
  ├─ Step 2: POST /profiles/me → 200 ✓
  └─ Step 3: GET /profiles/me → 200 ✓
  ✅ PASSED

...

═══════════════════════════════════════════════════════════════
  RESULTS: 14/14 scenarios passed
═══════════════════════════════════════════════════════════════
```

## Extending

To add a new scenario:

1. Create a new file in `scripts/dev/scenarios/scenarios/`
2. Export a function matching the `Scenario` interface
3. Register it in `scripts/dev/scenarios/registry.js`
4. Update TEST_UI_CONTRACT.md if documenting new behavior

## Known Discrepancies

The following differences between TEST_UI_CONTRACT.md and actual implementation
have been identified during scenario testing:

| Issue              | Contract Says      | Implementation Does                        |
| ------------------ | ------------------ | ------------------------------------------ |
| Bootstrap wrapping | Response unwrapped | Response wrapped in `data`/`meta` envelope |

**If you find a discrepancy**: Document it here and report it rather than working around it.
The contract should be updated to match implementation, or implementation should be fixed.
