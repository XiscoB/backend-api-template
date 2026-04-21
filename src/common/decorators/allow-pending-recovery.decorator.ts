import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Metadata key for AllowPendingRecovery decorator.
 */
export const ALLOW_PENDING_RECOVERY_KEY = 'allowPendingRecovery';

/**
 * AllowPendingRecovery Decorator
 *
 * Explicitly allows identities in PENDING_RECOVERY status to access this endpoint.
 *
 * RULES:
 * - Identity MUST be in PENDING_RECOVERY status
 * - PENDING_RECOVERY = isSuspended AND recovery is available (preconditions met)
 * - BLOCKS ACTIVE users
 * - BLOCKS DELETED/BANNED users
 *
 * @example
 * ```typescript
 * @AllowPendingRecovery()
 * @Post('recover')
 * recoverAccount() { ... }
 * ```
 */
export const AllowPendingRecovery = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_PENDING_RECOVERY_KEY, true);
