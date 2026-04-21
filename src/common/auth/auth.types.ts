import { AppRole } from '../constants/roles';

/**
 * JWT payload structure.
 *
 * This represents the expected structure of JWTs issued by any OIDC-compatible
 * identity provider. Supports multiple providers including Supabase, Auth0,
 * Keycloak, Okta, and Azure AD.
 *
 * @see docs/canonical/AUTH_CONTRACT.md for the full authentication contract.
 */
export interface JwtPayload {
  /** Subject - unique user identifier (used as primary key) */
  sub: string;

  /** User email address (optional) */
  email?: string;

  /** Issuer - identity provider URL (must match JWT_ISSUER env var) */
  iss?: string;

  /** Audience - must include JWT_AUDIENCE env var */
  aud?: string | string[];

  /** Expiration time (Unix timestamp) */
  exp?: number;

  /** Issued at (Unix timestamp) */
  iat?: number;

  /**
   * Realm-level roles for authorization (Keycloak pattern).
   */
  realm_access?: {
    roles: string[];
  };

  /**
   * App metadata containing roles (Supabase/Auth0 pattern).
   * In Supabase, roles are typically stored in app_metadata via JWT hooks.
   *
   * For internal admin console:
   * - internal_admin: boolean - Grants admin console access
   * - internal_admin_level: 'read' | 'write' - Controls privilege level
   */
  app_metadata?: {
    roles?: string[];
    internal_admin?: boolean;
    internal_admin_level?: 'read' | 'write';
    [key: string]: unknown;
  };

  /**
   * User metadata (Supabase pattern).
   * Alternative location for custom claims.
   */
  user_metadata?: {
    roles?: string[];
    [key: string]: unknown;
  };

  /**
   * Direct roles claim (generic OIDC pattern).
   * Some providers put roles directly in the token.
   */
  roles?: string[];

  /**
   * Supabase role claim.
   * Indicates the authentication state (e.g., "authenticated", "anon").
   * Note: This is NOT used for authorization — use app_metadata.roles instead.
   */
  role?: string;

  /**
   * Client/resource-level roles (Keycloak pattern).
   * Note: Backend only uses realm_access.roles — client roles are ignored.
   */
  resource_access?: {
    [clientId: string]: {
      roles: string[];
    };
  };

  /** Preferred username (optional) */
  preferred_username?: string;

  /** Full name (optional) */
  name?: string;

  /** Given name (optional) */
  given_name?: string;

  /** Family name (optional) */
  family_name?: string;

  /** Phone number (optional, Supabase includes this) */
  phone?: string;

  /** Authentication method reference (optional) */
  amr?: string[];

  /** Session ID (optional, Supabase includes this) */
  session_id?: string;
}

/**
 * Authenticated user attached to requests after JWT validation.
 *
 * Access via @CurrentUser() decorator or request.user.
 *
 * @property id - Always present (from JWT 'sub' claim) — single source of truth
 * @property email - Optional (may not be present in all tokens)
 * @property roles - Filtered to only recognized AppRole values
 * @property internal_admin - Supabase: Grants internal admin console access
 * @property internal_admin_level - Supabase: 'read' or 'write' privilege
 *
 * This interface is provider-agnostic. The same AuthenticatedUser is returned
 * regardless of whether the token came from Supabase, Auth0, Keycloak, etc.
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */
export interface AuthenticatedUser {
  /** Unique user identifier (from JWT 'sub' claim) */
  id: string;

  /** User email address (optional) */
  email?: string;

  /** User roles (filtered from provider-specific claims) */
  roles: AppRole[];

  /** Internal admin console access (Supabase app_metadata) */
  internal_admin?: boolean;

  /** Internal admin privilege level (Supabase app_metadata) */
  internal_admin_level?: 'read' | 'write';
}
