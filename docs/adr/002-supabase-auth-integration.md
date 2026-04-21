# ADR-002: Supabase Auth Integration

**Status:** Accepted  
**Date:** 2024-12-30  
**Supersedes:** ADR-001 (partially — removes Keycloak-specific examples)

---

## Context

The project requires authentication via an external identity provider. After evaluating options, **Supabase Auth** was selected as the primary identity provider for the following reasons:

- **Managed service** — no infrastructure to maintain
- **Magic link authentication** — passwordless by default
- **Social login support** — Google, Apple, Facebook ready
- **Multi-device support** — built-in session management
- **PostgreSQL integration** — aligns with our database choice
- **JWT-based** — standard tokens that work with our validation approach

The backend must continue to validate JWTs without any provider-specific code, maintaining template neutrality for future projects that may use different providers.

---

## Decision

**Integrate Supabase Auth as the primary identity provider while maintaining provider-agnostic backend code.**

### Token Validation

Supabase JWTs use HS256 (symmetric) by default. The backend now supports both:

1. **HS256** with `JWT_SECRET` (Supabase default)
2. **RS256** with `JWT_JWKS_URI` or `JWT_PUBLIC_KEY` (other providers)

### Role Extraction

Supabase does not include custom roles by default. The backend extracts roles from multiple claim locations in priority order:

1. `app_metadata.roles` — Supabase/Auth0 pattern
2. `user_metadata.roles` — Alternative Supabase pattern
3. `realm_access.roles` — Keycloak pattern
4. `roles` — Generic OIDC pattern

This allows the backend to work with any provider without code changes.

### Supabase Configuration

```env
JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
JWT_AUDIENCE=authenticated
JWT_ALGORITHM=HS256
JWT_SECRET=<supabase-jwt-secret>
```

### Adding Roles to Supabase Tokens

Custom roles must be added via Supabase JWT hooks (Database Functions):

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_roles text[];
BEGIN
  claims := event->'claims';

  SELECT array_agg(role) INTO user_roles
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := jsonb_set(
    claims,
    '{app_metadata, roles}',
    to_jsonb(COALESCE(user_roles, ARRAY['USER']))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

---

## Consequences

### Pros

| Benefit                    | Explanation                                                  |
| -------------------------- | ------------------------------------------------------------ |
| **Passwordless default**   | Magic links reduce security risks from weak passwords        |
| **Managed infrastructure** | No Keycloak/Auth0 server to deploy and maintain              |
| **PostgreSQL synergy**     | User data lives alongside application data                   |
| **Multi-provider roles**   | Backend works with Supabase, Auth0, Keycloak without changes |
| **HS256 support**          | Simpler secret-based validation for development              |

### Cons

| Drawback                | Mitigation                                              |
| ----------------------- | ------------------------------------------------------- |
| **Custom role setup**   | Requires JWT hook; documented in AUTH_CONTRACT.md       |
| **Supabase dependency** | Backend remains provider-agnostic; can switch providers |
| **HS256 in production** | Can use JWKS endpoint for RS256 if key rotation needed  |

---

## What Changed

### Configuration

| Before                                      | After                                             |
| ------------------------------------------- | ------------------------------------------------- |
| `JWT_PUBLIC_KEY` or `JWT_JWKS_URI` required | `JWT_SECRET`, `JWT_PUBLIC_KEY`, or `JWT_JWKS_URI` |
| RS256 only                                  | RS256 or HS256 (via `JWT_ALGORITHM`)              |

### Role Extraction

| Before                    | After                                              |
| ------------------------- | -------------------------------------------------- |
| `realm_access.roles` only | Multiple claim locations checked in priority order |

### Files Modified

- `src/config/app-config.validation.ts` — Added JWT_SECRET and JWT_ALGORITHM
- `src/config/app-config.service.ts` — Added secret/algorithm getters
- `src/common/auth/jwt.strategy.ts` — Support HS256 and multi-location roles
- `src/common/auth/auth.types.ts` — Extended JwtPayload for all providers
- `.env.example`, `.env.docker.example` — Supabase configuration examples
- `docs/AUTH_CONTRACT.md` — Supabase integration guide

---

## Explicitly NOT Changed

The following remain unchanged to preserve template neutrality:

- Authorization logic (guards, decorators, roles)
- User model pattern (sub as primary key)
- Lazy user creation pattern
- No backend calls to identity provider APIs
- No session storage
- No token refresh logic

---

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JWT Hooks](https://supabase.com/docs/guides/auth/jwts)
- [ADR-001: Authentication Delegation](./001-authentication-delegation.md)
