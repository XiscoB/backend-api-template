# ADR-009: GDPR-Compliant Account Deletion Lifecycle

**Status**: Accepted  
**Date**: 2026-01-13  
**Context**: GDPR Right to Erasure implementation

---

## Context

Users have the right to request deletion of their personal data under GDPR Article 17 (Right to Erasure). The backend must implement a compliant deletion lifecycle that:

1. Blocks access immediately upon request
2. Provides a grace period for accidental deletion recovery (where policy allows)
3. Irreversibly anonymizes data after the grace period
4. Operates independently of any external authentication provider

### Constraints

- **Authentication is external**: Backend never issues or manages JWTs
- **Backend is authoritative**: Account state is owned by the backend, not the auth provider
- **Provider-agnostic**: No calls to auth provider APIs during deletion
- **Reversibility**: Grace period allows recovery; final deletion is irreversible
- **Auditability**: All deletion operations must be logged

---

## Decision

### 1. Two-Phase Deletion Model

Account deletion is implemented as a **two-phase process**:

| Phase                | State               | User Access | Recovery                    | Data State              |
| -------------------- | ------------------- | ----------- | --------------------------- | ----------------------- |
| **Logical Deletion** | `deletedAt` is set  | Blocked     | Possible (if policy allows) | Intact but inaccessible |
| **Final Deletion**   | `anonymized = true` | Blocked     | Impossible                  | Anonymized/deleted      |

### 2. Identity State Model

The `Identity` model tracks deletion state with two fields:

```prisma
model Identity {
  deletedAt  DateTime?  // When deletion was requested (null = not deleted)
  anonymized Boolean    // True = final deletion completed (irreversible)
}
```

**Status derivation (priority order)**:

1. `anonymized = true` → `DELETED` (final, irreversible)
2. `deletedAt != null` → `PENDING_DELETION` (grace period active)
3. `isSuspended = true` → `SUSPENDED` or `PENDING_RECOVERY`
4. Otherwise → `ACTIVE`

### 3. Immediate Effects on Deletion Request

When a user requests deletion, the backend **immediately**:

1. Sets `identity.deletedAt = now()`
2. Blocks all authenticated access via bootstrap (returns `PENDING_DELETION` status)
3. Captures email from authenticated JWT claim (stored temporarily for confirmation)
4. Cancels all pending scheduled notifications
5. Disables notification profile (prevents new notifications)
6. Cancels any in-progress GDPR export requests
7. Creates an audit log entry

**Behavioral Invariant**: From this moment, the identity is functionally inert:

- Notification services return NO-OP for this identity
- Background jobs skip this identity
- No system communication reaches the user

**Critical**: Authentication continues to succeed at the auth provider. Access control is enforced exclusively by backend logic.

### 4. Grace Period

During the grace period (default: 30 days):

- User is blocked from app access
- Data remains intact (not anonymized)
- Recovery may be possible (policy-driven via `DELETION_CANCELLATION_ALLOWED`)
- No new user-owned data can be created

Configuration:

```typescript
GDPR.DELETION_GRACE_PERIOD_DAYS = 30;
GDPR.DELETION_CANCELLATION_ALLOWED = true;
GDPR.DELETION_WARNING_DAYS = 7;
```

### 5. Final Deletion (After Grace Period)

A cron job processes expired grace periods:

