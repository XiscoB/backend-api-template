import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GdprAuditAction, RequestType, Identity } from '@prisma/client';
import { GdprRepository } from './gdpr.repository';
import { IdentityService } from '../identity/identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationProfileService } from '../notifications/notification-profile.service';
import { GdprDeletionService } from './gdpr-deletion.service';
import { GdprDeletionEmailService } from './gdpr-deletion-email.service';
import { GdprAnonymizationService } from './gdpr-anonymization.service';
import { DeletionLegalHoldService } from './deletion-legal-hold.service';
import { getImmediateSuspensionTables } from './gdpr.registry';
import { GDPR } from '../../config/app.constants';

/**
 * Configuration for deletion lifecycle.
 */
export interface DeletionLifecycleConfig {
  /** Grace period before final deletion (days) */
  gracePeriodDays: number;
  /** Days before final deletion to send warning email */
  warningDays: number;
  /** Whether cancellation is allowed during grace period */
  cancellationAllowed: boolean;
}

/**
 * Result of a deletion lifecycle operation.
 */
export interface DeletionLifecycleResult {
  identityId: string;
  status: 'PENDING_DELETION' | 'CANCELLED' | 'FINALIZED';
  deletedAt: Date | null;
  scheduledFinalDeletionAt: Date | null;
  message: string;
}

/**
 * GDPR Deletion Lifecycle Service
 *
 * Orchestrates the full GDPR account deletion lifecycle:
 *
 * 1. DELETION REQUEST (Immediate Effects)
 *    - Sets identity.deletedAt = now()
 *    - Blocks all authenticated access (bootstrap returns PENDING_DELETION)
 *    - Cancels pending notifications and scheduled jobs
 *    - Prevents creation of new user-owned data
 *    - Authentication continues to succeed at auth provider (backend-only blocking)
 *
 * 2. GRACE PERIOD
 *    - Identity remains in PENDING_DELETION state
 *    - No app access allowed
 *    - Optional: Cancellation may be allowed (policy-driven)
 *    - Data is logically deleted but not yet anonymized
 *
 * 3. FINAL DELETION (Asynchronous, after grace period)
 *    - Removes/anonymizes all personal data
 *    - Sets identity.anonymized = true
 *    - Sends confirmation email
 *    - Auth provider cleanup is OPTIONAL and LAST
 *
 * Design Principles:
 * - Authentication success ≠ authorization
 * - Deletion NEVER relies on auth provider blocking
 * - All deletion logic is backend-owned
 * - All steps are auditable
 * - No provider-specific APIs or SDKs
 *
 * @see docs/adr/ADR-009-GDPR-DELETION-LIFECYCLE.md
 */
@Injectable()
export class GdprDeletionLifecycleService {
  private readonly logger = new Logger(GdprDeletionLifecycleService.name);
  private readonly config: DeletionLifecycleConfig;

