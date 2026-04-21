# ADR-001: Authentication Delegation via External Identity Provider (OIDC)

**Status:** Accepted  
**Date:** 2024-12-27

---

## Context

The system serves multiple client types:

- Mobile applications (iOS, Android)
- Web applications (SPA)
- Backend API

Each client requires secure access to protected resources. Authentication must be:

- **Centralized** — one source of truth for user identity
- **Secure** — industry-standard protocols, no custom auth logic
- **Scalable** — support for multiple clients without backend changes
- **Maintainable** — clear separation of concerns
- **Provider-agnostic** — works with any OIDC-compatible identity provider

Building authentication into the backend would create tight coupling, increase security surface area, and duplicate functionality that identity providers solve better.

---

## Decision

**The backend does not authenticate users.**

Authentication is fully delegated to an OIDC-compliant identity provider (e.g., Keycloak, Auth0, Okta, Azure AD):

1. Clients authenticate directly with the identity provider
2. Identity provider issues signed JWT access tokens
3. Clients include tokens in API requests (`Authorization: Bearer <token>`)
4. Backend validates JWT signature, expiration, issuer, and audience
5. Backend extracts claims (`sub`, `roles`) for authorization

The backend's responsibility is **validation only** — it never:

- Issues tokens
- Stores credentials
- Manages sessions
- Redirects users
- Refreshes tokens

---

## Consequences

### Pros

| Benefit                    | Explanation                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| **Security**               | No credentials in backend; IdP handles password policies, MFA, brute-force protection |
| **Simplicity**             | Backend code is minimal — just JWT validation                                         |
| **Scalability**            | Add clients without backend changes; IdP handles all auth flows                       |
| **Standards compliance**   | OIDC/OAuth2 are well-understood, auditable protocols                                  |
| **Separation of concerns** | Auth logic is isolated; backend focuses on business logic                             |
| **Provider flexibility**   | Works with any OIDC provider — no vendor lock-in                                      |

### Cons

| Drawback                      | Mitigation                                                             |
| ----------------------------- | ---------------------------------------------------------------------- |
| **IdP availability required** | IdP must be highly available; tokens remain valid during short outages |
| **External dependency**       | Choose mature, widely deployed, self-hostable providers                |
| **Token size**                | JWTs are larger than session IDs; acceptable for API traffic           |

### Why Token Introspection Is Avoided

Token introspection (RFC 7662) queries the IdP on every request to validate tokens. This approach is rejected because:

- **Latency** — adds network round-trip per request
- **Availability coupling** — backend fails if IdP is unreachable
- **Scalability** — IdP becomes bottleneck under load

Local JWT validation (signature + claims) provides the same security guarantees without these drawbacks. Token revocation is handled via short expiration times.

---

## Rejected Alternatives

### Backend-Managed Authentication

Building auth into the backend (password storage, session management, token issuance).

**Rejected because:**

- Increases security surface area
- Duplicates solved problems
- Requires ongoing security maintenance
- Couples auth logic to business logic

### Token Introspection

Validating tokens by calling the identity provider's introspection endpoint on every request.

**Rejected because:**

- Adds latency to every request
- Creates hard dependency on IdP availability
- Does not scale well under load

### Session-Based Authentication

Using server-side sessions with cookies.

**Rejected because:**

- Does not work well for mobile clients
- Requires sticky sessions or shared session storage
- Adds state to the backend
- Complicates horizontal scaling

---

## References

- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749)
