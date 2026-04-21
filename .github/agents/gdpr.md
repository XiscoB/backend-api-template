## GDPR Architecture & Data Governance

> **Scope**: GDPR classification, data export, anonymization, audit logging.  
> **Parent**: [agents.md](../agents.md)

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## Scope Boundary

GDPR implementation is project-specific. This template provides the **infrastructure patterns** only.

---

## GDPR Classification

Every table is explicitly classified for GDPR. The classification is one of:

1. Included in GDPR export logic  
   **OR**
2. Added to the GDPR exclusion list  
   **OR**
3. Marked as SYSTEM-ONLY (non-user data)

There is no implicit default. An unclassified table is an incomplete change.

---

## Internal Admin Visibility

Every table added to the database must be visible in:

```
/internal/admin/view
```

Display constraints:

- Read-only is sufficient
- Sorting defaults to `updatedAt DESC` if available
- Tables with no GDPR classification display a warning badge: "Not classified for GDPR"

This ensures no table exists silently.

---

## Completeness Invariants for DB Changes

A table addition is complete only when all of the following hold:

- ✅ Prisma schema updated
- ✅ Migration exists
- ✅ GDPR classification is explicit
- ✅ Table appears in internal/admin/view
- ✅ If personal data → included or excluded intentionally

---

## Notification Invariant

Any notification event creates exactly one `notification_logs` entry.
Delivery attempts do not affect user-facing logs.

---

## Audit Logging

GDPR operations must be logged to `GdprAuditLog`:

- Export requests
- Deletion requests
- Suspension/resume actions
- Admin actions

Audit logs are:

- Immutable
- Excluded from GDPR exports (infrastructure data)
- Required for compliance

---

## GDPR Export Localization

All user-facing text in GDPR exports uses the localization service.

### Incorrect — hardcoded strings in `gdpr-document-builder.service.ts`:

```typescript
// ❌ WRONG - Hardcoded English text
fields.push({
  key: 'emailAddress',
  label: 'Email Address',
  explanation: 'Your registered email address for notifications',
});
```

### Correct — using `GdprLocalizationService`:

```typescript
// ✅ CORRECT - Uses localization service
fields.push({
  key: 'emailAddress',
  label: this.localization.getFieldLabel('emailAddress', language),
  explanation: this.localization.getFieldExplanation('emailAddress', language),
});
```

### Requirements for new GDPR export fields

- Field translations exist in `src/common/translations/en.ts` (under `gdpr.fields`)
- Field translations exist in `src/common/translations/es.ts` (and any other supported languages)
- The document builder uses `this.localization.getFieldLabel()` and `this.localization.getFieldExplanation()`
- Boolean values use `this.localization.formatBoolean()`
- Nullable values use `this.localization.formatNullable()`

This ensures GDPR exports are properly localized for all supported languages.

---

## Identity Flags

The Identity model contains GDPR-relevant flags:

| Flag          | Purpose                                          |
| ------------- | ------------------------------------------------ |
| `deletedAt`   | When deletion was requested (grace period start) |
| `anonymized`  | Data has been anonymized (final, irreversible)   |
| `isSuspended` | Account is suspended (Right to Restriction)      |
| `isFlagged`   | Moderation: Account is flagged for review        |

These flags are the **single source of truth** for privacy features.

---

## Deletion Lifecycle

Account deletion follows a **two-phase model**:

### Phase 1: Logical Deletion (Immediate)

When a user requests deletion:

1. ✅ Set `identity.deletedAt = now()`
2. ✅ Block all authenticated access (bootstrap returns `PENDING_DELETION`)
3. ✅ Cancel pending notifications
4. ✅ Cancel in-progress export requests
5. ✅ Create audit log entry

**Critical invariants:**

- Authentication continues to succeed at auth provider
- Access control is enforced by backend only
- No calls to auth provider APIs

### Phase 2: Final Deletion (After Grace Period)

After `GDPR.DELETION_GRACE_PERIOD_DAYS` (default: 30 days):

1. ✅ Anonymize/delete data per GDPR registry
2. ✅ Set `identity.anonymized = true`
3. ✅ Send confirmation email
4. ⚠️ Optional: Clean up auth provider account (LAST and OPTIONAL)

### Status Derivation (Priority Order)

```
1. anonymized = true        → DELETED (final, irreversible)
2. deletedAt != null        → PENDING_DELETION (grace period)
3. isSuspended = true       → SUSPENDED or PENDING_RECOVERY
4. Otherwise                → ACTIVE
```

### Configuration

```typescript
GDPR.DELETION_GRACE_PERIOD_DAYS = 30; // Days before final deletion
GDPR.DELETION_CANCELLATION_ALLOWED = true; // Allow user to cancel
GDPR.DELETION_WARNING_DAYS = 7; // Warn N days before final
```

### Key Services

| Service                        | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `GdprDeletionLifecycleService` | Orchestrates request → grace → final         |
| `GdprDeletionService`          | Executes data anonymization (registry-based) |
| `BootstrapService`             | Blocks access for `PENDING_DELETION`         |
| `GdprCronService`              | Background processing of expired periods     |

### Deletion anti-patterns

| Action                              | Why                                  |
| ----------------------------------- | ------------------------------------ |
| Block at auth provider              | Couples to provider API availability |
| Rely on auth provider webhooks      | Inverts responsibility               |
| Skip audit logging                  | Required for GDPR compliance         |
| Delete without grace period         | Violates reversibility requirement   |
| Make auth provider cleanup required | Must work if provider is unavailable |

### Deletion implementation requirements

- New deletions go through `GdprDeletionLifecycleService.requestDeletion()`
- Bootstrap checks `identity.deletedAt` for access blocking
- All deletion operations are logged to `GdprAuditLog`
- Confirmation emails respect the user's locale

---

## ADR Reference

See [ADR-009-GDPR-DELETION-LIFECYCLE](../../docs/adr/ADR-009-GDPR-DELETION-LIFECYCLE.md) for detailed design rationale.