  constructor(
    private readonly gdprRepository: GdprRepository,
    private readonly identityService: IdentityService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationProfileService: NotificationProfileService,
    private readonly deletionService: GdprDeletionService,
    private readonly deletionEmailService: GdprDeletionEmailService,
    private readonly anonymizationService: GdprAnonymizationService,
    private readonly deletionLegalHoldService: DeletionLegalHoldService,
  ) {
    // Load configuration from constants (can be overridden by env vars)
    this.config = {
      // Intentionally using || to handle both undefined env var and parseInt edge cases (NaN, 0)
      gracePeriodDays:
        parseInt(process.env.GDPR_DELETION_GRACE_PERIOD_DAYS || '', 10) ||
        GDPR.DELETION_GRACE_PERIOD_DAYS,
      warningDays: GDPR.DELETION_WARNING_DAYS,
      cancellationAllowed: GDPR.DELETION_CANCELLATION_ALLOWED,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API - User-Initiated Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Request account deletion.
   *
   * IMMEDIATE EFFECTS:
   * - Sets identity.deletedAt = now()
   * - Blocks all authenticated access
   * - Cancels pending notifications
   * - Creates audit log entry
   *
   * Preconditions:
   * - User must not be already in PENDING_DELETION state
   * - User must not be already anonymized (DELETED)
   * - User must not have pending/processing deletion request
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @param email - Email from authenticated JWT claim (optional)
   * @returns Deletion lifecycle result with scheduled deletion date
   * @throws ConflictException if deletion already pending
   * @throws ForbiddenException if user is already deleted
   */
  async requestDeletion(externalUserId: string, email?: string): Promise<DeletionLifecycleResult> {
    this.logger.log(`Deletion lifecycle requested for user: ${externalUserId.substring(0, 8)}...`);

    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Block if already anonymized (already permanently deleted)
    if (identity.anonymized) {
      throw new ForbiddenException(
        'Account has already been permanently deleted. No further action possible.',
      );
    }

    // Block if already in PENDING_DELETION state
    if (identity.deletedAt) {
      throw new ConflictException(
        'Account deletion is already pending. Please wait for the grace period to expire or cancel the deletion.',
      );
    }

    // Block if already suspended (must unsuspend first or escalate via suspension expiration)
    if (identity.isSuspended) {
      throw new ConflictException(
        'Account is currently suspended. Please recover your account before requesting deletion, or wait for suspension to escalate to deletion.',
      );
    }

    // ─────────────────────────────────────────────────────────────
    // DELETION LEGAL HOLD GUARD: Check for active deletion legal holds
    // ─────────────────────────────────────────────────────────────
    // Deletion legal holds temporarily block deletion in exceptional legal
    // circumstances. They do NOT retain personal data - only block the
    // deletion action. This check MUST occur BEFORE any destructive operations.
    //
    // ⚠️ THIS IS NOT: data retention, statutory retention, or fraud prevention.
    //
    // @see DeletionLegalHold model in prisma/schema.prisma
    // ─────────────────────────────────────────────────────────────
    const hasDeletionLegalHold = await this.deletionLegalHoldService.hasActiveDeletionLegalHold(
      identity.id,
    );
    if (hasDeletionLegalHold) {
      const activeHolds = await this.deletionLegalHoldService.getActiveDeletionLegalHolds(
        identity.id,
      );
      const earliestExpiry = activeHolds[0]?.expiresAt;
      throw new ForbiddenException(
        `Account deletion is temporarily blocked due to a deletion legal hold. ` +
          `The hold will expire on ${earliestExpiry?.toISOString() ?? 'unknown date'}. ` +
          `Please try again after this date.`,
      );
    }

    // Check for existing pending deletion request (shouldn't happen with deletedAt check, but defensive)
    const hasPending = await this.gdprRepository.hasPendingRequest(
      identity.id,
      RequestType.GDPR_DELETE,
    );
    if (hasPending) {
      throw new ConflictException(
        'A deletion request is already pending or processing. Please wait for it to complete.',
      );
    }

    // ─────────────────────────────────────────────────────────────
    // CRITICAL: Execute immediate effects
    // ─────────────────────────────────────────────────────────────

    // 1. Mark identity as pending deletion (blocks bootstrap)
    await this.identityService.markAsPendingDeletion(identity.id);

    // 2. Cancel all pending scheduled notifications
    await this.cancelPendingNotifications(identity.id);

    // 3. Disable notification profile (prevents new notifications)
    await this.disableNotificationProfile(identity.id);

    // 4. Cancel any in-progress GDPR export requests
    await this.cancelPendingExportRequests(identity.id);

    // 5. Create the GDPR request record (for tracking and cron processing)
    const request = await this.gdprRepository.createRequest({
      identityId: identity.id,
      requestType: RequestType.GDPR_DELETE,
    });

    // 6. Capture email from JWT (before any destructive operations)
    // Email is from authenticated JWT claim, NOT notification tables
    await this.deletionEmailService.captureEmailForDeletion(request.id, email, identity.id);

    // 7. CRITICAL: Delete IMMEDIATE-risk tables now (T+0)
    // This ensures no notifications can be sent after deletion intent
    // Mirrors the suspension flow behavior
    await this.deleteImmediateTables(identity.id);

    // 8. Write audit log
    const scheduledFinalDeletionAt = this.calculateFinalDeletionDate(new Date());
    await this.gdprRepository.createAuditLog({
      identityId: identity.id,
      action: GdprAuditAction.DELETE,
      metadata: {
        status: 'DELETION_REQUESTED',
        requestId: request.id,
        deletedAt: new Date().toISOString(),
        scheduledFinalDeletionAt: scheduledFinalDeletionAt.toISOString(),
        gracePeriodDays: this.config.gracePeriodDays,
        cancellationAllowed: this.config.cancellationAllowed,
        note: 'Account deletion requested. Access blocked. Grace period started.',
      },
      performedBy: identity.id, // Self-service
    });

    this.logger.log(
      `Deletion lifecycle started for identity ${identity.id}. ` +
        `Final deletion scheduled for: ${scheduledFinalDeletionAt.toISOString()}`,
    );

    return {
      identityId: identity.id,
      status: 'PENDING_DELETION',
      deletedAt: new Date(),
      scheduledFinalDeletionAt,
      message:
        `Account deletion requested. Your data will be permanently deleted on ${scheduledFinalDeletionAt.toISOString()}. ` +
        (this.config.cancellationAllowed
          ? 'You may cancel this request before that date.'
          : 'This action cannot be undone.'),
    };
  }

  /**
   * Cancel a pending deletion request.
   *
   * Only allowed if:
   * - Cancellation is enabled in config
   * - User is in PENDING_DELETION state (deletedAt is set)
   * - User is not already anonymized (final deletion not completed)
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @returns Deletion lifecycle result
   * @throws ForbiddenException if cancellation not allowed or user is deleted
   * @throws NotFoundException if no pending deletion found
   */
  async cancelDeletion(externalUserId: string): Promise<DeletionLifecycleResult> {
    this.logger.log(
      `Deletion cancellation requested for user: ${externalUserId.substring(0, 8)}...`,
    );

    // Check if cancellation is allowed
    if (!this.config.cancellationAllowed) {
      throw new ForbiddenException(
        'Deletion cancellation is not allowed. Once requested, deletion cannot be stopped.',
      );
    }

    // Resolve Identity
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Block if already anonymized
    if (identity.anonymized) {
      throw new ForbiddenException(
        'Account has already been permanently deleted. Cancellation is not possible.',
      );
    }

    // Check if actually pending deletion
    if (!identity.deletedAt) {
      throw new NotFoundException('No pending deletion request found for this account.');
    }

    // ─────────────────────────────────────────────────────────────
    // Cancel deletion
    // ─────────────────────────────────────────────────────────────

    // 1. Clear deletedAt (restores access)
    await this.identityService.cancelPendingDeletion(identity.id);

    // 2. Cancel the GDPR request record
    await this.cancelDeletionRequest(identity.id);

    // 3. Write audit log
    await this.gdprRepository.createAuditLog({
      identityId: identity.id,
      action: GdprAuditAction.DELETE,
      metadata: {
        status: 'DELETION_CANCELLED',
        originalDeletedAt: identity.deletedAt.toISOString(),
        note: 'Account deletion cancelled by user. Access restored.',
      },
      performedBy: identity.id, // Self-service
    });

    this.logger.log(`Deletion cancelled for identity ${identity.id}. Access restored.`);

    return {
      identityId: identity.id,
      status: 'CANCELLED',
      deletedAt: null,
      scheduledFinalDeletionAt: null,
      message: 'Account deletion has been cancelled. Your account access has been restored.',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Cron-Compatible Methods - Background Processing
  // ─────────────────────────────────────────────────────────────

  /**
   * Process expired grace periods.
   *
   * Called by cron job to finalize deletions where grace period has expired.
   *
   * @param limit - Maximum number of deletions to process in this batch
   * @returns Number of deletions finalized
   */
  async processExpiredGracePeriods(limit: number = GDPR.DELETION_BATCH_SIZE): Promise<number> {
    const pendingFinal = await this.identityService.findPendingFinalDeletion(
      this.config.gracePeriodDays,
      limit,
    );

    if (pendingFinal.length === 0) {
      return 0;
    }

    this.logger.log(`Processing ${pendingFinal.length} expired deletion grace periods`);

    let finalized = 0;
    for (const identity of pendingFinal) {
      try {
        await this.finalizeDeletion(identity);
        finalized++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to finalize deletion for ${identity.id}: ${errorMessage}`);
        // Continue processing other deletions
      }
    }

    if (finalized > 0) {
      this.logger.log(`Finalized ${finalized} deletions`);
    }

    return finalized;
  }

  /**
   * Send warning emails for approaching deletions.
   *
   * Called by cron job to notify users that deletion is imminent.
   *
   * @param limit - Maximum number of warnings to send
   * @returns Number of warnings sent
   */
  async sendDeletionWarnings(limit: number = GDPR.WARNING_BATCH_SIZE): Promise<number> {
    const approaching = await this.identityService.findApproachingFinalDeletion(
      this.config.gracePeriodDays,
      this.config.warningDays,
      limit,
    );

    if (approaching.length === 0) {
      return 0;
    }

    this.logger.log(`Sending ${approaching.length} deletion warning notifications`);

    let sent = 0;
    for (const identity of approaching) {
      try {
        // TODO: Send warning email
        // For now, just log and count
        this.logger.debug(`Would send deletion warning to identity ${identity.id}`);
        sent++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to send warning for ${identity.id}: ${errorMessage}`);
      }
    }

    return sent;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Finalize deletion for an identity.
   *
   * Called after grace period expires. This is the point of no return.
   */
  private async finalizeDeletion(identity: Identity): Promise<void> {
    this.logger.log(`Finalizing deletion for identity ${identity.id}`);

    // Claim exactly one deletion request for this identity.
    // This prevents processing an unrelated user's request under concurrent workers.
    let request = await this.gdprRepository.claimPendingRequestForIdentity(
      identity.id,
      RequestType.GDPR_DELETE,
    );

    if (!request) {
      // Create a request if one doesn't exist (edge case recovery)
      this.logger.warn(
        `No pending deletion request found for ${identity.id}, creating one for finalization`,
      );

      await this.gdprRepository.createRequest({
        identityId: identity.id,
        requestType: RequestType.GDPR_DELETE,
      });

      request = await this.gdprRepository.claimPendingRequestForIdentity(
        identity.id,
        RequestType.GDPR_DELETE,
      );
    }

    if (!request) {
      this.logger.warn(
        `Deletion request for ${identity.id} could not be claimed (already processed by another worker)`,
      );
      return;
    }

    try {
      // Delegate to existing deletion service for data anonymization.
      await this.deletionService.processClaimedDeletionRequest(request);

      // TODO: Send confirmation email in user's locale
      this.logger.log(`Deletion finalized for identity ${identity.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to finalize deletion for ${identity.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Cancel all pending scheduled notifications for an identity.
   */
  private async cancelPendingNotifications(identityId: string): Promise<void> {
    try {
      // Cancel scheduled notifications
      const cancelledCount =
        await this.notificationsService.cancelAllScheduledNotificationsForIdentity(identityId);

      if (cancelledCount > 0) {
        this.logger.debug(
          `Cancelled ${cancelledCount} scheduled notifications for identity ${identityId}`,
        );
      }
    } catch (error) {
      // Log but don't fail - notifications are non-critical
      this.logger.warn(
        `Failed to cancel notifications for ${identityId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Disable notification profile to prevent new notifications.
   *
   * GDPR INVARIANT: This is one layer of defense-in-depth.
   * Notification services also check identity.deletedAt directly.
   */
  private async disableNotificationProfile(identityId: string): Promise<void> {
    try {
      const disabled =
        await this.notificationProfileService.disableNotificationsForIdentity(identityId);
      if (disabled) {
        this.logger.debug(`Disabled notification profile for identity ${identityId}`);
      }
    } catch (error) {
      // Log but don't fail - notification config is non-critical
      this.logger.warn(
        `Failed to disable notification profile for ${identityId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Cancel any in-progress GDPR export requests.
   */
  private async cancelPendingExportRequests(identityId: string): Promise<void> {
    try {
      const pendingExports = await this.gdprRepository.findPendingRequests(RequestType.GDPR_EXPORT);
      const userExports = pendingExports.filter((r) => r.identityId === identityId);

      for (const request of userExports) {
        await this.gdprRepository.markRequestCancelled(request.id);
        this.logger.debug(`Cancelled export request ${request.id} due to deletion`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cancel export requests for ${identityId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Cancel the pending deletion request record.
   */
  private async cancelDeletionRequest(identityId: string): Promise<void> {
    const pendingDeletions = await this.gdprRepository.findPendingRequests(RequestType.GDPR_DELETE);
    const userDeletion = pendingDeletions.find((r) => r.identityId === identityId);

    if (userDeletion) {
      await this.gdprRepository.markRequestCancelled(userDeletion.id);
    }
  }

  /**
   * Delete IMMEDIATE-risk tables synchronously at T+0.
   *
   * GDPR INVARIANT: Once deletion intent is recorded, notification data must be gone.
   * This mirrors the suspension flow (backupAndDeleteRiskyTables) but WITHOUT backup.
   *
   * IMMEDIATE tables can cause outbound side effects:
   * - ScheduledNotification: Can trigger future sends
   * - UserNotificationProfile: Controls notification routing
   * - UserEmailChannel: Contains delivery tokens
   * - UserPushChannel: Contains push tokens
   *
   * NOTE: Uses same table set as suspension (getImmediateSuspensionTables).
   * "Immediate suspension tables" == "Immediate deletion tables" by design.
   */
  private async deleteImmediateTables(identityId: string): Promise<void> {
    const immediateTables = getImmediateSuspensionTables();

    if (immediateTables.length === 0) {
      this.logger.warn('No IMMEDIATE tables found for deletion - skipping');
      return;
    }

    this.logger.log(
      `Deleting ${immediateTables.length} IMMEDIATE-risk tables for identity ${identityId}`,
    );

    try {
      // Use anonymization service with DELETE mode (no backups)
      const result = await this.anonymizationService.anonymize({
        identityId,
        anonymizedUid: this.anonymizationService.generateAnonymizedUid(),
        mode: 'DELETE', // No backups - permanent deletion
        tables: immediateTables,
      });

      this.logger.log(
        `IMMEDIATE tables deleted: ${result.totalRowsAffected} rows across ${result.summary.length} tables`,
      );
    } catch (error) {
      // Fail fast - GDPR cleanup is critical
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete IMMEDIATE tables: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Calculate the final deletion date based on grace period.
   */
  private calculateFinalDeletionDate(deletedAt: Date): Date {
    const finalDate = new Date(deletedAt);
    finalDate.setDate(finalDate.getDate() + this.config.gracePeriodDays);
    return finalDate;
  }

  /**
   * Get deletion status for an identity.
   */
  async getDeletionStatus(externalUserId: string): Promise<DeletionLifecycleResult | null> {
    const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);

    if (!identity) {
      return null;
    }

    if (identity.anonymized) {
      return {
        identityId: identity.id,
        status: 'FINALIZED',
        deletedAt: identity.deletedAt,
        scheduledFinalDeletionAt: null,
        message: 'Account has been permanently deleted.',
      };
    }

    if (identity.deletedAt) {
      const scheduledFinalDeletionAt = this.calculateFinalDeletionDate(identity.deletedAt);
      return {
        identityId: identity.id,
        status: 'PENDING_DELETION',
        deletedAt: identity.deletedAt,
        scheduledFinalDeletionAt,
        message: `Account deletion pending. Final deletion scheduled for ${scheduledFinalDeletionAt.toISOString()}.`,
      };
    }

    return null; // Not in deletion lifecycle
  }
}
