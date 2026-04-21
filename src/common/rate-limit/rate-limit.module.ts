import { Module, Global } from '@nestjs/common';
import { RATE_LIMITER } from './rate-limiter.interface';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { IdentityModule } from '../../modules/identity/identity.module';
import { ResilientRateLimiter } from './resilient-rate-limiter';

/**
 * Rate Limit Driver Type
 *
 * - 'memory': In-process rate limiting (default, no deps)
 * - 'redis': Distributed rate limiting (requires Redis)
 */
export type RateLimitDriver = 'memory' | 'redis';

/**
 * Rate Limit Module
 *
 * Provides rate limiting infrastructure for the application.
 *
 * Backend Selection:
 * - RATE_LIMIT_DRIVER=memory (default) → In-memory rate limiting
 * - RATE_LIMIT_DRIVER=redis → Redis-based rate limiting
 *
 * IMPORTANT: Redis is primary when configured, with bounded in-memory fallback
 * when Redis is unhealthy.
 *
 * Redis Behavior:
 * - Requires REDIS_URL environment variable
 * - Boots with safe in-memory fallback if Redis is unavailable
 * - Never fails open on backend errors
 *
 * Usage:
 * Import this module and use @UseGuards(RateLimitGuard) with @RateLimit() decorator.
 * Rate limiting is opt-in per controller/route - NOT applied globally.
 *
 * @example
 * ```typescript
 * @UseGuards(RateLimitGuard)
 * @RateLimit('rl-public-strict')
 * @Controller('v1/sensitive')
 * export class SensitiveController { ... }
 * ```
 */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [
    ResilientRateLimiter,
    {
      provide: RATE_LIMITER,
      useExisting: ResilientRateLimiter,
    },
    RateLimitGuard,
  ],
  exports: [RATE_LIMITER, RateLimitGuard],
})
export class RateLimitModule {}