1. Finds identities where `deletedAt + gracePeriod < now()` AND `anonymized = false`
2. Delegates to `GdprDeletionService` for data anonymization
3. Sets `identity.anonymized = true`
4. Sends confirmation email (in user's last known locale)
5. Optionally cleans up auth provider account (this step is LAST and OPTIONAL)

### 6. Auth Provider Independence

**Critical design principle**: Deletion NEVER relies on auth provider blocking.

| Approach                 | Why NOT                                                 |
| ------------------------ | ------------------------------------------------------- |
| Block at auth provider   | Couples deletion to provider API availability           |
| Rely on provider webhook | Inverts responsibility; backend should be authoritative |
| Token revocation         | Doesn't prevent new token issuance                      |

**Our approach**: Backend checks identity state on every authenticated request via bootstrap. Auth provider is blissfully unaware of deletion state.

### 7. Deletion Confirmation Email

After final deletion completes, a confirmation email MAY be sent to the user.

**Key characteristics**:

- This is NOT a notification — it does not use notification infrastructure
- Email address is captured at deletion request time from the authenticated JWT and stored temporarily in `GdprDeletionEmail`
- Email is sent after anonymization completes
- Email record is deleted immediately after send attempt (success or failure)
- Failure to send does NOT affect deletion success

**Flow**:

1. `requestDeletion()` captures email to `GdprDeletionEmail` before deleting notification tables
2. `finalizeDeletion()` sends email and deletes the record as the very last step

> [!WARNING]
> Deletion confirmation emails are a GDPR-scoped exception.
> They do NOT re-enable or use notification infrastructure.
> The `GdprDeletionEmail` table is write-once, read-once, delete-immediately.

---

## Consequences

### Positive

- **GDPR-compliant**: Satisfies Right to Erasure with proper grace period
- **Provider-agnostic**: Works with any OIDC provider (Supabase, Auth0, Keycloak, etc.)
- **Reversible**: Accidental deletions can be recovered during grace period
- **Auditable**: All operations are logged
- **Isolated**: Auth provider failures don't affect deletion enforcement

### Negative

- **Token lifetime gap**: Users with valid JWTs can still hit endpoints until token expires (mitigated by short token lifetimes + bootstrap check)
- **Complexity**: Two-phase model is more complex than immediate deletion
- **Storage**: Data retained during grace period uses storage (acceptable trade-off)

### Neutral

- Auth provider account may persist after final deletion (optional cleanup)
- Recovery cancellation can be disabled for stricter compliance

---

## Implementation

### Services

| Service                        | Responsibility                                        |
| ------------------------------ | ----------------------------------------------------- |
| `GdprDeletionLifecycleService` | Orchestrates full lifecycle (request → grace → final) |
| `GdprDeletionService`          | Executes data anonymization (registry-driven)         |
| `BootstrapService`             | Blocks access for `PENDING_DELETION` status           |
| `GdprCronService`              | Background processing of expired grace periods        |

### API Endpoints

| Endpoint                            | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `POST /api/v1/gdpr/delete`          | Request deletion (starts grace period) |
| `POST /api/v1/gdpr/cancel-deletion` | Cancel pending deletion (if allowed)   |
| `GET /api/v1/gdpr/deletion-status`  | Check deletion status                  |

### Cron Jobs

| Job                                  | Schedule | Purpose                              |
| ------------------------------------ | -------- | ------------------------------------ |
| `processExpiredDeletionGracePeriods` | Hourly   | Finalize deletions past grace period |
| `sendDeletionWarnings`               | Daily    | Warn users before final deletion     |

---

## Security Considerations

1. **Cancellation requires authentication**: User must still have a valid JWT to cancel
2. **No cancellation after anonymization**: Once `anonymized = true`, recovery is impossible
3. **Audit trail**: All operations logged to `GdprAuditLog`
4. **Rate limiting**: Consider rate limiting deletion/cancellation requests

---

## Future Extensions

1. **Email confirmation**: Send confirmation email after final deletion
2. **Auth provider cleanup**: Optional hook to delete auth provider account
3. **Admin override**: Admin ability to expedite or cancel deletions
4. **Data export before deletion**: Automatically generate export before final deletion

---

## References

- GDPR Article 17: Right to Erasure
- [Bootstrap Architecture](../BOOTSTRAP_ARCHITECTURE.md)
- [Create Tables Guideline](../create_tables_guideline.md)
- [GDPR Data Collection](../GDPR_DATA_COLLECTION.md)

---

## Amendment: Suspension Identifiers

**Suspension identifiers (`suspensionUid`, `anonymizedUid`) are generated ONCE at request time and are IMMUTABLE across all phases (immediate, deferred, recovery).** This ensures crash-safety and consistent data linkage.
