import { Injectable } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.interface';

/**
 * Rate limit bucket entry.
 */
interface RateLimitBucket {
  /** Current request count in the window */
  count: number;
  /** Window expiration timestamp (epoch ms) */
  expiresAt: number;
}

interface MemoryRateLimiterOptions {
  maxEntries: number;
  minimumTtlSeconds: number;
}

/**
 * In-Memory Rate Limiter
 *
 * Per-process, TTL-based rate limiting using a simple Map.
 *
 * Design notes:
 * - Safe under concurrent requests (synchronous counter updates in Node.js)
 * - Auto-cleans expired entries on access
 * - Suitable for single-instance deployments or development
 * - Does NOT share state across processes/replicas
 *
 * For distributed rate limiting, use RedisRateLimiter.
 */
@Injectable()
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly maxEntries: number;
  private readonly minimumTtlSeconds: number;

  constructor(options?: Partial<MemoryRateLimiterOptions>) {
    this.maxEntries = options?.maxEntries ?? 10000;
    this.minimumTtlSeconds = options?.minimumTtlSeconds ?? 60;
  }

  /**
   * Attempt to consume a rate limit token.
   *
   * Algorithm:
   * 1. Get or create bucket for key
   * 2. If bucket expired, reset it
   * 3. If count < limit, increment and allow
   * 4. Otherwise, deny
   */
  consume(params: { key: string; limit: number; windowSeconds: number }): Promise<boolean> {
    const { key, limit, windowSeconds } = params;
    const now = Date.now();
    const effectiveWindowSeconds = Math.max(windowSeconds, this.minimumTtlSeconds);
    const windowMs = effectiveWindowSeconds * 1000;

    this.cleanupExpired(now);

    let bucket = this.buckets.get(key);

    // Create new bucket or reset expired bucket
    if (!bucket || bucket.expiresAt <= now) {
      this.ensureCapacity(now);
      bucket = {
        count: 0,
        expiresAt: now + windowMs,
      };
      this.buckets.set(key, bucket);
    }

    // Check limit
    if (bucket.count >= limit) {
      return Promise.resolve(false); // Rate limit exceeded
    }

    // Consume token
    bucket.count++;
    return Promise.resolve(true);
  }

  /**
   * Clean up expired entries.
   *
   * Call periodically to prevent memory leaks in long-running processes.
   * Optional - entries are also cleaned on access.
   */
  cleanup(): void {
    this.cleanupExpired(Date.now());
  }

  private cleanupExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  private ensureCapacity(now: number): void {
    if (this.buckets.size < this.maxEntries) {
      return;
    }

    this.cleanupExpired(now);

    while (this.buckets.size >= this.maxEntries) {
      const oldestEntry = this.buckets.keys().next();
      if (oldestEntry.done) {
        break;
      }
      const oldestKey = oldestEntry.value;
      this.buckets.delete(oldestKey);
    }
  }

  /**
   * Get current bucket count (for testing/debugging).
   */
  getBucketCount(): number {
    return this.buckets.size;
  }
}
