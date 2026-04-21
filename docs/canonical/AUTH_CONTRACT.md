> Documentation Layer: Canonical Contract

# Authentication & Authorization Contract

This document defines the **immutable contract** between the backend API and external identity providers.

> ⚠️ **This is a baseline template document.** When cloning this repository, update provider-specific examples to match your identity provider configuration.

---

## Overview

| Aspect           | Responsibility                               |
| ---------------- | -------------------------------------------- |
| Authentication   | External identity provider (OIDC-compatible) |
| Token issuance   | External identity provider                   |
| Token refresh    | Client applications                          |
| Token validation | **This backend**                             |
| Authorization    | **This backend**                             |

**Supported Identity Providers:**

- Supabase (recommended)
- Auth0
- Okta
- Azure AD
- AWS Cognito
- Keycloak
- Any OIDC-compatible provider

---

## Backend Responsibilities

### What the Backend Does

- ✅ Validates JWT signatures (RS256 or HS256)
- ✅ Validates token expiration (`exp` claim)
- ✅ Validates issuer (`iss` must match `JWT_ISSUER` env var)
- ✅ Validates audience (`aud` must include `JWT_AUDIENCE` env var)
- ✅ Extracts claims for authorization (`sub`, roles from various claim locations)
- ✅ Lazily creates user records based on JWT `sub`

### What the Backend Does NOT Do

- ❌ Issue tokens
- ❌ Store passwords or credentials
- ❌ Manage sessions
- ❌ Send password reset emails (handled by Identity Provider)
- ❌ Redirect users for authentication
- ❌ Refresh tokens
- ❌ Implement OAuth/OIDC flows
- ❌ Call identity provider APIs

---

## JWT Contract

### Required Structure

```typescript
interface JwtPayload {
  // Required claims
  sub: string; // User identifier — single source of truth
  iss: string; // Issuer URL — must match JWT_ISSUER
  aud: string | string[]; // Audience — must include JWT_AUDIENCE
  exp: number; // Expiration (Unix timestamp)

  // Optional claims
  email?: string; // User email address
  iat?: number; // Issued at (Unix timestamp)

  // Role claims (provider-specific, checked in priority order)
  app_metadata?: {
    roles?: string[]; // Supabase/Auth0 pattern
  };
  user_metadata?: {
    roles?: string[]; // Alternative Supabase pattern
  };
  realm_access?: {
    roles: string[]; // Keycloak pattern
  };
  roles?: string[]; // Generic OIDC pattern
}
```

### Validation Rules

| Claim | Validation                                      |
| ----- | ----------------------------------------------- |
| `sub` | Must be present; used as primary key            |
| `iss` | Must exactly match `JWT_ISSUER` environment var |
| `aud` | Must include `JWT_AUDIENCE` environment var     |
| `exp` | Must be in the future (not expired)             |

### Example JWT Payloads

#### Supabase Token

```json
{
  "iss": "https://your-project.supabase.co/auth/v1",
  "aud": "authenticated",
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "exp": 1735344000,
  "iat": 1735340400,
  "email": "user@example.com",
  "role": "authenticated",
  "app_metadata": {
    "roles": ["USER", "ENTITY"]
  }
}
```

#### Generic OIDC Token

```json
{
  "iss": "https://auth.example.com",
  "aud": ["backend-api", "mobile-app"],
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "exp": 1735344000,
  "iat": 1735340400,
  "email": "user@example.com",
  "roles": ["USER", "ENTITY"]
}
```

````

---

## Identity Management

### User Identity

- **`sub` claim is the single source of truth** for user identity
- `sub` is used as the database primary key for user records
- Backend may lazily create user records on first authenticated request
- No duplicate user records — `sub` is unique and immutable

### Lazy User Creation Pattern

When a valid JWT is received:

1. Extract `sub` from token
2. Look up user by `id = sub`
3. If user exists, return user
4. If user does not exist, create user with `id = sub`
5. Return user

This pattern ensures:

- Users are created automatically on first API access
- No separate registration flow required in backend
- User data syncs from identity provider via token claims

---

## Canonical Roles

