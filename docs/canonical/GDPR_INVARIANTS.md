> Documentation Layer: Canonical Contract

# GDPR Architectural Invariants

This document defines **non-negotiable architectural contracts** governing GDPR compliance in this repository.

These invariants are **system integrity constraints**, not guidelines. Violation represents a critical failure.

---

## 1. Identity Ownership Invariant

> **Any database model containing `identityId` (or equivalent ownership marker) MUST be explicitly classified in either `GDPR_INCLUDED_TABLES` or `GDPR_EXCLUDED_TABLES`.**

### Definition

| Field                                      | Meaning                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `identityId`                               | Direct ownership: table rows belong to a user                 |
| `notificationProfileId`                    | Indirect ownership: child table referencing user-owned parent |
| `reporterIdentityId`, `reportedIdentityId` | Multi-identity references (special case)                      |

### Classification

| List                   | Purpose                     | Consequence                                      |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| `GDPR_INCLUDED_TABLES` | User-owned data             | Backed up during suspension, exported on request |
| `GDPR_EXCLUDED_TABLES` | Infrastructure/audit tables | Deleted via CASCADE, NOT backed up independently |

### Why This Invariant Exists

1. **Prevent Silent Data Leakage**
   - Unclassified tables are NOT backed up during suspension
   - User data may be lost or retained incorrectly
   - GDPR export may be incomplete

2. **Suspension/Recovery Integrity**
   - Backup mechanism only processes registered tables
   - Unregistered user data is silently skipped during suspension
   - Recovery cannot restore data that was never backed up

3. **Deletion Completeness**
   - GDPR deletion must remove ALL user data
   - Unclassified tables may retain orphan personal data
   - Violates GDPR Article 17 (Right to Erasure)

### Violation Consequences

| Scenario                            | Effect                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| User-owned table NOT in either list | Data excluded from suspension backup → **unrecoverable after suspension** |
| User-owned table NOT in either list | Data excluded from GDPR export → **incomplete data portability**          |
| User-owned table NOT in either list | Data may be retained after deletion → **GDPR violation**                  |

### Enforcement Levels

| Level                  | Current State               | Recommendation                                                                                                                   |
| ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Documentation**      | ✅ This document            | Canonical reference                                                                                                              |
| **Runtime Validation** | ✅ `validateGdprRegistry()` | Validates declared registry consistency (models exist, fields valid). Does NOT scan schema for unclassified `identityId` models. |
| **Schema Scanning**    | ⚠️ Not implemented          | ADD: Scan for `identityId` fields; fail if unclassified                                                                          |
| **CI/Pipeline**        | ⚠️ Not implemented          | ADD: Pre-merge check for schema changes                                                                                          |

---

## 2. Backup Completeness Invariant

> **Every table in `GDPR_INCLUDED_TABLES` MUST be fully backed up before any destructive operation during suspension.**

### Mechanism

- Backup stores **complete row snapshots as JSON** (`backupData` field)
- All fields are captured, not just declared `piiFields`
- Schema version is recorded (`backupSchemaVersion`) for migration compatibility

### Implication

- New columns on existing tables are **automatically included** in backups
- Column renames require **migration strategy** (old backups use old field names)
- Column deletions cause **silent data loss** from existing backups (logged, not fatal)

---

## 3. Classification Checklist

When adding a new database table:

### If Table Contains User-Owned Data

1. ☐ Add model name to `GDPR_INCLUDED_TABLES` in `src/config/app.constants.ts`
2. ☐ Add field-level configuration to `GDPR_EXPORT_TABLES` in `src/modules/gdpr/gdpr.registry.ts`
3. ☐ If ANONYMIZE strategy needed, add to `GDPR_ANONYMIZE_OVERRIDES`
4. ☐ Run startup validation: `npm run build`
5. ☐ Run suspension backup test: `node scripts/test-suspension-backup.js`

### If Table Is Infrastructure/Audit

1. ☐ Add model name to `GDPR_EXCLUDED_TABLES` in `src/config/app.constants.ts`
2. ☐ Verify table uses `onDelete: Cascade` from Identity (if applicable)
3. ☐ Verify table does NOT contain user-owned personal data

### If Unsure

**Classify as `GDPR_INCLUDED_TABLES` by default.** Over-inclusion is safer than under-inclusion.

---

## References

| Document                                                    | Scope                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [GDPR_DATA_COLLECTION.md](./GDPR_DATA_COLLECTION.md)        | Data collection layer implementation                         |
| [SUSPENSION_RECOVERY.md](./SUSPENSION_RECOVERY.md)          | Suspension lifecycle and recovery flow                       |
| [gdpr.registry.ts](../../src/modules/gdpr/gdpr.registry.ts) | Table registration and validation                            |
| [app.constants.ts](../../src/config/app.constants.ts)       | Table lists (`GDPR_INCLUDED_TABLES`, `GDPR_EXCLUDED_TABLES`) |

