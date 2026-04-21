> Documentation Layer: Canonical Contract

# Bootstrap Architecture

This document describes the two-tier bootstrap architecture for client initialization.

## Overview

The backend provides two distinct bootstrap endpoints:

1. **Public Bootstrap** (`GET /api/v1/public/bootstrap`) - App-level configuration
2. **Authenticated Bootstrap** (`POST /api/v1/bootstrap`) - User-level startup context

This separation ensures:

- App-level concerns (versions, features, i18n) are independent of authentication
- User-level concerns (identity status, profile) require authentication
- No duplication of data between endpoints
- Clear, deterministic client flow

## Public Bootstrap

**Endpoint**: `GET /api/v1/public/bootstrap`

**Characteristics**:

- Public (no authentication required)
- Cacheable (`Cache-Control: public, max-age=3600`)
- Same response for all callers
- No identity or user-related data

**Returns**:

```json
{
  "updatePolicy": { ... },
  "metadata": { ... },
  "features": { ... },
  "i18n": { ... }
}
```

**MUST NOT**:

- Inspect JWTs
- Return user or identity data
- Perform suspension checks
- Expose secrets or per-user data

**When to call**:

- On app launch, before authentication
- Can be cached for up to 1 hour
- Refresh on app foreground after background

## Authenticated Bootstrap

**Endpoint**: `POST /api/v1/bootstrap`

**Characteristics**:

- Requires valid JWT with USER or ENTITY role
- **MANDATORY first call after login**
- Authoritative gate for app access
- Not cacheable (user status can change)

**Returns** (for ACTIVE user):

```json
{
  "identity": {
    "status": "ACTIVE",
    "roles": ["USER"]
  },
  "profile": {
    "id": "uuid",
    "locale": "en",
    "timezone": "UTC"
  }
}
```

**Returns** (for blocked user):

```json
{
  "identity": {
    "status": "SUSPENDED",
    "recoveryAvailable": true
  }
}
```

**Identity Status Values**:

| Status             | Description                              | Client Action              |
| ------------------ | ---------------------------------------- | -------------------------- |
| `ACTIVE`           | Normal, fully functional account         | Full app access            |
| `SUSPENDED`        | Account is suspended                     | Show suspension message    |
| `DELETED`          | Account permanently deleted (anonymized) | Show deleted message       |
| `PENDING_RECOVERY` | Suspended but recovery is available      | Show recovery option       |
| `PENDING_DELETION` | Deletion requested, grace period active  | Show deletion pending info |

**When to call**:

- Immediately after successful authentication
- Do NOT cache (status can change server-side)

## Client Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APP LAUNCH                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. GET /api/v1/public/bootstrap                                     │
│     → Check updatePolicy (force update?)                             │
│     → Load features, i18n                                            │
│     → Cache for 1 hour                                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. User authenticates (external identity provider)                  │
│     → Obtain JWT                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. POST /api/v1/bootstrap (with JWT)                                │
│     → Check identity.status                                          │
│     → Route to appropriate UI                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  ACTIVE  │   │SUSPENDED │   │ DELETED  │
        │          │   │          │   │          │
        │ → App    │   │ → Show   │   │ → Show   │
        │   Home   │   │   Recov  │   │   Gone   │
        └──────────┘   └──────────┘   └──────────┘
```

## Guards vs Bootstrap

**Authenticated bootstrap is a UX gate, not a security gate.**

- Guards (JwtAuthGuard, RolesGuard) enforce security at every protected endpoint
- Bootstrap provides user status for UI routing decisions
- Even if a client bypasses bootstrap UI, guards will still block suspended/deleted users

## No Duplication Rule

The authenticated bootstrap endpoint MUST NOT return:

- Update policies (use public bootstrap)
- Feature flags (use public bootstrap)
- i18n configuration (use public bootstrap)
- App metadata (use public bootstrap)

This prevents data drift and keeps concerns separated.

## Implementation Notes

### Identity Resolution

The authenticated bootstrap lazily creates an Identity record if one doesn't exist:

```typescript
// Identity is created on first authenticated request
const identity = await identityService.resolveIdentity(jwtSub);
```

### Status Determination

Status is derived from Identity model fields (priority order):

```typescript
if (identity.anonymized) → 'DELETED'           // Final, irreversible
if (identity.deletedAt) → 'PENDING_DELETION'   // Grace period active
if (identity.isSuspended && recoveryAvailable) → 'PENDING_RECOVERY'
if (identity.isSuspended) → 'SUSPENDED'
else → 'ACTIVE'
```

### Recovery Availability

Recovery is checked against GDPR suspension preconditions:

- Backup exists
- Backup not used
- Within recovery window
- Cooldown passed

## Related Documentation

- [TEST_UI_CONTRACT.md](./TEST_UI_CONTRACT.md) - Full API contract
- [AUTH_CONTRACT.md](./AUTH_CONTRACT.md) - Authentication contract
- [create_tables_guideline.md](./create_tables_guideline.md) - Identity ownership model

