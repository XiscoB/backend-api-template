import { SetMetadata } from '@nestjs/common';
import { RateLimitTierName } from '../../config/rate-limit.config';

/**
 * Metadata key for rate limit tier.
 */
export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Applies rate limiting to a route or controller.
 *
 * This decorator marks the endpoint with a rate limit tier.
 * The RateLimitGuard reads this metadata to enforce the limit.
 *
 * IMPORTANT: This decorator does NOTHING by itself.
 * You must also apply @UseGuards(RateLimitGuard) to the route/controller.
 *
 * @param tierName - The rate limit tier name from rate-limit.config.ts
 *
 * @example
 * ```typescript
 * @UseGuards(RateLimitGuard)
 * @RateLimit('rl-public-strict')
 * @Get('sensitive')
 * sensitiveEndpoint() { ... }
 * ```
 *
 * @see rate-limit.config.ts for available tiers
 */
export const RateLimit = (tierName: RateLimitTierName): ReturnType<typeof SetMetadata> =>
  SetMetadata(RATE_LIMIT_KEY, tierName);
