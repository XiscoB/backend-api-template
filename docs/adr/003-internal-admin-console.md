# ADR 003: Internal Admin Console

## Status

Accepted

## Date

2025-12-31

## Context

We need operational tooling for rare, manual interventions on database tables. This is NOT a product feature — it is ops tooling for exceptional circumstances like debugging issues, manual data corrections, or incident response.

The challenge is providing this capability without compromising the security model or architectural integrity of the template.

## Decision

Introduce an internal admin console with the following strict constraints:

### 1. Environment-Gated

- Enabled only via `ADMIN_CONSOLE_ENABLED=true`
- Read at process startup only
- Requires full backend restart to enable/disable
- When disabled, routes are NOT mounted (not just protected)
- Default: **disabled**

### 2. Separate Path

- Mounted under `/internal/admin`
- Does not share routing or middleware with public APIs
- Completely separate from the `/api/v*` namespace

### 3. Two-Tier Authorization

Two explicit privilege levels, separate from `AppRole`:

| Privilege     | Access                             |
| ------------- | ---------------------------------- |
| `ADMIN_READ`  | Read-only access to visible tables |
| `ADMIN_WRITE` | Read + limited write (no delete)   |

- Privileges are extracted from JWT claims (`app_metadata.roles`, `realm_access.roles`, etc.)
- Uses `AdminPrivilegeGuard`, separate from public `RolesGuard`
- No fallback access — explicit deny by default

### 4. Hardcoded Table Allowlists

Three static lists defined in code:

```typescript
VISIBLE_TABLES; // Tables that can be queried
WRITEABLE_TABLES; // Tables that can be updated (subset of VISIBLE)
HIDDEN_TABLES; // Tables never exposed (even to ADMIN_WRITE)
```

- No dynamic table discovery
- Default behavior: DENY
- Validated at module load time

### 5. Write Safety

- No deletes (start conservative)
- No bulk operations
- Single-record updates only
- Protected fields cannot be updated (`id`, `createdAt`, `externalUserId`)

### 6. Rate Limiting

- Uses `rl-internal-admin-strict` tier (10 requests/60s per user)
- Strictest rate limit in the system
- No overrides, no shared buckets

### 7. Operational Visibility

When enabled, logs prominently at startup:

```
⚠️  INTERNAL ADMIN CONSOLE ENABLED
```

No silent enablement.

## Configuration

All admin console configuration is centralized in a single file:

```
src/modules/internal-admin/internal-admin.config.ts
```

This file exports `INTERNAL_ADMIN_CONFIG` — the **single source of truth** for:

| Section       | Contents                                   |
| ------------- | ------------------------------------------ |
| `mounting`    | Base path, enablement env var              |
| `privileges`  | `ADMIN_READ`, `ADMIN_WRITE` enum           |
| `tables`      | `visible`, `writable`, `hidden` arrays     |
| `writeSafety` | Update/delete/bulk flags, protected fields |
| `rateLimit`   | Tier name, limit, window                   |
| `safety`      | Audit flags, deny-by-default               |

To modify admin console behavior:

1. Edit `internal-admin.config.ts`
2. Restart the backend

No other files need changes for configuration updates.

## File Structure

```
src/modules/internal-admin/
├── internal-admin.config.ts    # ⭐ SINGLE SOURCE OF TRUTH
├── admin.constants.ts          # Re-exports for backward compatibility
├── admin.types.ts              # Type definitions
├── admin.decorators.ts         # @AdminReadOnly(), @AdminWriteRequired()
├── admin-privilege.guard.ts    # Authorization guard
├── current-admin-user.decorator.ts
├── internal-admin.controller.ts
├── internal-admin.service.ts
├── internal-admin.module.ts
├── index.ts
└── dto/
    ├── admin.dto.ts
    └── index.ts
```

## Endpoints

| Method | Path                                | Privilege   | Description          |
| ------ | ----------------------------------- | ----------- | -------------------- |
| GET    | `/internal/admin/tables`            | ADMIN_READ  | List visible tables  |
| GET    | `/internal/admin/query`             | ADMIN_READ  | Query table records  |
| GET    | `/internal/admin/record/:table/:id` | ADMIN_READ  | Get single record    |
| POST   | `/internal/admin/update`            | ADMIN_WRITE | Update single record |
| GET    | `/internal/admin/health`            | ADMIN_READ  | Admin console health |

## Consequences

### Positive

- Provides controlled operational access when needed
- Off by default — safe for production deployments
- Restart-only toggle prevents accidental runtime exposure
- Explicit privilege model separate from product roles
- Hardcoded allowlists prevent scope creep
- Strictest rate limiting prevents abuse
- Clear audit trail via logging

### Negative

- Adds complexity to the codebase
- Requires managing table allowlists manually
- Restart required to enable (by design, but inconvenient)

### Risks Mitigated

- No runtime toggles → no accidental exposure
- No dynamic discovery → no unintended table access
- No deletes → no catastrophic data loss
- No bulk operations → no mass modification
- Separate guards → no privilege escalation via public APIs

## Notes

This tooling must remain **boring, explicit, and uncomfortable to misuse**.

Adding new tables to allowlists requires code changes and deployment — this is intentional.
