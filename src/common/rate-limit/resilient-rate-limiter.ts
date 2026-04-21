import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { MemoryRateLimiter } from './memory-rate-limiter';
import { RateLimiter } from './rate-limiter.interface';
import { RedisRateLimiter } from './redis-rate-limiter';

type RateLimiterMode = 'memory_primary' | 'redis_primary' | 'memory_fallback';

interface RateLimiterFailureContext {
  mode: RateLimiterMode;
  driver: 'memory' | 'redis';
  reason: string;
  backendError: string;
}

export class RateLimiterUnavailableError extends HttpException {
  constructor(readonly context: RateLimiterFailureContext) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMIT_PROTECTION_UNAVAILABLE',
        message: 'Rate-limit protection unavailable. Request denied for safe degradation.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class ResilientRateLimiter implements RateLimiter, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResilientRateLimiter.name);

  private mode: RateLimiterMode;
  private nextProbeAt = 0;
  private probeInProgress = false;
  private lastProbeFailureLogAt = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private redisRateLimiter: RedisRateLimiter | null = null;

  private readonly memoryRateLimiter: MemoryRateLimiter;

  constructor(
    private readonly appConfigService: AppConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.mode = appConfigService.rateLimitDriver === 'redis' ? 'redis_primary' : 'memory_primary';
    this.memoryRateLimiter = new MemoryRateLimiter({
      maxEntries: appConfigService.rateLimitFallbackMemoryMaxEntries,
      minimumTtlSeconds: appConfigService.rateLimitFallbackMemoryTtlSeconds,
    });
  }

  onModuleInit(): void {
    this.startCleanupTimerOnce();

    if (this.appConfigService.rateLimitDriver !== 'redis') {
      this.logger.log(
        JSON.stringify({
          event: 'rate_limit_mode_initialized',
          mode: this.mode,
          driver: this.appConfigService.rateLimitDriver,
        }),
      );
      return;
    }

    if (this.isRedisHealthy()) {
      this.logger.log(
        JSON.stringify({
          event: 'rate_limit_mode_initialized',
          mode: this.mode,
          driver: 'redis',
        }),
      );
      return;
    }

    if (!this.appConfigService.rateLimitFallbackEnabled) {
      this.logger.error(
        JSON.stringify({
          event: 'rate_limit_startup_redis_unhealthy',
          action: 'fail_closed_on_requests',
          mode: this.mode,
          driver: 'redis',
        }),
      );
      return;
    }

    this.activateFallback('startup_redis_unhealthy', undefined);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async consume(params: { key: string; limit: number; windowSeconds: number }): Promise<boolean> {
    if (this.appConfigService.rateLimitDriver === 'memory') {
      return this.consumeWithMemoryFailClosed(params, 'memory_primary_path', undefined);
    }

    if (this.mode === 'redis_primary') {
      try {
        return await this.consumeWithRedis(params);
      } catch (error) {
        if (!this.appConfigService.rateLimitFallbackEnabled) {
          throw this.createFailClosedError('redis_failure_without_fallback', error);
        }

        this.activateFallback('redis_consume_failed', error);
        return this.consumeWithMemoryFailClosed(params, 'fallback_after_redis_failure', error);
      }
    }

    const probeResult = await this.tryProbeAndConsume(params);
    if (probeResult !== null) {
      return probeResult;
    }

    return this.consumeWithMemoryFailClosed(params, 'fallback_active', undefined);
  }

  private startCleanupTimerOnce(): void {
    if (this.cleanupTimer) {
      return;
    }

    const intervalMs = this.appConfigService.rateLimitFallbackCleanupIntervalMs;
    this.cleanupTimer = setInterval(() => {
      this.memoryRateLimiter.cleanup();
    }, intervalMs);
  }

  private async consumeWithRedis(params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    return this.getRedisRateLimiter().consume(params);
  }

  private async consumeWithMemoryFailClosed(
    params: { key: string; limit: number; windowSeconds: number },
    reason: string,
    redisError: unknown,
  ): Promise<boolean> {
    try {
      return await this.memoryRateLimiter.consume(params);
    } catch (memoryError) {
      this.logger.error(
        JSON.stringify({
          event: 'rate_limit_double_backend_failure',
          mode: this.mode,
          reason,
          redisError: this.getErrorMessage(redisError),
          memoryError: this.getErrorMessage(memoryError),
        }),
      );
      throw this.createFailClosedError('double_backend_failure', memoryError);
    }
  }

  private async tryProbeAndConsume(params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean | null> {
    const now = Date.now();

    if (now < this.nextProbeAt || this.probeInProgress) {
      return null;
    }

    this.probeInProgress = true;
    try {
      const result = await this.consumeWithRedis(params);
      this.mode = 'redis_primary';
      this.nextProbeAt = 0;
      this.logger.log(
        JSON.stringify({
          event: 'rate_limit_redis_restored',
          mode: this.mode,
          driver: 'redis',
        }),
      );
      return result;
    } catch (error) {
      this.nextProbeAt = now + this.appConfigService.rateLimitFallbackProbeCooldownMs;
      this.logProbeFailureThrottled(error, now);
      return null;
    } finally {
      this.probeInProgress = false;
    }
  }

  private activateFallback(reason: string, error: unknown): void {
    this.mode = 'memory_fallback';
    this.nextProbeAt = Date.now() + this.appConfigService.rateLimitFallbackProbeCooldownMs;
    this.logger.warn(
      JSON.stringify({
        event: 'rate_limit_fallback_activated',
        mode: this.mode,
        driver: 'redis',
        reason,
        error: this.getErrorMessage(error),
        nextProbeAt: this.nextProbeAt,
      }),
    );
  }

  private logProbeFailureThrottled(error: unknown, now: number): void {
    const cooldownMs = this.appConfigService.rateLimitFallbackProbeCooldownMs;
    if (now < this.lastProbeFailureLogAt + cooldownMs) {
      return;
    }

    this.lastProbeFailureLogAt = now;
    this.logger.warn(
      JSON.stringify({
        event: 'rate_limit_probe_failed',
        mode: this.mode,
        driver: 'redis',
        error: this.getErrorMessage(error),
        nextProbeAt: this.nextProbeAt,
      }),
    );
  }

  private getRedisRateLimiter(): RedisRateLimiter {
    if (this.redisRateLimiter) {
      return this.redisRateLimiter;
    }

    if (!this.redisService) {
      throw new Error('RedisService unavailable in RATE_LIMIT_DRIVER=redis mode');
    }

    this.redisRateLimiter = new RedisRateLimiter(this.redisService);
    return this.redisRateLimiter;
  }

  private isRedisHealthy(): boolean {
    if (!this.redisService) {
      return false;
    }

    return this.redisService.isHealthy();
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown_error';
  }

  private createFailClosedError(reason: string, error: unknown): RateLimiterUnavailableError {
    return new RateLimiterUnavailableError({
      mode: this.mode,
      driver: this.appConfigService.rateLimitDriver,
      reason,
      backendError: this.getErrorMessage(error),
    });
  }
}
