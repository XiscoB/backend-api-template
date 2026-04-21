import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { RATE_LIMITER, RateLimiter } from '../rate-limit/rate-limiter.interface';
import { getRateLimitTier, RateLimitTierName } from '../../config/rate-limit.config';
import { IdentityService } from '../../modules/identity/identity.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RateLimiterUnavailableError } from '../rate-limit/resilient-rate-limiter';

/**
 * Rate Limit Guard
 *
 * Enforces rate limiting on endpoints decorated with @RateLimit().
 *
 * IMPORTANT: This guard does NOTHING if @RateLimit() decorator is absent.
 * You must explicitly apply both the guard and decorator:
 *
 * @example
 * ```typescript
 * @UseGuards(RateLimitGuard)
 * @RateLimit('rl-public-strict')
 * @Get('sensitive')
 * sensitiveEndpoint() { ... }
 * ```
 *
 * Key resolution by scope:
 * - 'ip' scope → Uses client IP (request.ip)
 * - 'user' scope → Uses Identity.id (NOT JWT sub). Denies if no identity.
 *
 * Rate-Limit Headers:
 * Headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset) are
 * emitted ONLY when:
 * - RATE_LIMIT_DRIVER=redis
 * - Redis is currently healthy
 * - The request is protected by @RateLimit()
 *
 * Headers are suppressed when:
 * - Using memory backend
 * - Redis is unhealthy
 * - Redis metadata read fails
 *
 * @see rate-limit.config.ts for tier definitions
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private static readonly RATELIMIT_FEATURE = 'ratelimit';

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
    private readonly identityService: IdentityService,
    private readonly configService: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Read @RateLimit() decorator metadata
    const tierName = this.reflector.getAllAndOverride<RateLimitTierName | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No decorator = no rate limiting
    if (!tierName) {
      return true;
    }

    // Get tier configuration
    const tier = getRateLimitTier(tierName);
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Resolve rate limit key based on scope
    const key = await this.resolveKey(tier.scope, request);
    const rateLimitKey = `${tier.scope}:${tierName}:${key}`;

    // Consume rate limit token
    let allowed = false;
    try {
      allowed = await this.rateLimiter.consume({
        key: rateLimitKey,
        limit: tier.limit,
        windowSeconds: tier.windowSeconds,
      });
    } catch (error) {
      if (error instanceof RateLimiterUnavailableError) {
        this.logger.error(
          `Rate limiter fail-closed: mode=${error.context.mode}, driver=${error.context.driver}, reason=${error.context.reason}, backendError=${error.context.backendError}`,
        );
        throw error;
      }

      this.logger.error(
        `Unexpected rate limiter error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMIT_PROTECTION_UNAVAILABLE',
          message: 'Rate-limit protection unavailable. Request denied for safe degradation.',
          tier: tierName,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!allowed) {
      this.logger.debug(`Rate limit exceeded: tier=${tierName}, scope=${tier.scope}, key=${key}`);

      // Set headers on 429 response if eligible
      await this.setRateLimitHeaders(response, rateLimitKey, tier.limit);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          tier: tierName,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Set headers on successful response if eligible
    await this.setRateLimitHeaders(response, rateLimitKey, tier.limit);

    return true;
  }

  /**
   * Set rate-limit headers on the response.
   *
   * Headers are emitted ONLY when:
   * - RATE_LIMIT_DRIVER=redis
   * - Redis is currently healthy
   * - Redis metadata read succeeds
   *
   * On any failure, headers are silently suppressed.
   * This ensures we never emit inaccurate rate-limit information.
   */
  private async setRateLimitHeaders(
    response: Response,
    rateLimitKey: string,
    limit: number,
  ): Promise<void> {
    // Check if headers should be emitted
    if (!this.shouldEmitHeaders()) {
      return;
    }

    // Query Redis for current state
    const metadata = await this.getHeaderMetadata(rateLimitKey, limit);
    if (!metadata) {
      // Redis read failed - suppress headers silently
      return;
    }

    // Set standard rate-limit headers
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', metadata.remaining);
    response.setHeader('X-RateLimit-Reset', metadata.resetAt);

    // Add Retry-After on 429 responses (when remaining is 0)
    if (metadata.remaining === 0 && metadata.retryAfterSeconds > 0) {
      response.setHeader('Retry-After', metadata.retryAfterSeconds);
    }
  }

  /**
   * Determine if rate-limit headers should be emitted.
   *
   * Headers are only emitted when:
   * - RATE_LIMIT_DRIVER=redis (not memory)
   * - RedisService is available
   * - Redis is currently healthy (event-driven state)
   *
   * @returns true if headers should be emitted
   */
  private shouldEmitHeaders(): boolean {
    const driver = this.configService.get<string>('RATE_LIMIT_DRIVER', 'memory');

    // Only emit headers for Redis backend
    if (driver !== 'redis') {
      return false;
    }

    // RedisService must be available
    if (!this.redisService) {
      return false;
    }

    // Redis must be healthy (event-driven state)
    return this.redisService.isHealthy();
  }

  /**
   * Query Redis for header metadata.
   *
   * Queries:
   * - GET key → current count
   * - TTL key → seconds until reset
   *
   * If either query fails, returns null (headers will be suppressed).
   *
   * @param rateLimitKey - The rate limit key (without namespace)
   * @param limit - The configured limit for this tier
   * @returns Metadata for headers, or null on any failure
   */
  private async getHeaderMetadata(
    rateLimitKey: string,
    limit: number,
  ): Promise<{ remaining: number; resetAt: number; retryAfterSeconds: number } | null> {
    if (!this.redisService) {
      return null;
    }

    try {
      const client = this.redisService.getClient();
      const redisKey = this.redisService.buildKey(RateLimitGuard.RATELIMIT_FEATURE, rateLimitKey);

      // Query current count and TTL in parallel
      const [countStr, ttl] = await Promise.all([client.get(redisKey), client.ttl(redisKey)]);

      // Parse count (default to 0 if key doesn't exist)
      const count = parseInt(countStr ?? '0', 10);

      // Calculate remaining (never negative)
      const remaining = Math.max(0, limit - count);

      // Calculate reset timestamp (current time + TTL)
      // TTL returns -1 if key has no TTL, -2 if key doesn't exist
      const validTtl = ttl > 0 ? ttl : 0;
      const resetAt = Math.floor(Date.now() / 1000) + validTtl;

      return {
        remaining,
        resetAt,
        retryAfterSeconds: validTtl,
      };
    } catch (error) {
      // Redis read failed - suppress headers, don't block request
      this.logger.debug(
        `Failed to read rate limit metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Resolve rate limit key based on scope.
   *
   * @param scope - 'ip' for IP-based, 'user' for user-based
   * @param request - Express request object
   * @returns Rate limit key string
   * @throws ForbiddenException if user scope but no identity
   */
  private async resolveKey(scope: 'ip' | 'user', request: Request): Promise<string> {
    if (scope === 'ip') {
      return this.extractClientIp(request);
    }

    // User scope - requires authenticated identity
    const user = request.user as { sub?: string; id?: string } | undefined;
    const externalUserId = user?.sub || user?.id;

    if (!externalUserId) {
      this.logger.warn('Rate limit with user scope applied to unauthenticated request');
      throw new ForbiddenException({
        code: 'RATE_LIMIT_NO_IDENTITY',
        message: 'Authentication required for this endpoint',
      });
    }

    // Resolve to Identity.id (not JWT sub)
    const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);

    if (!identity) {
      this.logger.warn(`Rate limit denied: no identity for externalUserId=${externalUserId}`);
      throw new ForbiddenException({
        code: 'RATE_LIMIT_NO_IDENTITY',
        message: 'Identity not found',
      });
    }

    return identity.id;
  }

  /**
   * Extract client IP address from request.
   *
   * Trust model:
   * - Uses request.ip which respects Express "trust proxy" settings
   * - Do NOT blindly trust x-forwarded-for without proxy configuration
   * - Falls back to '0.0.0.0' if IP cannot be determined
   *
   * @param request - Express request object
   * @returns Client IP address string
   */
  private extractClientIp(request: Request): string {
    // request.ip respects Express trust proxy settings.
    // Only configure "trust proxy" in production with proper reverse proxy setup.
    return request.ip || '0.0.0.0';
  }
}