These roles are part of the **stable API contract**. Do not modify without explicit approval.

| Role     | Purpose                           | Typical Use Case                        |
| -------- | --------------------------------- | --------------------------------------- |
| `USER`   | Standard authenticated user       | End-users, individual accounts          |
| `ENTITY` | Organization or business entity   | Company accounts, organizational access |
| `ADMIN`  | Administrative user               | Platform administrators                 |
| `SYSTEM` | Internal service-to-service calls | Backend services, automated processes   |

### Role Extraction (Provider-Agnostic)

The backend extracts roles from JWT claims in the following priority order:

1. `app_metadata.roles` — Supabase/Auth0 pattern
2. `user_metadata.roles` — Alternative Supabase pattern
3. `realm_access.roles` — Keycloak pattern
4. `roles` — Generic OIDC pattern

**Important:** The backend does NOT use Supabase's `role` claim (e.g., `"authenticated"`) for authorization. Roles must be explicitly set in `app_metadata.roles` via Supabase JWT hooks.

### Role Rules

1. Roles are extracted from the first matching claim location
2. Unrecognized roles are **silently ignored** (no errors)
3. Role comparison is **case-sensitive** (`USER` ≠ `user`)
4. Users may have **multiple roles** simultaneously
5. **Authorization is internal** — do not rely on identity provider role management

### Role Usage in Code

