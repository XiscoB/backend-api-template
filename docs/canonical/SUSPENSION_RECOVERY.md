> Documentation Layer: Canonical Contract

# Suspension & Recovery System

## Overview

This document describes the **Suspension as Reversible Deletion** pattern implemented in this repository.

## Mental Model

> Suspension = Reversible Deletion with Recovery Window

A suspended account **MUST behave exactly like a deleted account**. The only difference is:

- During suspension: A backup exists and recovery is possible
- After expiration: Backups are deleted and recovery is **impossible**

## Lifecycle States

| State        | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| `ACTIVE`     | Normal account (no active suspension)                                 |
| `SUSPENDING` | Suspension in progress, recovery NOT allowed                          |
| `SUSPENDED`  | Data anonymized, backup exists, recovery possible                     |
| `RECOVERED`  | Restored from backup, re-activated                                    |
| `EXPIRED`    | Backup deleted, recovery impossible, equivalent to permanent deletion |

### State Transitions

```
ACTIVE ──(suspend)──> SUSPENDING ──(cron completes)──> SUSPENDED ──(recover)──> RECOVERED
                                                            │
                                                            └──(expire)──> EXPIRED
```

**Transition Rules:**

- `ACTIVE → SUSPENDING`: User requests suspension (immediate)
- `SUSPENDING → SUSPENDED`: Cron completes deferred processing
- `SUSPENDED → RECOVERED`: User requests recovery within window
- `SUSPENDED → EXPIRED`: Recovery window expires (automatic)
- `RECOVERED → SUSPENDING`: User can re-suspend (after cooldown)
- `EXPIRED`: **Terminal state** - no further transitions possible

> [!IMPORTANT]
> **Recovery is ONLY allowed from SUSPENDED, never from SUSPENDING.**
> This prevents partial suspension recovery bugs.

---

## Suspension Flow (Hybrid: Immediate + Deferred)

### Endpoint

```
POST /api/v1/gdpr/suspend
```

> [!IMPORTANT]
> **Immediate Enforcement**: When this endpoint is called, `Identity.isSuspended` is set to `true` **synchronously**. Access is blocked immediately at request boundaries.

### Immediate Effects (T+0, Before Response)

When `POST /api/v1/gdpr/suspend` returns, the following has already happened:

1. `Identity.isSuspended = true` (access blocked)
2. Suspension record created (crash-safety)
3. **IMMEDIATE-risk tables backed up and DELETED**:
   - `UserNotificationProfile` (notification preferences)
   - `UserEmailChannel` (email delivery tokens)
   - `UserPushChannel` (push tokens)
   - `ScheduledNotification` (scheduled notifications - deleted, not cancelled)

> [!WARNING]
> **Recovery does not guarantee restoration of risky tables.**
> Notification preferences, delivery tokens, and scheduled notifications may not be restored during account recovery.

### Deferred Effects (Cron)

Background processing handles remaining tables:

1. Calculate `suspended_until` (recovery deadline)
2. Back up remaining tables
3. Anonymize remaining data
4. Invoke suspension hooks
5. Write audit log

### Why Immediate Risky-Table Deletion?

IMMEDIATE-risk tables are tables that can:

- Cause outbound side effects (notifications)
- Leak identifiers (tokens)
- Create complex behavioral gating logic

These are backed up and **DELETED** immediately to ensure:

- No outbound notifications can be sent
- No delivery tokens remain active
- No scheduled notifications can fire

> [!NOTE]
> **"PENDING" means in-progress, not reversible.**
> Suspension cannot be cancelled once requested. The PENDING status refers only to deferred processing.

---

## Recovery Flow (Strict & Deterministic)

### Endpoint

```
POST /api/v1/gdpr/recover
```

### Preconditions (ALL must be true)

| Condition              | Description                      |
| ---------------------- | -------------------------------- |
| `backupExists`         | Backup exists for the suspension |
| `backupNotUsed`        | Backup has not been consumed     |
| `withinRecoveryWindow` | Current time < `suspended_until` |
| `accountIsSuspended`   | Account is in SUSPENDED state    |
| `notExpired`           | Suspension has not expired       |

If **ANY** precondition fails, recovery is **DENIED**.

### Flow

