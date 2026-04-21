import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Metadata key for AllowSuspended decorator.
 */
export const ALLOW_SUSPENDED_KEY = 'allowSuspended';

/**
 * AllowSuspended Decorator
 *
 * Use this decorator on endpoints that should be accessible
 * to suspended users (e.g., recovery flow, bootstrap).
 *
 * IMPORTANT: This does NOT allow BANNED, DELETED, or PENDING_DELETION users.
 * Those states are always blocked regardless of this decorator.
 *
 * @example
 * ```typescript
 * @AllowSuspended()
 * @Post('recover')
 * recoverAccount() { ... }
 * ```
 */
export const AllowSuspended = (): CustomDecorator<string> => SetMetadata(ALLOW_SUSPENDED_KEY, true);
