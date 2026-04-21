import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis Infrastructure Module
 *
 * Provides Redis client access for infrastructure features.
 *
 * IMPORTANT: This module should only be imported when Redis is needed.
 * It fails fast at startup if Redis is unreachable.
 *
 * Usage:
 * - Import RedisModule where Redis features are enabled
 * - Inject RedisService to access the client
 *
 * Design notes:
 * - Global module: available everywhere once imported
 * - Fail-fast: throws on startup if Redis unavailable
 * - Isolated: does not leak Redis APIs to business logic
 *
 * @example
 * ```typescript
 * // In a module that needs Redis
 * @Module({
 *   imports: [RedisModule],
 *   providers: [MyRedisFeature],
 * })
 * export class MyModule {}
 * ```
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
