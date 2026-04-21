import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Metadata key for SkipIdentityStatusCheck decorator.
 */
export const SKIP_IDENTITY_STATUS_CHECK_KEY = 'skipIdentityStatusCheck';

/**
 * SkipIdentityStatusCheck Decorator
 *
 * Use this decorator on endpoints that must be accessible to ALL users
 * regardless of their identity status (including BANNED/DELETED).
 *
 * This is specifically designed for the bootstrap endpoint which
 * must return identity status to blocked users so they can see
 * appropriate UI messages.
 *
 * WARNING: Use sparingly! This bypasses critical security enforcement.
 * Only use for endpoints that:
 * 1. Return read-only status information
 * 2. Do not perform any state-changing operations
 * 3. Do not expose sensitive data
 *
 * @example
 * ```typescript
 * @SkipIdentityStatusCheck()
 * @Post('bootstrap')
 * bootstrap() { ... }
 * ```
 */
export const SkipIdentityStatusCheck = (): CustomDecorator<string> =>
  SetMetadata(SKIP_IDENTITY_STATUS_CHECK_KEY, true);
