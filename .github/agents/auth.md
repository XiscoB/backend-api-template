# Authentication & Authorization

> **Scope**: JWT validation, identity model, roles, authorization guards.  
> **Parent**: [agents.md](../agents.md)

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## Architectural Boundaries

The following are outside the scope of this backend:

| Excluded responsibility               | Reason                                     |
| ------------------------------------- | ------------------------------------------ |
| Issue JWTs or tokens                  | Identity provider responsibility           |
| Store passwords or credentials        | Identity provider responsibility           |
| Implement OAuth/OIDC flows            | Identity provider responsibility           |
| Hardcode issuer URLs or realm names   | Must be environment-configurable           |
| Add login/logout/register endpoints   | Identity provider responsibility           |
| Implement token refresh               | Client + identity provider responsibility  |
| Store auth-related fields in database | Backend only validates, never manages auth |
| Add new roles                         | Roles are part of the stable API contract  |
| Assume a specific identity provider   | Template works with any OIDC provider      |
| Add identity provider-specific code   | Backend remains provider-agnostic          |

---

## Authentication

- The backend **never issues tokens**
- The backend **never stores passwords**
- The backend **only validates JWTs**
- The backend **does NOT refresh tokens** — clients handle this
- The backend **never calls identity provider APIs**

---

## JWT Contract

The backend expects JWTs with this structure:

```ts
{
  sub: string;              // User ID — single source of truth
  iss: string;              // Issuer URL — must match JWT_ISSUER env var
  aud: string | string[];   // Audience — must include JWT_AUDIENCE env var
  exp: number;              // Expiration timestamp
  email?: string;           // Optional user email

  // Role claims (checked in priority order)
  app_metadata?: {
    roles?: string[];       // Supabase/Auth0 pattern
  };
  user_metadata?: {
    roles?: string[];       // Alternative Supabase pattern
  };
  realm_access?: {
    roles: string[];        // Keycloak pattern
  };
  roles?: string[];         // Generic OIDC pattern
}
```

### Identity Rules

- `sub` is the **single source of truth** for user identity at request boundaries
- **JWT `sub` MUST NOT be stored directly in domain tables**
- Backend may **lazily create** Identity records based on `sub`
- JWT issuer is **fully configurable** via environment variables
- **No provider-specific assumptions** in code (works with Supabase, Auth0, Keycloak, etc.)

---

## Canonical Roles (DO NOT CHANGE)

These roles are part of the stable API contract:

| Role     | Purpose                           |
| -------- | --------------------------------- |
| `USER`   | Standard authenticated user       |
| `ENTITY` | Organization or business entity   |
| `ADMIN`  | Administrative user               |
| `SYSTEM` | Internal service-to-service calls |

Constraints:

- Roles are extracted from the first matching claim location (provider-agnostic)
- Unrecognized roles are **silently ignored** (not errors)
- The canonical role set is fixed and part of the stable API contract
- **Authorization is internal** — the backend does not rely on identity provider role management

---

## Authorization

- Authorization is based on **JWT claims**
- Guards enforce access using `@Roles()` decorator
- Controllers remain thin — no auth logic in controllers

## Authorization Model

- Authentication establishes the baseline access level for authenticated requests.
- Baseline authenticated access is USER-level access.
- USER is implicit for authenticated actors and is not stored as an explicit role.
- Roles represent elevated privileges above baseline access only.
- Elevated roles are explicitly represented and validated as ADMIN, ENTITY, and SYSTEM.
- Guards enforce elevated roles only; they do not redefine baseline authenticated access.
- Authorization decisions are made internally by the backend.
- Role enforcement is internal and independent of provider-side role management.
- The model remains provider-agnostic across OIDC-compatible identity providers.

---

## Identity & Ownership Model

### Identity Anchor

All domain ownership flows through the **Identity** model, which serves as the bridge between external authentication and internal data.

**Core Principle**: External authentication is the single source of truth, but domain tables must never directly reference JWT `sub`.

### Canonical Identity Model

```prisma
model Identity {
  id             String    @id @default(uuid())
  externalUserId String    @unique   // Maps to JWT `sub`

  deletedAt      DateTime?           // Deletion requested (grace period)
  anonymized     Boolean   @default(false)
  isSuspended    Boolean   @default(false)
  isFlagged      Boolean   @default(false)
  lastActivity   DateTime?

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

### Identity Rules

- **Identity is the ownership root** for all domain data
- Domain tables reference `identityId` (never `externalUserId` directly)
- Profile is a representation layer, not an ownership anchor
- SYSTEM actors must also be represented as Identity rows
- JWT `sub` is only used at request boundaries for lookup
- Identity records are created lazily on first authenticated request

### Access Blocking via Identity State

Authentication success does not imply authorization.

Access is blocked when any of these conditions are true:

- `anonymized = true` → DELETED (permanent)
- `deletedAt != null` → PENDING_DELETION (grace period)
- `isSuspended = true` → SUSPENDED

The `BootstrapService` checks these conditions on every authenticated request.
Auth providers are NEVER used for blocking — backend is authoritative.

See [GDPR & Data Governance](gdpr.md) for deletion lifecycle details.

### Why This Matters

This design ensures:

- Auth provider changes don't require domain data migration
- Internal user IDs remain stable across auth system changes
- Privacy features (anonymization, suspension) are centralized
- Domain logic is decoupled from external identity systems

---

## Environment Variables

### Required Variables

| Variable       | Required | Description                          |
| -------------- | -------- | ------------------------------------ |
| `JWT_ISSUER`   | Yes      | Token issuer URL (identity provider) |
| `JWT_AUDIENCE` | Yes      | Expected audience claim              |

### Key Configuration (one required)

| Variable         | Algorithm | Description                             |
| ---------------- | --------- | --------------------------------------- |
| `JWT_SECRET`     | HS256     | Symmetric secret (Supabase default)     |
| `JWT_PUBLIC_KEY` | RS256     | Static public key (PEM format)          |
| `JWT_JWKS_URI`   | RS256     | JWKS endpoint for dynamic key retrieval |

### Optional Variables

| Variable        | Default | Description                    |
| --------------- | ------- | ------------------------------ |
| `JWT_ALGORITHM` | `RS256` | JWT algorithm (RS256 or HS256) |

Constraints:

- All required variables are validated at startup
- Application **fails fast** if configuration is invalid
- No defaults for security-critical values

---

## Reference Endpoints

### `GET /api/v1/profiles/me`

- Requires valid JWT
- Extracts `sub` from token
- Looks up Identity by `externalUserId`
- Creates Identity and Profile if not exists (lazy creation)
- Returns profile via DTO

This endpoint is the **reference implementation** for authenticated endpoints.
