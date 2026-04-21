/**
 * Rate Limiter Interface
 *
 * Minimal abstraction for rate limiting backends.
 * Implementations can use memory, Redis, or any other storage.
 *
 * Design notes:
 * - Returns boolean for simplicity (allowed or not)
 * - Headers/metadata can be enriched later without breaking API
 * - No Redis-specific logic in interface
 */
export interface RateLimiter {
  /**
   * Attempt to consume a rate limit token.
   *
   * @param params.key - Unique identifier for rate limit bucket (e.g., "ip:192.168.1.1" or "user:uuid")
   * @param params.limit - Maximum requests allowed in the window
   * @param params.windowSeconds - Time window in seconds
   * @returns true if request is allowed, false if rate limit exceeded
   */
  consume(params: { key: string; limit: number; windowSeconds: number }): Promise<boolean>;
}

/**
 * Injection token for RateLimiter.
 */
export const RATE_LIMITER = Symbol('RATE_LIMITER');
