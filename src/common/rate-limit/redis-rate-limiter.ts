import { Injectable, Logger } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.interface';
import { RedisService } from '../../infrastructure/redis/redis.service';

/**
 * Redis Rate Limiter
 *
 * Distributed rate limiting using Redis atomic counters.
 *
 * Algorithm: Fixed Window Counter
 * - Uses INCR to atomically increment counter
 * - Sets TTL on first request in window
 * - Counter auto-expires when TTL elapses
 *
 * Design notes:
 * - Atomic: INCR is atomic in Redis, safe under concurrency
 * - TTL-based: Windows expire automatically
 * - Distributed: Shared across all app instances
 * - Deterministic: Same key = same counter regardless of instance
 *
 * When to use Redis over Memory:
 * - Multiple app instances (horizontal scaling)
 * - Rate limits must be consistent across replicas
 * - Production deployments with load balancing
 *
 * Trade-offs vs Memory:
 * - ✅ Shared state across instances
 * - ✅ Survives app restarts
 * - ⚠️ Network latency (usually <1ms)
 * - ⚠️ Requires Redis infrastructure
 */
@Injectable()
export class RedisRateLimiter implements RateLimiter {
  private readonly logger = new Logger(RedisRateLimiter.name);
  private static readonly FEATURE_PREFIX = 'ratelimit';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Attempt to consume a rate limit token.
   *
   * Uses Redis INCR + EXPIRE for atomic counter with TTL.
   *
   * @param params.key - Unique identifier for rate limit bucket
   * @param params.limit - Maximum requests allowed in the window
   * @param params.windowSeconds - Time window in seconds
   * @returns true if request is allowed, false if rate limit exceeded
   */
  async consume(params: { key: string; limit: number; windowSeconds: number }): Promise<boolean> {
    const { key, limit, windowSeconds } = params;
    const client = this.redisService.getClient();

    // Build namespaced key
    const redisKey = this.redisService.buildKey(RedisRateLimiter.FEATURE_PREFIX, key);

    try {
      // Atomic increment
      const count = await client.incr(redisKey);

      // Set TTL on first request in window
      if (count === 1) {
        await client.expire(redisKey, windowSeconds);
      }

      // Check limit
      if (count > limit) {
        this.logger.debug(`Rate limit exceeded: key=${key}, count=${count}, limit=${limit}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Redis rate limit error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async probe(): Promise<void> {
    const client = this.redisService.getClient();
    await client.ping();
  }
}
