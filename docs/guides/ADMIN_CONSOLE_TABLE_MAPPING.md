> Documentation Layer: Operational Guide

# Admin Console Table Mapping Reference

**Critical Reference: Prisma Model Names vs Database Table Names**

⚠️ **Most common admin console error: Wrong table names in configuration**

---

## The Problem

The admin console configuration requires **Prisma model names** that match the `@@map()` directive in your schema, NOT the TypeScript class names.

### ❌ Wrong Configuration

```typescript
// internal-admin.config.ts
VISIBLE: [
  'NotificationLog', // WRONG - This is the TypeScript class name
  'gdpr_export_requests', // WRONG - This table doesn't exist
  'notifications', // WRONG - Table is named differently
];
```

**Result:** HTTP 400 errors with "Model not found for table: X"

### ✅ Correct Configuration

```typescript
// internal-admin.config.ts
VISIBLE: [
  'notification_logs', // CORRECT - Matches @@map("notification_logs")
  'requests', // CORRECT - Matches @@map("requests")
  'gdpr_audit_logs', // CORRECT - Matches @@map("gdpr_audit_logs")
];
```

---

## How to Find the Correct Table Name

### Step 1: Open `prisma/schema.prisma`

### Step 2: Find Your Model

```prisma
model NotificationLog {
  id            String    @id @default(uuid()) @db.Uuid
  // ... other fields

  @@map("notification_logs")  // ← THIS is the name you need
}
```

### Step 3: Use the `@@map()` Value

The value in `@@map("...")` is what you put in the admin config.

If there's no `@@map()` directive, use the lowercase model name.

---

## Complete Reference Table

**All available models in this template:**

| Prisma Model Class        | Database Table Name          | Admin Config Name            | Use This |
| ------------------------- | ---------------------------- | ---------------------------- | -------- |
| `Profile`                 | `profiles`                   | `profiles`                   | ✅       |
| `Request`                 | `requests`                   | `requests`                   | ✅       |
| `GdprAuditLog`            | `gdpr_audit_logs`            | `gdpr_audit_logs`            | ✅       |
| `NotificationLog`         | `notification_logs`          | `notification_logs`          | ✅       |
| `ScheduledNotification`   | `scheduled_notifications`    | `scheduled_notifications`    | ✅       |
| `UserNotificationProfile` | `user_notification_profiles` | `user_notification_profiles` | ✅       |
| `UserEmailChannel`        | `user_email_channels`        | `user_email_channels`        | ✅       |
| `UserPushChannel`         | `user_push_channels`         | `user_push_channels`         | ✅       |
| `AccountSuspension`       | `account_suspensions`        | `account_suspensions`        | ✅       |
| `SuspensionBackup`        | `suspension_backups`         | `suspension_backups`         | ✅       |

---

## Common Mistakes

### Mistake 1: Using TypeScript Class Name

```typescript
// ❌ WRONG
VISIBLE: ['NotificationLog'];

// ✅ CORRECT
VISIBLE: ['notification_logs'];
```

### Mistake 2: Guessing Table Names

```typescript
// ❌ WRONG - Guessing based on feature name
VISIBLE: ['gdpr_exports', 'gdpr_deletions', 'notifications'];

// ✅ CORRECT - Using actual @@map values
VISIBLE: [
  'requests', // Single table for all GDPR requests
  'gdpr_audit_logs', // Audit trail
  'notification_logs', // Not 'notifications'!
];
```

### Mistake 3: Not Checking Schema After Migrations

**After adding new migrations:**

1. ✅ Check `prisma/schema.prisma` for new models
2. ✅ Find the `@@map("...")` value
3. ✅ Add to admin config using that exact name
4. ✅ Rebuild Docker image

```bash
docker-compose up -d --build backend
```

---

## Quick Verification Script

Run this to see all your Prisma model mappings:

```bash
# PowerShell
Get-Content prisma/schema.prisma | Select-String "@@map"

# Bash
grep "@@map" prisma/schema.prisma
```

**Output example:**

```
@@map("profiles")
@@map("requests")
@@map("notification_logs")
@@map("gdpr_audit_logs")
```

These are the names to use in your admin config.

---

## Fixing HTTP 400 Errors

### Symptom

Browser shows: **"❌ HTTP 400 - Retry"** when clicking a table.

Backend logs show:

```
[InternalAdminService] Failed to query table X: Model not found for table: X
```

### Solution

1. **Find the correct name** in `prisma/schema.prisma`:

```bash
grep -A 20 "model YourModel" prisma/schema.prisma | grep "@@map"
```

