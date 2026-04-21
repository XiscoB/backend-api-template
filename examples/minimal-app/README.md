# Minimal Example App

Smoke harness and reference contract for the backend API template.

This is not a demo. This is not a tutorial. This is not a product.

---

## Purpose

This example exists to:

- Validate correct wiring of authentication and guards
- Document the identity context contract
- Serve as a compile-time sanity check
- Provide a reference for future implementers

This example survives:

- Auth provider replacement
- Role source changes
- Database replacement

---

## Endpoint

```
GET /whoami
```

**Requires**: Valid JWT with `USER` role

**Returns**:

```json
{
  "identityId": "uuid-v4",
  "roles": ["USER"]
}
```

**Note**: This endpoint uses `/whoami` without a version prefix (`/v1/`) as an example-only simplification. Production endpoints follow versioned patterns (e.g., `/v1/profiles/me`).

---

## Identity Resolution

Identity is resolved **at the auth pipeline level**, not in controllers or services.

| Stage               | What Happens                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| JWT arrives         | `JwtAuthGuard` validates signature, issuer, audience, expiration        |
| Claims extracted    | Pipeline extracts `sub`, normalizes roles from provider-specific claims |
| Identity resolved   | Pipeline maps JWT `sub` (external) → `identityId` (internal UUID)       |
| Controller executes | `@CurrentUser()` provides normalized identity context                   |

**Key invariants**:

- Controllers receive `identityId` (internal UUID), never raw JWT `sub`
- Identity is created lazily on first authenticated request
- Repeated requests with the same `sub` resolve to the same `identityId`
- `identityId` is the ownership root for all domain data

---

## @CurrentUser() Contract

The `@CurrentUser()` decorator returns a **normalized identity context**, not raw JWT claims.

```typescript
interface AuthenticatedUser {
  id: string; // Internal identityId (UUID)
  roles: AppRole[]; // Canonical roles (USER, ENTITY, ADMIN, SYSTEM)
  email?: string; // Optional, if present in token
}
```

**What it provides**:

- `id`: Internal `identityId` (UUID), resolved from JWT `sub` by the pipeline
- `roles`: Filtered canonical `AppRole` values only
- `email`: Passthrough from JWT (if present)

**What it does NOT provide**:

- Raw JWT `sub` claim
- Provider-specific metadata
- Unfiltered role strings

---

## JWT Requirements

### Required Claims

| Claim | Description                                                |
| ----- | ---------------------------------------------------------- |
| `sub` | External user identifier (mapped to internal `identityId`) |
| `iss` | Issuer URL (must match `JWT_ISSUER` env var)               |
| `aud` | Audience (must include `JWT_AUDIENCE` env var)             |
| `exp` | Expiration timestamp (Unix seconds)                        |

### Optional Claims

| Claim   | Description        |
| ------- | ------------------ |
| `email` | User email address |

### Role Claim Locations

Roles are extracted from the first non-empty source (priority order):

1. `app_metadata.roles` — Array of role strings
2. `user_metadata.roles` — Array of role strings
3. `realm_access.roles` — Array of role strings
4. `roles` — Array of role strings (top-level)

Only recognized `AppRole` values are retained. Unknown roles are silently discarded.

---

## Sample JWT Payload

```json
{
  "sub": "external-user-id-123",
  "iss": "https://your-idp.example.com",
  "aud": "your-audience",
  "exp": 1893456000,
  "email": "user@example.com",
  "app_metadata": {
    "roles": ["USER"]
  }
}
```

This payload is **unsigned and for documentation only**.

Do not use this to generate real tokens. Token issuance is the responsibility of your identity provider.

---

## Supported Algorithms

| Key Variable     | Algorithm                        |
| ---------------- | -------------------------------- |
| `JWT_SECRET`     | HS256 (symmetric)                |
| `JWT_PUBLIC_KEY` | RS256 (asymmetric, static key)   |
| `JWT_JWKS_URI`   | RS256 (asymmetric, key rotation) |

Provide exactly one. Algorithm is inferred from configuration.

---

## Guard Enforcement

Global guards are applied in order:

1. **JwtAuthGuard** — Validates JWT signature, issuer, audience
2. **IdentityStatusGuard** — Blocks banned, deleted, suspended identities

Role enforcement is applied via decorators:

- `@RequireRole(AppRole.ADMIN)` — Single role required
- `@RequireAnyRole(AppRole.USER, AppRole.ENTITY)` — Any listed role sufficient

---

## Integration

To test this example in the main application:

```typescript
// app.module.ts
import { WhoamiModule } from '../examples/minimal-app/src/whoami/whoami.module';

@Module({
  imports: [
    // ... other modules
    WhoamiModule,
  ],
})
export class AppModule {}
```

---

## What This Example Does NOT Do

- Issue JWTs
- Store credentials
- Authenticate users (that's the identity provider's job)
- Contain business logic
- Access database directly
- Include provider-specific logic
- Reference real provider URLs

---

## Canonical Roles

```typescript
enum AppRole {
  USER = 'USER', // Standard authenticated user
  ENTITY = 'ENTITY', // Organization or business entity
  ADMIN = 'ADMIN', // Administrative user
  SYSTEM = 'SYSTEM', // Service-to-service calls
}
```

Do not introduce new roles in this example.

---

## File Structure

```
examples/minimal-app/
├── .env.example          # Environment variable documentation
├── README.md             # This file
└── src/
    └── whoami/
        ├── whoami.controller.ts  # Single protected endpoint
        └── whoami.module.ts      # Module wiring
```
