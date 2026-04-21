> Documentation Layer: Canonical Contract

# Internal Operational Logging

> **⚠️ CRITICAL**: This is STRICTLY for internal operational diagnostics.  
> This is NOT analytics. This is NOT audit logging. This is NOT user activity tracking.

## Purpose

Internal operational logs provide a time-bounded, automatically cleaned diagnostic system for platform stability monitoring. These logs are:

- **Write-once, immutable** - No updates after creation
- **Time-bounded** - Automatically deleted after retention period
- **Not personal data** - NOT included in GDPR exports
- **Not audit logs** - Use `GdprAuditLog` for compliance

**Legal basis**: Legitimate interest (platform stability)

---

## What is Allowed to be Logged

| ✅ ALLOWED               | Example                                    |
| ------------------------ | ------------------------------------------ |
| Service health           | "GdprCronService started"                  |
| Error conditions         | "Database connection timeout after 30s"    |
| Performance diagnostics  | "Export processing took 5200ms"            |
| Infrastructure events    | "Cleanup job removed 150 expired exports"  |
| Debug context (optional) | `{ "batchSize": 100, "durationMs": 1500 }` |

---

## What MUST NEVER be Logged

| ❌ FORBIDDEN                   | Why                  |
| ------------------------------ | -------------------- |
| Request bodies                 | Privacy violation    |
| JWTs or tokens                 | Security breach      |
| Passwords or secrets           | Security breach      |
| PII (names, emails, addresses) | GDPR violation       |
| Business data                  | Wrong system         |
| User activity patterns         | Privacy violation    |
| Financial data                 | Compliance violation |

---

## Retention Policy

| Setting          | Default              | Environment Variable               |
| ---------------- | -------------------- | ---------------------------------- |
| Retention period | 14 days              | `INTERNAL_LOG_RETENTION_DAYS`      |
| Cleanup enabled  | **true** (fail-safe) | `INTERNAL_LOG_CLEANUP_ENABLED`     |
| Batch size       | 1000                 | Configurable in `app.constants.ts` |

Logs older than the retention period are **automatically deleted** by the daily cron job.

---

## Automatic Cleanup

Cleanup is performed by `GdprCronService.cleanupExpiredInternalLogs()`:

- **Frequency**: Daily (recommended)
- **Behavior**: Deletes logs older than retention period
- **Idempotent**: Safe to run multiple times
- **No side effects**: Only affects `internal_logs` table

```typescript
// Cron job example
await gdprCronService.cleanupExpiredInternalLogs();
```

---

## GDPR Considerations

| Aspect                | Status                    |
| --------------------- | ------------------------- |
| Included in exports   | **NO**                    |
| Personal data         | **NO** (by default)       |
| Identity reference    | Optional (debugging only) |
| Deleted automatically | **YES**                   |

The optional `identityId` field is for debugging correlations ONLY. It does NOT make logs personal data if no PII is stored in the message or context.

---

## Future-Change Tripwire

> **⚠️ STOP AND REDESIGN** if any of the following conditions become true:

| Condition                         | Action Required                             |
| --------------------------------- | ------------------------------------------- |
| Logs used for analytics           | **STOP** - Use external observability tools |
| Logs retained > configured period | **VIOLATION** - GDPR non-compliance         |
| Logs linked to business reporting | **STOP** - Wrong system                     |
| Logs kept indefinitely            | **FORBIDDEN** - Violates design             |
| Logs contain PII                  | **STOP** - Privacy violation                |
| Logs used for user tracking       | **STOP** - Privacy violation                |
| `identityId` becomes mandatory    | **REQUIRES GDPR REVIEW**                    |

### Review Triggers

Any change to internal logging that involves:

- ❌ Adding new fields with user data → **REQUIRES GDPR REVIEW**
- ❌ Increasing retention beyond 30 days → **REQUIRES GDPR REVIEW**
- ❌ Including logs in data exports → **REQUIRES GDPR REVIEW**
- ❌ Using logs for behavior analysis → **FORBIDDEN**
- ❌ Making `identityId` mandatory → **REQUIRES GDPR REVIEW**

---

## Configuration Reference

### app.constants.ts

```typescript
export const INTERNAL_LOGS = {
  DEFAULT_RETENTION_DAYS: 14,
  CLEANUP_BATCH_SIZE: 1000,
} as const;
```

### .env.example

```env
# Enable internal log cleanup (default: true)
INTERNAL_LOG_CLEANUP_ENABLED=true

# Retention period in days (default: 14)
INTERNAL_LOG_RETENTION_DAYS=14
```

---

## Schema Reference

```prisma
model InternalLog {
  id         String           @id @default(uuid()) @db.Uuid
  level      InternalLogLevel
  source     String           // Service/module name
  message    String           // Human-readable message
  context    Json?            // Optional context (NO PII)
  identityId String?          // Optional, debugging only
  createdAt  DateTime         @default(now())

  @@map("internal_logs")
}

enum InternalLogLevel {
  INFO
  WARN
  ERROR
}
```

---

## See Also

- [GDPR_DATA_COLLECTION.md](./GDPR_DATA_COLLECTION.md) - Audit log documentation
- [INFRA_CLEANUP_CRONS.md](./INFRA_CLEANUP_CRONS.md) - Cleanup job documentation
- [app.constants.ts](../src/config/app.constants.ts) - Configuration constants

