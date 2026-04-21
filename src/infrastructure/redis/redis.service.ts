import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis Service
 *
 * Provides Redis client access for infrastructure features.
 * This is an infrastructure-level service - NOT for business data.
 *
 * Use cases:
 * - Rate limiting (distributed counters)
 * - Session caching (future)
 * - Distributed locks (future)
 *
 * Non-goals:
 * - Business data storage
 * - Queues or pub/sub (use dedicated queue services)
 * - Caching domain entities
 *
 * Key namespacing strategy:
 * backend-base:{env}:{feature}:{key}
 *
 * Example keys:
 * - backend-base:production:ratelimit:ip:192.168.1.1:rl-public-strict
 * - backend-base:development:ratelimit:user:uuid:rl-auth-semi-strict
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly namespace: string;

  /**
   * Runtime health state based on Redis connection events.
   * - Defaults to false (unhealthy until connection is established)
   * - Set to true on 'ready' event
   * - Set to false on 'error', 'end', 'close', or 'reconnecting' events
   */
  private healthy = false;

  constructor(private readonly configService: ConfigService) {
    const env = this.configService.get<string>('NODE_ENV', 'development');
    this.namespace = `backend-base:${env}`;
  }

  /**
   * Initialize Redis connection on module startup.
   * Fails fast if Redis is unreachable.
   */
  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      throw new Error(
        'REDIS_URL is required when Redis features are enabled. ' +
          'Set REDIS_URL=redis://redis:6379 or disable Redis features.',
      );
    }

    this.logger.log('Connecting to Redis...');
    this.logger.log(`Using REDIS_URL: ${JSON.stringify(redisUrl)}`);

    try {
      this.client = new Redis(redisUrl, {
        // Connection settings
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
        family: 4, // Force IPv4 to avoid Docker IPv6 issues

        // Fail fast on connection errors during startup
        lazyConnect: true,
        // Disable offline queue so operations fail fast when disconnected
        enableOfflineQueue: false,

        // Reconnection strategy
        retryStrategy: (times: number): number => {
          // Retry indefinitely with backoff
          return Math.min(times * 200, 1000);
        },
      });

      // Wire up health tracking events
      this.client.on('ready', () => {
        if (!this.healthy) {
          this.logger.log('Redis connection ready');
          this.healthy = true;
        }
      });

      this.client.on('error', (err) => {
        if (this.healthy) {
          this.logger.warn(`Redis connection error: ${err.message}`);
          this.healthy = false;
        }
      });

      this.client.on('end', () => {
        if (this.healthy) {
          this.logger.warn('Redis connection ended');
          this.healthy = false;
        }
      });

      this.client.on('close', () => {
        if (this.healthy) {
          this.logger.warn('Redis connection closed');
          this.healthy = false;
        }
      });

      this.client.on('reconnecting', () => {
        if (this.healthy) {
          this.logger.warn('Redis reconnecting');
          this.healthy = false;
        }
      });

      // Test connection
      await this.client.connect();
      this.logger.log('Redis connected successfully');
    } catch (error) {
      // Log error but DO NOT throw.
      // Redis is treated as an optional dependency at startup.
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to connect to Redis: ${message}. ` +
          'Redis features will be degraded until connection is established.',
      );
      // Ensure healthy is false
      this.healthy = false;
    }
  }

  /**
   * Close Redis connection on module shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.logger.log('Closing Redis connection...');
      try {
        if (this.client.status === 'ready') {
          await this.client.quit();
        } else {
          this.client.disconnect();
        }
      } catch (error) {
        // Ignore disconnection errors during shutdown
        this.logger.warn(
          `Error closing Redis connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
      this.client = null;
    }
  }

  /**
   * Get the Redis client.
   * @throws Error if client is not initialized
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  /**
   * Build a namespaced key.
   *
   * @param feature - Feature name (e.g., 'ratelimit', 'session')
   * @param key - The specific key within the feature
   * @returns Fully qualified namespaced key
   *
   * @example
   * buildKey('ratelimit', 'ip:192.168.1.1:rl-public-strict')
   * // Returns: 'backend-base:development:ratelimit:ip:192.168.1.1:rl-public-strict'
   */
  buildKey(feature: string, key: string): string {
    return `${this.namespace}:${feature}:${key}`;
  }

  /**
   * Check if Redis is currently healthy based on connection state.
   *
   * This method reflects the runtime connection state, not startup configuration.
   * It is synchronous and will never throw.
   *
   * Semantics:
   * - Returns false until the 'ready' event is received
   * - Returns true while connected and ready
   * - Returns false after 'error', 'end', 'close', or 'reconnecting' events
   *
   * @returns true if Redis is connected and ready, false otherwise
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Alias for isHealthy().
   * Checks if Redis is currently connected and ready.
   */
  isAvailable(): boolean {
    return this.healthy;
  }
}