```typescript
// Require specific role
@Roles(AppRole.ADMIN)
@Get('admin-endpoint')
adminOnly() { }

// Require any of multiple roles
@Roles(AppRole.ADMIN, AppRole.SYSTEM)
@Get('admin-or-system')
adminOrSystem() { }

// No role restriction (authentication only)
@Get('any-authenticated-user')
anyUser() { }

// Public endpoint (no authentication)
@Public()
@Get('public')
publicEndpoint() { }
````

---

## Supabase Integration

### Configuration

```env
JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
JWT_AUDIENCE=authenticated
JWT_ALGORITHM=HS256
JWT_SECRET=<your-supabase-jwt-secret>
```

### Setting Up Roles in Supabase

Supabase does not include custom roles by default. To add roles to JWT tokens:

1. Create a **JWT hook** in Supabase (Database > Hooks)
2. The hook should add roles to `app_metadata`:

```sql
-- Example: Add roles based on a user_roles table
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_roles text[];
BEGIN
  claims := event->'claims';

  -- Fetch roles from your roles table
  SELECT array_agg(role) INTO user_roles
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid;

  -- Add roles to app_metadata
  claims := jsonb_set(
    claims,
    '{app_metadata, roles}',
    to_jsonb(COALESCE(user_roles, ARRAY['USER']))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

### Supabase Token Characteristics

| Characteristic | Value                                   |
| -------------- | --------------------------------------- |
| Algorithm      | HS256 (symmetric)                       |
| Issuer         | `https://<project>.supabase.co/auth/v1` |
| Audience       | `authenticated`                         |
| User ID        | `sub` claim (UUID)                      |
| Email          | `email` claim                           |
| Roles location | `app_metadata.roles`                    |

---

## Environment Configuration

### Required Variables

| Variable       | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| `JWT_ISSUER`   | Token issuer URL (e.g., `https://<project>.supabase.co/auth/v1`) |
| `JWT_AUDIENCE` | Expected audience claim (e.g., `authenticated` for Supabase)     |

### Key Configuration (one required)

| Variable         | Algorithm | Description                             |
| ---------------- | --------- | --------------------------------------- |
| `JWT_SECRET`     | HS256     | Symmetric secret (Supabase default)     |
| `JWT_PUBLIC_KEY` | RS256     | Static public key in PEM format         |
| `JWT_JWKS_URI`   | RS256     | JWKS endpoint for dynamic key retrieval |

### Algorithm Configuration

| Variable        | Default | Options          |
| --------------- | ------- | ---------------- |
| `JWT_ALGORITHM` | RS256   | `RS256`, `HS256` |

### Configuration Priority

1. If `JWT_SECRET` is set with `JWT_ALGORITHM=HS256`, use symmetric validation
2. If `JWT_PUBLIC_KEY` is set, use static key validation (RS256)
3. If `JWT_JWKS_URI` is set, use JWKS dynamic key retrieval (RS256)
4. If none are set, application fails to start

### Production Recommendations

**For Supabase:**

- Use `JWT_SECRET` with `JWT_ALGORITHM=HS256` (simplest)
- Or use `JWT_JWKS_URI` with `JWT_ALGORITHM=RS256` for key rotation support

**For other providers:**

- Use `JWT_JWKS_URI` for automatic key rotation
- No deployment required when keys change

---

## Security Considerations

### Token Validation

- All tokens are validated locally (no introspection calls)
- Signature validation uses RS256 (asymmetric) or HS256 (symmetric)
- Token expiration is enforced strictly
- Invalid tokens result in 401 Unauthorized

### Why No Token Introspection

| Introspection Approach         | Local Validation Approach        |
| ------------------------------ | -------------------------------- |
| Network call per request       | No external calls                |
| IdP is single point of failure | Tokens valid during IdP downtime |
| Added latency                  | Minimal latency                  |
| Scalability bottleneck         | Horizontally scalable            |

### Token Revocation

- Handled via short token expiration times
- Clients refresh tokens before expiration
- Backend does not maintain revocation lists

---

## Client Responsibilities

Clients (mobile apps, web apps, other services) must:

1. **Authenticate with identity provider** (not the backend)
2. **Obtain access tokens** from identity provider
3. **Include tokens** in API requests: `Authorization: Bearer <token>`
4. **Refresh tokens** before expiration (identity provider flow)
5. **Handle 401 responses** by refreshing tokens or re-authenticating

---

## Identity Status

The backend maintains identity status as the **single source of truth** for access control. A valid JWT is necessary but not sufficient for access.

### Status Types

| Status             | Description                                 | Recoverable | User Action      |
| ------------------ | ------------------------------------------- | ----------- | ---------------- |
| `ACTIVE`           | Normal, fully functional account            | N/A         | Full access      |
| `BANNED`           | Permanently banned (abuse/policy violation) | ❌ No       | None - permanent |
| `SUSPENDED`        | Account suspended (Right to Restriction)    | ✅ Yes      | Can recover      |
| `PENDING_RECOVERY` | Suspended but recovery is available         | ✅ Yes      | Can recover      |
| `PENDING_DELETION` | Deletion requested, in grace period         | ✅ Yes      | Can cancel       |
| `DELETED`          | Account permanently deleted (anonymized)    | ❌ No       | None - final     |

### Status Priority (Highest First)

1. `BANNED` - Administrative, permanent, irreversible
2. `DELETED` - Anonymized, final
3. `PENDING_DELETION` - Grace period active
4. `SUSPENDED` / `PENDING_RECOVERY` - Temporary restriction
5. `ACTIVE` - Normal access

### Enforcement

- **Bootstrap**: Returns identity status - client must check and handle
- **Protected Endpoints**: `IdentityStatusGuard` blocks BANNED/DELETED/PENDING_DELETION automatically
- **SUSPENDED users**: Blocked by default, use `@AllowSuspended()` to allow specific endpoints
- **Re-authentication**: Does NOT restore access for blocked statuses

### BANNED Status Details

BANNED is distinct from other statuses:

- **Administrative only**: Set by admins, not user-initiated
- **Permanent**: No recovery flow, no grace period
- **Immediate**: Blocks all access upon next request
- **No data deletion**: Identity and data remain (unlike DELETED)

---

## Failure Responses

| HTTP Status | Condition                                     |
| ----------- | --------------------------------------------- |
| 401         | Missing, expired, or invalid token            |
| 403         | Valid token but insufficient role permissions |

### 401 Unauthorized Response

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden Response

```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

---

## Template Neutrality

This contract is designed to work with **any OIDC-compatible identity provider**:

- **Supabase** (recommended)
- Auth0
- Okta
- Azure AD
- AWS Cognito
- Keycloak
- Google Identity Platform

No provider-specific code or configuration should exist in the backend. All provider-specific values are externalized via environment variables.