1. Validate ALL recovery preconditions
2. Load all unused backups for the suspension
3. Restore only whitelisted fields per table
4. Mark backups as `used = true`
5. Update suspension to `RECOVERED` state
6. Unblock login (via hooks)
7. Write audit log

### Recovery Guarantees

- Partial recovery is allowed but logged
- No new backups are created during recovery
- Recovery is deterministic (same input = same output)

---

## Expiration & Finalization

### Trigger Conditions

Expiration is triggered when ALL are true:

- `now > suspended_until`
- `lifecycleState = SUSPENDED`

### Flow

1. Create minimal legal retention record (audit log)
2. **Permanently delete all backups**
3. Mark `lifecycleState = EXPIRED`
4. Notify user (if possible)

### After Expiration

- Recovery is **IMPOSSIBLE**
- The user is equivalent to **permanently deleted**
- Only audit logs remain for compliance

---

## Backup Layer

### Schema

```prisma
model SuspensionBackup {
  id                   String   @id @default(uuid())
  suspensionUid        String   // Links to parent suspension
  identityId           String   // Denormalized for queries
  anonymizedUid        String   // Denormalized for restore
  tableName            String   // Prisma model name
  backupData           Json     // Original data snapshot
  backupSchemaVersion  String   @default("1.0")
  backupUsed           Boolean  @default(false)
  createdAt            DateTime @default(now())
  restoredAt           DateTime?
}
```

### Invariants

1. **Write-once**: Backups are never modified after creation
2. **backupUsed**: Marks backup as consumed by recovery
3. **Bulk deletable**: All backups for a suspension can be deleted atomically
4. **Schema versioned**: Future migrations can handle version differences

---

## Shared Anonymization Logic

The `GdprAnonymizationService` provides unified anonymization for both:

### Suspension Mode

```typescript
await anonymizationService.anonymize({
  identityId,
  anonymizedUid,
  mode: 'SUSPEND',
  suspensionUid,
});
```

- Creates backups before anonymization
- Enables recovery within window

### Deletion Mode

```typescript
await anonymizationService.anonymize({
  identityId,
  anonymizedUid,
  mode: 'DELETE',
});
```

- **No backups** created
- Permanent anonymization
- No recovery possible

---

## Configuration

```typescript
const DEFAULT_SUSPENSION_CONFIG = {
  defaultGracePeriodDays: 30, // Recovery window
  recoveryCooldownHours: 24, // Cooldown after recovery
  expirationWarningDays: 7, // Warning before expiration
};
```

---

## API Reference

### Request Suspension

```
POST /api/v1/gdpr/suspend
Response: 202 Accepted
```

### Recover Account

```
POST /api/v1/gdpr/recover
Response: 200 OK
Errors:
  - 404: No active suspension found
  - 403: Recovery preconditions not met
```

---

## Notifications

| Type                        | When                          |
| --------------------------- | ----------------------------- |
| `GDPR_SUSPENSION_ACTIVE`    | Account suspended             |
| `GDPR_SUSPENSION_EXPIRING`  | 7 days before expiration      |
| `GDPR_SUSPENSION_RECOVERED` | Account recovered             |
| `GDPR_SUSPENSION_EXPIRED`   | Account expired (no recovery) |

---

## Audit Log Actions

| Action    | Meaning                                           |
| --------- | ------------------------------------------------- |
| `SUSPEND` | Suspension initiated/completed                    |
| `RESUME`  | Recovery completed                                |
| `DELETE`  | Expiration finalized (status: SUSPENSION_EXPIRED) |

---

## Implementation Checklist

When implementing suspension for a new table:

1. ✅ Add table to GDPR registry with `suspend` config
2. ✅ Define fields to anonymize
3. ✅ Define fields to restore (whitelist)
4. ✅ Test suspension flow
5. ✅ Test recovery flow
6. ✅ Test expiration flow
7. ✅ Verify `npm run docker:reset` works

---

## Explicit Non-Goals

❌ Soft suspension (partial restriction)  
❌ Personal data live during suspension  
❌ GDPR "restriction of processing" (different concept)  
❌ UI concepts (screens, tabs, UX)  
❌ Over-optimized backups

---

## References

- [agents.md](../agents.md) - Agent instructions
- [create_tables_guideline.md](create_tables_guideline.md) - Table design rules
- [GDPR_REQUEST_PROCESSING.md](GDPR_REQUEST_PROCESSING.md) - Request lifecycle

