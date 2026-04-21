> Documentation Layer: Canonical Contract

# Deletion Legal Hold - Structural Deletion Block

> **Status**: Implemented  
> **Scope**: Template-layer infrastructure only

---

## Overview

Deletion legal holds provide a minimal architectural hook for **temporarily blocking account deletion** in exceptional legal circumstances.

> [!IMPORTANT]
> Deletion legal holds are **EXCEPTIONAL** and **MANUAL**.  
> They block **deletion only**. They do **NOT** retain personal data.

---

## ⚠️ THIS IS NOT

| What it IS NOT                 | Explanation                                         |
| ------------------------------ | --------------------------------------------------- |
| **Data retention**             | Does NOT preserve or retain any user data           |
| **Statutory retention**        | Invoices, payments, accounting records are SEPARATE |
| **Fraud prevention**           | Use `isBanned` for permanent access blocking        |
| **General-purpose legal hold** | Scoped ONLY to account deletion                     |

If you need any of the above, **DO NOT** reuse this mechanism. Implement a separate system.

---

## Design Principles

1. **Deletion-only**: Only blocks the deletion API; does not affect suspension, export, or app access
2. **Time-bounded**: Every deletion legal hold **MUST** have an expiration date
3. **Identity-based**: Uses internal identity ID, not external auth ID
4. **No data retention**: Does not preserve or retain any user data
5. **Automatic cleanup**: Expired holds are automatically removed via cron
6. **Template-safe**: No business-specific logic, no jurisdiction assumptions

---

## Behavior

### When a Deletion Legal Hold Exists

| Operation          | Blocked?   | Notes                                       |
| ------------------ | ---------- | ------------------------------------------- |
| Account Deletion   | ✅ **Yes** | Returns explicit error with expiration date |
| Account Suspension | ❌ No      | Proceeds normally                           |
| Data Export        | ❌ No      | Proceeds normally                           |
| Application Access | ❌ No      | User can continue using the app             |

### Guard Logic

The deletion guard is placed at the beginning of `GdprDeletionLifecycleService.requestDeletion()`:

```typescript
const hasDeletionLegalHold = await this.deletionLegalHoldService.hasActiveDeletionLegalHold(
  identity.id,
);
if (hasDeletionLegalHold) {
  throw new ForbiddenException(
    `Account deletion is temporarily blocked due to a deletion legal hold. ` +
      `The hold will expire on ${expiresAt}. Please try again after this date.`,
  );
}
```

---

## Database Schema

```prisma
model DeletionLegalHold {
  id         String   @id @default(uuid())
  identityId String   @db.Uuid
  reason     String
  legalBasis String   // e.g., "court_order", free text
  expiresAt  DateTime // REQUIRED
  createdAt  DateTime @default(now())

  @@map("deletion_legal_holds")
}
```

---

## Cron Cleanup

Expired deletion legal holds are automatically removed by calling:

```typescript
await this.gdprCronService.cleanupExpiredDeletionLegalHolds();
```

This ensures:

- No indefinite deletion blocks
- GDPR time-bounded compliance
- Self-cleaning infrastructure

---

## Creating Deletion Legal Holds

The template layer does **NOT** provide an API for creating deletion legal holds. This is intentionally left to the business layer because:

- Different businesses have different legal teams and approval workflows
- Jurisdictional requirements vary
- UI/admin console integration is application-specific

Example business layer implementation:

```typescript
// In your business layer (NOT template)
await prisma.deletionLegalHold.create({
  data: {
    identityId: identity.id,
    reason: 'Court order #12345',
    legalBasis: 'court_order',
    expiresAt: new Date('2027-01-01'),
  },
});
```

---

## ⚠️ Future Changes That REQUIRE GDPR Review

> [!CAUTION]
> **TRIPWIRE FOR MAINTAINERS, AUDITORS, AND LLM AGENTS**
>
> The following scenarios **MUST** trigger a mandatory GDPR architecture review.

### If Payments, Invoices, or Accounting Models Are Introduced

- ❌ **DO NOT** reuse `DeletionLegalHold` for statutory retention
- ✅ **MUST** implement a separate `StatutoryRetention` mechanism
- ✅ **MUST** keep statutory retention time-bounded (e.g., 7-10 years)
- ✅ Account deletion **MUST** still proceed (invoices are retained, not the account)
- ✅ User PI is anonymized; only document references are retained

**Example violation to catch:**

```typescript
// ❌ WRONG - DO NOT DO THIS
await prisma.deletionLegalHold.create({
  data: {
    identityId: user.id,
    reason: 'Invoice retention',
    legalBasis: 'statutory',
    expiresAt: addYears(new Date(), 10),
  },
});
```

### If Deletion Legal Holds Are Being Used Frequently

This indicates a **product, moderation, or legal escalation issue**, NOT a GDPR issue.

Investigate:

- Is this hold being used for fraud prevention? → Use `isBanned` instead
- Is this hold being used for user disputes? → Implement a dispute workflow
- Is this hold being used for mass moderation? → Escalation issue, not legal hold

### If Account Deletion Behavior Is Modified

- ✅ `DeletionLegalHold` **MUST** remain the **ONLY** deletion blocker
- ❌ **DO NOT** add additional blockers without GDPR review
- ❌ **DO NOT** make deletion reversible (use suspension for that)
- ❌ **DO NOT** retain data "just in case"

---

## Validation Self-Check

| Question                                         | Answer |
| ------------------------------------------------ | ------ |
| Is deletion still the default behavior?          | ✅ Yes |
| Was any new data retention introduced?           | ❌ No  |
| Were any domain assumptions added?               | ❌ No  |
| Is the template still provider-agnostic?         | ✅ Yes |
| Does this feature make sense even if never used? | ✅ Yes |
| Does the rename improve intent clarity?          | ✅ Yes |

---

## Related Files

- [schema.prisma](file:///d:/DevStuff/backend-base-api/prisma/schema.prisma) - `DeletionLegalHold` model
- [deletion-legal-hold.service.ts](file:///d:/DevStuff/backend-base-api/src/modules/gdpr/deletion-legal-hold.service.ts) - Service implementation
- [gdpr-deletion-lifecycle.service.ts](file:///d:/DevStuff/backend-base-api/src/modules/gdpr/gdpr-deletion-lifecycle.service.ts) - Guard placement
- [gdpr-cron.service.ts](file:///d:/DevStuff/backend-base-api/src/modules/gdpr/gdpr-cron.service.ts) - Cleanup cron
- [app.constants.ts](file:///d:/DevStuff/backend-base-api/src/config/app.constants.ts) - GDPR excluded tables

