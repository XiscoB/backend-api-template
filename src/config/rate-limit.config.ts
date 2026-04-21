/**
 * Rate Limit Configuration
 *
 * Centralized rate-limit tiers for the entire application.
 * Controllers reference tier names, never raw numbers.
 *
 * Scope:
 * - 'ip'   → IP-based limiting (for public/unauthenticated endpoints)
 * - 'user' → User-based limiting via JWT sub claim (for authenticated endpoints)
 *
 * Defaults:
 * - Public endpoints: rl-public-semi-strict (60 req / 60s)
 * - Authenticated endpoints: rl-auth-semi-strict (120 req / 60s)
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Rate limit scope determines how requests are grouped.
 */
export type RateLimitScope = 'ip' | 'user';

/**
 * Rate limit tier definition.
 */
export interface RateLimitTier {
  /** Human-readable tier name */
  readonly name: string;
  /** Maximum requests allowed within the time window */
  readonly limit: number;
  /** Time window in seconds */
  readonly windowSeconds: number;
  /** Scope: 'ip' for public endpoints, 'user' for authenticated endpoints */
  readonly scope: RateLimitScope;
}

/**
 * All available rate limit tier names.
 */
export type RateLimitTierName =
  | 'rl-public-flexible'
  | 'rl-public-semi-strict'
  | 'rl-public-strict'
  | 'rl-auth-flexible'
  | 'rl-auth-semi-strict'
  | 'rl-auth-strict'
  | 'rl-internal-admin-strict';

// -----------------------------------------------------------------------------
// Tier Definitions
// -----------------------------------------------------------------------------

/**
 * Public (IP-based) rate limit tiers.
 *
 * Use for unauthenticated endpoints like /health, public APIs, etc.
 */
export const PUBLIC_RATE_LIMITS = {
  /**
   * Flexible tier for high-traffic public endpoints.
   * Example: health checks, public status pages.
   */
  'rl-public-flexible': {
    name: 'rl-public-flexible',
    limit: 300,
    windowSeconds: 60,
    scope: 'ip',
  },

  /**
   * Semi-strict tier (DEFAULT for public endpoints).
   * Balanced protection for general public APIs.
   */
  'rl-public-semi-strict': {
    name: 'rl-public-semi-strict',
    limit: 60,
    windowSeconds: 60,
    scope: 'ip',
  },

  /**
   * Strict tier for sensitive public endpoints.
   * Example: public search, rate-sensitive operations.
   */
  'rl-public-strict': {
    name: 'rl-public-strict',
    limit: 20,
    windowSeconds: 60,
    scope: 'ip',
  },
} as const satisfies Record<string, RateLimitTier>;

/**
 * Authenticated (user-based) rate limit tiers.
 *
 * Use for authenticated endpoints. Limits are per-user (JWT sub).
 */
export const AUTH_RATE_LIMITS = {
  /**
   * Flexible tier for high-traffic authenticated endpoints.
   * Example: frequently polled APIs, real-time data.
   */
  'rl-auth-flexible': {
    name: 'rl-auth-flexible',
    limit: 240,
    windowSeconds: 60,
    scope: 'user',
  },

  /**
   * Semi-strict tier (DEFAULT for authenticated endpoints).
   * Balanced protection for general authenticated APIs.
   */
  'rl-auth-semi-strict': {
    name: 'rl-auth-semi-strict',
    limit: 120,
    windowSeconds: 60,
    scope: 'user',
  },

  /**
   * Strict tier for sensitive authenticated endpoints.
   * Example: password changes, account modifications.
   */
  'rl-auth-strict': {
    name: 'rl-auth-strict',
    limit: 30,
    windowSeconds: 60,
    scope: 'user',
  },
} as const satisfies Record<string, RateLimitTier>;

/**
 * Internal admin rate limit tiers.
 *
 * Use for the internal admin console. Strictest limits.
 * No overrides. No shared buckets with public endpoints.
 */
export const INTERNAL_ADMIN_RATE_LIMITS = {
  /**
   * Strictest tier for internal admin console.
   * Very limited: 10 requests per 60 seconds per user.
   * No bulk operations should be possible.
   */
  'rl-internal-admin-strict': {
    name: 'rl-internal-admin-strict',
    limit: 10,
    windowSeconds: 60,
    scope: 'user',
  },
} as const satisfies Record<string, RateLimitTier>;

// -----------------------------------------------------------------------------
// Combined Configuration
// -----------------------------------------------------------------------------

/**
 * All rate limit tiers combined.
 */
export const RATE_LIMIT_TIERS: Record<RateLimitTierName, RateLimitTier> = {
  ...PUBLIC_RATE_LIMITS,
  ...AUTH_RATE_LIMITS,
  ...INTERNAL_ADMIN_RATE_LIMITS,
};

// -----------------------------------------------------------------------------
// Defaults
// -----------------------------------------------------------------------------

/**
 * Default rate limit tier for public (unauthenticated) endpoints.
 */
export const DEFAULT_PUBLIC_TIER: RateLimitTierName = 'rl-public-semi-strict';

/**
 * Default rate limit tier for authenticated endpoints.
 */
export const DEFAULT_AUTH_TIER: RateLimitTierName = 'rl-auth-semi-strict';

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Get a rate limit tier by name.
 *
 * @param tierName - The tier name to look up
 * @returns The rate limit tier configuration
 * @throws Error if tier name is not found
 */
export function getRateLimitTier(tierName: RateLimitTierName): RateLimitTier {
  const tier = RATE_LIMIT_TIERS[tierName];
  if (!tier) {
    throw new Error(`Unknown rate limit tier: ${tierName}`);
  }
  return tier;
}

/**
 * Get the default tier for a given scope.
 *
 * @param scope - 'ip' for public, 'user' for authenticated
 * @returns The default tier for the scope
 */
export function getDefaultTier(scope: RateLimitScope): RateLimitTier {
  return scope === 'ip'
    ? RATE_LIMIT_TIERS[DEFAULT_PUBLIC_TIER]
    : RATE_LIMIT_TIERS[DEFAULT_AUTH_TIER];
}