2. **Update config** in `src/modules/internal-admin/internal-admin.config.ts`:

```typescript
VISIBLE: [
  'correct_table_name', // Use @@map value here
];
```

3. **Rebuild and restart**:

```bash
docker-compose up -d --build backend
```

4. **Hard refresh browser** (Ctrl+Shift+R)

---

## Example: Adding GDPR Tables

### ❌ Wrong Approach (What We Did Initially)

```typescript
VISIBLE: [
  'gdpr_export_requests', // Doesn't exist
  'gdpr_deletion_requests', // Doesn't exist
  'gdpr_suspension_requests', // Doesn't exist
];
```

**Result:** HTTP 400 on all GDPR tables.

### ✅ Correct Approach

Check schema:

```prisma
model Request {
  id             String        @id @default(uuid())
  requestType    RequestType   @map("request_type")
  // GDPR_EXPORT, GDPR_DELETE, GDPR_SUSPEND all in ONE table

  @@map("requests")  // ← Single unified table!
}
```

**Correct config:**

```typescript
VISIBLE: [
  'requests', // Single table contains all GDPR request types
];
```

---

## Special Cases

### Tables Without @@map

If a model has no `@@map()` directive:

```prisma
model Example {
  id String @id
  // No @@map directive
}
```

Use the **lowercase model name**: `'example'`

### Junction Tables

Many-to-many junction tables often have `@@map`:

```prisma
model UserRole {
  @@map("user_roles")
}
```

Use: `'user_roles'` (not `'UserRole'`)

### Legacy Tables

If you have legacy tables with unusual names:

1. Check `@@map()` in schema
2. Use that exact value
3. No shortcuts or assumptions

---

## Configuration Template

Copy this template when adding new tables:

```typescript
// src/modules/internal-admin/internal-admin.config.ts

const TABLE_ACCESS = {
  VISIBLE: [
    'profiles', // From: @@map("profiles")
    'requests', // From: @@map("requests")
    'gdpr_audit_logs', // From: @@map("gdpr_audit_logs")
    'notification_logs', // From: @@map("notification_logs")
    'scheduled_notifications', // From: @@map("scheduled_notifications")
    'user_notification_profiles', // From: @@map("user_notification_profiles")
    // Add new tables here with @@map value
  ] as const,

  WRITABLE: [
    'notification_logs', // Subset of VISIBLE
  ] as const,
};
```

**Rule:** Every table name MUST have a corresponding `@@map("...")` in `prisma/schema.prisma`.

---

## Checklist When Adding Tables

Before adding a table to admin config:

- [ ] Find the model in `prisma/schema.prisma`
- [ ] Locate the `@@map("...")` directive
- [ ] Copy the EXACT value from `@@map()`
- [ ] Add to `TABLE_ACCESS.VISIBLE` array
- [ ] (Optional) Add to `TABLE_ACCESS.WRITABLE` if updates needed
- [ ] Rebuild Docker image: `docker-compose up -d --build backend`
- [ ] Test in browser UI
- [ ] Check logs for "Model not found" errors

---

## Debugging Commands

### Check Prisma Schema for All Tables

```bash
# PowerShell
Select-String -Path prisma/schema.prisma -Pattern "@@map" | ForEach-Object { $_.Line.Trim() }

# Bash
grep "@@map" prisma/schema.prisma | awk -F'"' '{print $2}'
```

### Check Current Admin Config

```bash
# PowerShell
Select-String -Path src/modules/internal-admin/internal-admin.config.ts -Pattern "VISIBLE:" -Context 0,15

# Bash
grep -A 15 "VISIBLE:" src/modules/internal-admin/internal-admin.config.ts
```

### Check Backend Logs for Errors

```bash
docker-compose logs backend --tail 100 | grep "Model not found"
```

---

## Summary

**Golden Rule:** Always use the `@@map("...")` value from Prisma schema, never guess.

**When adding tables:**

1. Open `prisma/schema.prisma`
2. Find `@@map("table_name")`
3. Use `table_name` in config
4. Rebuild Docker image
5. Test

**When debugging HTTP 400:**

1. Check backend logs for "Model not found"
2. Compare config name vs `@@map()` in schema
3. Fix mismatch
4. Rebuild
5. Hard refresh browser

---

## Related Documentation

- [docs/INTERNAL_ADMIN_CONSOLE.md](INTERNAL_ADMIN_CONSOLE.md) - Full admin console documentation
- [prisma/schema.prisma](../prisma/schema.prisma) - Source of truth for table names
- [agents.md](../agents.md) - Template constraints and rules

