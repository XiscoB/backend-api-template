import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityService } from '../../modules/identity/identity.service';
import { GdprSuspensionService } from '../../modules/gdpr/gdpr-suspension.service';
import { ALLOW_SUSPENDED_KEY } from '../decorators/allow-suspended.decorator';
import { ALLOW_PENDING_RECOVERY_KEY } from '../decorators/allow-pending-recovery.decorator';
import { SKIP_IDENTITY_STATUS_CHECK_KEY } from '../decorators/skip-identity-status-check.decorator';

/**
 * Identity Status Guard
 *
 * Enforces identity status restrictions on protected endpoints.
 * This guard runs AFTER JWT authentication (requires valid JWT first).
 *
 * Blocking rules:
 * - BANNED: Always blocked (permanent, administrative)
 * - DELETED: Always blocked (anonymized, irreversible)
 * - PENDING_DELETION: Always blocked (grace period active)
 * - SUSPENDED: Blocked unless endpoint has @AllowSuspended() decorator
 *
 * Special decorators:
 * - @SkipIdentityStatusCheck(): Bypasses ALL checks (for bootstrap endpoint)
 * - @AllowSuspended(): Allows SUSPENDED users only (for recovery flow)
 * - @AllowPendingRecovery(): Allows PENDING_RECOVERY users (strict check)
 *
 * This guard ensures that even if a user has a valid JWT,
 * they cannot access protected endpoints if their identity status
 * is in a blocked state.
 *
 * IMPORTANT: This guard is applied globally after JwtAuthGuard.
 * All protected endpoints automatically inherit this behavior.
 */
@Injectable()
export class IdentityStatusGuard implements CanActivate {
  private readonly logger = new Logger(IdentityStatusGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: IdentityService,
    // Injecting GdprSuspensionService to verify recovery preconditions
    private readonly gdprSuspensionService: GdprSuspensionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint skips identity status check (e.g., bootstrap)
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_IDENTITY_STATUS_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true; // Bootstrap and similar endpoints bypass all checks
    }

    const request = context.switchToHttp().getRequest<{ user?: { sub?: string; id?: string } }>();

    // If no user in request, JWT guard should have blocked this
    // Skip for routes that passed without JWT (public routes)
    if (!request.user) {
      return true;
    }

    const userSub = request.user.sub ?? request.user.id;
    if (!userSub) {
      return true; // No identifier to check
    }

    // Resolve identity and check status
    const identity = await this.identityService.getIdentityByExternalUserId(userSub);

    if (!identity) {
      // Identity doesn't exist yet - will be lazily created
      // Allow through for bootstrap/first-request scenarios
      return true;
    }

    // Check banned status - always blocked, highest priority
    if (identity.isBanned) {
      this.logger.warn(`[IdentityStatusGuard] Blocked BANNED user: ${identity.id}`);
      throw new ForbiddenException({
        code: 'IDENTITY_BANNED',
        message: 'Account is permanently banned',
        status: 'BANNED',
      });
    }

    // Check anonymized status - always blocked
    if (identity.anonymized) {
      this.logger.debug(`[IdentityStatusGuard] Blocked DELETED user: ${identity.id}`);
      throw new ForbiddenException({
        code: 'IDENTITY_DELETED',
        message: 'Account has been deleted',
        status: 'DELETED',
      });
    }

    // Check pending deletion - always blocked
    if (identity.deletedAt) {
      this.logger.debug(`[IdentityStatusGuard] Blocked PENDING_DELETION user: ${identity.id}`);
      throw new ForbiddenException({
        code: 'IDENTITY_PENDING_DELETION',
        message: 'Account deletion is in progress',
        status: 'PENDING_DELETION',
      });
    }

    // Check for specific PENDING_RECOVERY permission
    const allowPendingRecovery = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_RECOVERY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowPendingRecovery) {
      // STRICT CHECK: Must be PENDING_RECOVERY (suspended + recovery available)
      // This implicitly blocks ACTIVE, SUSPENDED (no recovery), etc.

      if (!identity.isSuspended) {
        // Active (or other non-suspended) users cannot access recovery endpoints
        this.logger.warn(
          `[IdentityStatusGuard] Blocked ACTIVE user from recovery endpoint: ${identity.id}`,
        );
        throw new ForbiddenException({
          code: 'IDENTITY_NOT_SUSPENDED',
          message: 'Account is not suspended',
          status: 'ACTIVE',
        });
      }

      // Check recovery preconditions (DB check)
      const validation = await this.gdprSuspensionService.validateRecoveryPreconditions(
        identity.id,
      );

      if (validation.valid) {
        // Status is effectively PENDING_RECOVERY
        return true;
      }

      // If validation fails, they are SUSPENDED (but not PENDING_RECOVERY)
      this.logger.warn(
        `[IdentityStatusGuard] Blocked SUSPENDED (no recovery) user from recovery endpoint: ${identity.id}`,
      );
      throw new ForbiddenException({
        code: 'RECOVERY_UNAVAILABLE',
        message: 'Account is suspended but recovery is not available',
        status: 'SUSPENDED',
      });
    }

    // Check if endpoint allows suspended users (Legacy/General)
    const allowSuspended = this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Check suspended status - blocked unless @AllowSuspended()
    if (identity.isSuspended && !allowSuspended) {
      this.logger.debug(`[IdentityStatusGuard] Blocked SUSPENDED user: ${identity.id}`);
      throw new ForbiddenException({
        code: 'IDENTITY_SUSPENDED',
        message: 'Account is suspended',
        status: 'SUSPENDED',
      });
    }

    return true;
  }
}
