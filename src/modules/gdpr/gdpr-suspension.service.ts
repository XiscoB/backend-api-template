import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import {
  Request,
  GdprAuditAction,
  RequestType,
  AccountSuspension,
  SuspensionBackup,
  SuspensionLifecycleState,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprRepository } from './gdpr.repository';
import { IdentityService } from '../identity/identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GdprAnonymizationService } from './gdpr-anonymization.service';
import {
  GdprRecoveryResult,
  GdprSuspensionHook,
  GDPR_SUSPENSION_HOOKS,
  DEFAULT_SUSPENSION_CONFIG,
  SuspensionConfig,
  RecoveryPreconditions,
  RecoveryValidationResult,
} from './gdpr.types';
import { getImmediateSuspensionTables, getDeferredSuspensionTables } from './gdpr.registry';

/**
 * GDPR Suspension Service
 *
 * Implements SUSPENSION AS REVERSIBLE DELETION.
 *
 * Mental Model:
 * - Suspension = reversible deletion with recovery window
 * - Suspended accounts MUST behave exactly like deleted accounts
 * - The only difference: backup exists until expiration
 * - After expiration: recovery is impossible, equivalent to permanent deletion
 *
 * Lifecycle States:
 * - ACTIVE: Normal account
 * - SUSPENDED: Data anonymized, backup exists, recovery possible
 * - RECOVERED: Restored from backup, re-activated
 * - EXPIRED: Backup deleted, recovery impossible
 *
 * Suspension Flow (Crash-Safe):
 * 1. Validate user exists and is not already suspended
 * 2. Validate cooldown since last recovery
 * 3. Calculate suspended_until deadline
 * 4. Generate suspension_uid and anonymized_uid
 * 5. CREATE SUSPENSION RECORD FIRST (before any destructive action)
 * 6. Create backup for each table
 * 7. Anonymize data using shared anonymization service
 * 8. Block login at IdP (via hooks)
 * 9. Write audit log
 *
 * Recovery Flow (Strict & Deterministic):
 * 1. Validate ALL recovery preconditions
 * 2. Load all unused backups
 * 3. Restore whitelisted fields deterministically
 * 4. Mark backups as used
 * 5. Update suspension to RECOVERED state
 * 6. Unblock login (via hooks)
 * 7. Write audit log
 *
 * CRITICAL INVARIANTS:
 * - Suspension record MUST exist before any destructive action
 * - If backup/anonymization fails, suspension record enables cleanup
 * - Backups are write-once (never modified after creation)
 * - Recovery is only possible if ALL preconditions pass
 */
@Injectable()
export class GdprSuspensionService {
  private readonly logger = new Logger(GdprSuspensionService.name);
  private readonly config: SuspensionConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprRepository: GdprRepository,
    private readonly identityService: IdentityService,
    private readonly notificationsService: NotificationsService,
    private readonly anonymizationService: GdprAnonymizationService,
    @Optional()
    @Inject(GDPR_SUSPENSION_HOOKS)
    private readonly suspensionHooks?: GdprSuspensionHook[],
  ) {
    this.config = DEFAULT_SUSPENSION_CONFIG;
  }

  // ─────────────────────────────────────────────────────────────
  // Public API - Used by Controllers
  // ─────────────────────────────────────────────────────────────

  /**
   * Request a GDPR account suspension.
   *
   * IMMEDIATE EFFECTS (before returning):
   * 1. Identity.isSuspended = true (access blocked)
   * 2. Suspension record created (crash-safety)
   * 3. IMMEDIATE-risk tables backed up and DELETED
   *
   * DEFERRED EFFECTS (via cron):
   * - Remaining tables backed up and processed
   *
   * Validation:
   * - User must exist
   * - User must not be permanently deleted (anonymized)
   * - No pending/processing suspension request
   * - No active suspension
   * - Cooldown since last recovery must have passed
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @param gracePeriodDays - Optional grace period before auto-escalation (null = no escalation)
   * @returns The created request
   * @throws ConflictException if validation fails
   * @throws ForbiddenException if user is permanently deleted
   */
  async requestSuspension(
    externalUserId: string,
    _gracePeriodDays?: number | null,
  ): Promise<Request> {
    this.logger.log(`Suspension requested for user: ${externalUserId}`);

    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Block if already anonymized (permanently deleted)
    if (identity.anonymized) {
      throw new ForbiddenException(
        'Account has been permanently deleted. Suspension is not possible.',
      );
    }

    // Check for existing pending request
    const hasPending = await this.gdprRepository.hasPendingRequest(
      identity.id,
      RequestType.GDPR_SUSPEND,
    );
    if (hasPending) {
      throw new ConflictException(
        'A suspension request is already pending or processing. Please wait for it to complete.',
      );
    }

    // Check for existing active suspension
    const hasActiveSuspension = await this.hasActiveSuspension(identity.id);
    if (hasActiveSuspension) {
      throw new ConflictException(
        'Account is already suspended. Use recovery endpoint to reactivate before requesting new suspension.',
      );
    }

    // Check cooldown since last recovery
    const lastRecovery = await this.getLastRecoveryTime(identity.id);
    if (lastRecovery && !this.isCooldownPassed(lastRecovery)) {
      const cooldownHours = this.config.recoveryCooldownHours ?? 24;
      throw new ConflictException(
        `Cannot request suspension within ${cooldownHours} hours of recovery. Please wait.`,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // CRITICAL: Immediate enforcement - suspend identity NOW
    // This mirrors deletion behavior (sets blocking flag synchronously).
    // ─────────────────────────────────────────────────────────────
    await this.identityService.suspendIdentity(identity.id);
    this.logger.log(`Identity suspended immediately: ${identity.id}`);

    // ─────────────────────────────────────────────────────────────
    // CRITICAL: Create suspension record FIRST (crash-safety)
    // This ensures cron can resume even if request crashes mid-flow.
    // ─────────────────────────────────────────────────────────────
    const suspensionUid = this.anonymizationService.generateSuspensionUid();
    const anonymizedUid = this.anonymizationService.generateAnonymizedUid();
    const suspendedAt = new Date();
    const suspendedUntil = this.calculateSuspendedUntil(suspendedAt);

    await this.prisma.accountSuspension.create({
      data: {
        identityId: identity.id,
        suspensionUid,
        anonymizedUid,
        lifecycleState: SuspensionLifecycleState.SUSPENDING,
        suspendedAt,
        suspendedUntil,
      },
    });
    this.logger.debug(`Suspension record created (SUSPENDING): ${suspensionUid}`);

    // ─────────────────────────────────────────────────────────────
    // CRITICAL: Back up and DELETE risky tables IMMEDIATELY
    // These tables can cause outbound side effects. Delete them NOW.
    // ─────────────────────────────────────────────────────────────
    await this.backupAndDeleteRiskyTables(identity.id, suspensionUid, anonymizedUid);

    // Create the request (for tracking remaining cron work)
    const request = await this.gdprRepository.createRequest({
      identityId: identity.id,
      requestType: RequestType.GDPR_SUSPEND,
    });

    this.logger.log(`Suspension request created: ${request.id}`);
    return request;
  }

  /**
   * Check if identity has a blocking suspension (SUSPENDING or SUSPENDED).
   *
   * Use this to determine if an account is blocked from requesting new suspensions.
   * Both SUSPENDING (in-progress) and SUSPENDED (complete) states block new suspension requests.
   *
   * @see hasActiveSuspendingRecord for checking in-progress only
   * @see getActiveSuspension for checking recoverable suspension (SUSPENDED only)
   */
  async hasActiveSuspension(identityId: string): Promise<boolean> {
    const count = await this.prisma.accountSuspension.count({
      where: {
        identityId,
        lifecycleState: {
          in: [SuspensionLifecycleState.SUSPENDING, SuspensionLifecycleState.SUSPENDED],
        },
      },
    });
    return count > 0;
  }

  /**
   * Check if identity has a suspension in progress (SUSPENDING state).
   *
   * Used to provide specific error messages during recovery attempts.
   * Recovery is NOT allowed during SUSPENDING - only after transition to SUSPENDED.
   */
  async hasActiveSuspendingRecord(identityId: string): Promise<boolean> {
    const count = await this.prisma.accountSuspension.count({
      where: {
        identityId,
        lifecycleState: SuspensionLifecycleState.SUSPENDING,
      },
    });
    return count > 0;
  }

  /**
   * Get recoverable suspension for an identity (SUSPENDED state only).
   *
   * This is the source of truth for recovery eligibility.
   * Returns null if suspension is still in SUSPENDING state or doesn't exist.
   *
   * INVARIANT: Recovery is ONLY allowed from SUSPENDED, never from SUSPENDING.
   */
  async getActiveSuspension(
    identityId: string,
  ): Promise<(AccountSuspension & { backups: SuspensionBackup[] }) | null> {
    return await this.prisma.accountSuspension.findFirst({
      where: {
        identityId,
        lifecycleState: SuspensionLifecycleState.SUSPENDED,
      },
      include: {
        backups: {
          where: {
            backupUsed: false,
          },
        },
      },
    });
  }

  /**
   * Validate recovery preconditions.
   * ALL conditions must be true for recovery to proceed.
   */
  async validateRecoveryPreconditions(identityId: string): Promise<RecoveryValidationResult> {
    const suspension = await this.getActiveSuspension(identityId);
    const now = new Date();

    const preconditions: RecoveryPreconditions = {
      backupExists: false,
      backupNotUsed: false,
      withinRecoveryWindow: false,
      accountIsSuspended: false,
      notExpired: false,
      cooldownPassed: true, // For recovery, this is about suspension, not recovery cooldown
    };

    if (!suspension) {
      // No active suspension found
      return {
        valid: false,
        preconditions,
        failedConditions: Object.keys(preconditions) as (keyof RecoveryPreconditions)[],
      };
    }

    // Check each precondition
    preconditions.accountIsSuspended =
      suspension.lifecycleState === SuspensionLifecycleState.SUSPENDED;
    preconditions.notExpired = suspension.expiredAt === null;
    preconditions.backupExists = suspension.backups.length > 0;
    preconditions.backupNotUsed = suspension.backups.some((b) => !b.backupUsed);
    preconditions.withinRecoveryWindow =
      suspension.suspendedUntil === null || now < suspension.suspendedUntil;

    const failedConditions = (Object.keys(preconditions) as (keyof RecoveryPreconditions)[]).filter(
      (key) => !preconditions[key],
    );

    return {
      valid: failedConditions.length === 0,
      preconditions,
      failedConditions,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Cron-Compatible Methods - Used by Background Workers
  // ─────────────────────────────────────────────────────────────

  /**
   * Process pending suspension requests.
   *
   * This method is designed to be called by a cron job or background worker.
   * It processes one request at a time to avoid overwhelming the database.
   *
   * @param limit - Maximum number of requests to process in this batch
   * @returns Number of requests processed
   */
  async processPendingSuspensions(limit: number = 10): Promise<number> {
    const claimedRequests = await this.gdprRepository.claimPendingRequestsForProcessing(
      RequestType.GDPR_SUSPEND,
      limit,
    );
    let processed = 0;

    for (const request of claimedRequests) {
      try {
        await this.processSuspensionRequest(request);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process suspension request ${request.id}: ${errorMessage}`);
      }
    }

    if (processed > 0) {
      this.logger.log(`Processed ${processed} suspension requests`);
    }

    return processed;
  }

  // ─────────────────────────────────────────────────────────────
  // Recovery Flow (Renamed from Resume for clarity)
  // ─────────────────────────────────────────────────────────────

  /**
   * Recover a suspended account.
   *
   * STRICT DETERMINISTIC RECOVERY:
   * Recovery is ONLY allowed if ALL preconditions are met.
   * This is not a "best effort" operation - it's all or nothing.
   *
   * Preconditions (ALL must be true):
   * 1. Backup exists for the suspension
   * 2. Backup has not been used (consumed)
   * 3. Current time < suspendedUntil deadline
   * 4. Account is in SUSPENDED state
   * 5. Suspension has not expired
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @returns The recovery result
   * @throws NotFoundException if no active suspension exists
   * @throws ForbiddenException if preconditions are not met
   */
  async recoverAccount(externalUserId: string): Promise<GdprRecoveryResult> {
    this.logger.log(`Recovery requested for user: ${externalUserId}`);

    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);
    const identityId = identity.id;

    // CRITICAL: Block recovery for permanently deleted (anonymized) users
    // This enforces the no-recovery invariant for GDPR permanent deletion
    if (identity.anonymized) {
      this.logger.warn(`Recovery blocked for ${identityId}: Account has been permanently deleted`);
      throw new ForbiddenException(
        'Account has been permanently deleted. Recovery is not possible.',
      );
    }

    // Validate ALL preconditions
    const validation = await this.validateRecoveryPreconditions(identityId);

    if (!validation.valid) {
      this.logger.warn(
        `Recovery denied for ${identityId}: Failed conditions: ${validation.failedConditions.join(', ')}`,
      );

      // Provide specific error messages
      if (validation.failedConditions.includes('accountIsSuspended')) {
        // Check if there's a SUSPENDING record (in-progress suspension)
        const inProgress = await this.hasActiveSuspendingRecord(identityId);
        if (inProgress) {
          throw new ForbiddenException(
            'Account suspension is still in progress. Recovery will be available once suspension completes.',
          );
        }
        throw new NotFoundException('No active suspension found for this account.');
      }
      if (validation.failedConditions.includes('withinRecoveryWindow')) {
        throw new ForbiddenException('Recovery window has expired. Account cannot be recovered.');
      }
      if (validation.failedConditions.includes('notExpired')) {
        throw new ForbiddenException(
          'Suspension has expired and been finalized. Account cannot be recovered.',
        );
      }
      if (
        validation.failedConditions.includes('backupExists') ||
        validation.failedConditions.includes('backupNotUsed')
      ) {
        throw new ForbiddenException(
          'Backup data is not available for recovery. Account cannot be recovered.',
        );
      }
      throw new ForbiddenException('Recovery preconditions not met.');
    }

    const suspension = await this.getActiveSuspension(identityId);
    if (!suspension) {
      throw new NotFoundException('No active suspension found for this account.');
    }

    // Execute recovery
    const result = await this.executeRecovery(suspension);

    // Emit hooks (failures logged, not thrown)
    await this.invokeResumeHooks(identityId);

    // Notify user
    await this.notifyRecovered(identityId);

    // Write audit log
    await this.gdprRepository.createAuditLog({
      identityId,
      action: GdprAuditAction.RESUME,
      metadata: {
        status: 'SUCCESS',
        suspensionUid: suspension.suspensionUid,
        preconditions: validation.preconditions,
        details: result.summary,
        totalRowsRestored: result.totalRowsRestored,
      },
      performedBy: 'SYSTEM',
    });

    this.logger.log(
      `Recovery completed: ${suspension.suspensionUid} (${result.totalRowsRestored} rows restored)`,
    );

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Process a single suspension request (DEFERRED PHASE).
   *
   * IMPORTANT: Suspension record and IMMEDIATE tables are already processed
   * during requestSuspension(). This method only handles DEFERRED tables.
   *
   * This ensures cron can safely resume even if requestSuspension() crashes mid-flow.
   */
  private async processSuspensionRequest(request: Request): Promise<void> {
    const { id, identityId } = request;

    this.logger.log(`Processing suspension request (deferred phase): ${id}`);

    // ─────────────────────────────────────────────────────────────
    // CRITICAL: Reuse existing suspension record created at request time.
    // Suspension identifiers are generated ONCE at request time and are IMMUTABLE.
    // Never generate new UIDs here - this is essential for crash-safety and recovery.
    // ─────────────────────────────────────────────────────────────
    const existingSuspension = await this.prisma.accountSuspension.findFirst({
      where: {
        identityId,
        lifecycleState: SuspensionLifecycleState.SUSPENDING,
      },
      orderBy: { suspendedAt: 'desc' },
    });

    if (!existingSuspension) {
      // Should not happen if requestSuspension() completed successfully
      this.logger.error(`No suspension record found for request ${id} - skipping`);
      await this.gdprRepository.markRequestFailed(id, 'No suspension record found');
      return;
    }

    const { suspensionUid, anonymizedUid, suspendedUntil } = existingSuspension;
    this.logger.debug(`Reusing existing suspension record: ${suspensionUid}`);

    try {
      // Execute suspension for DEFERRED tables only
      // IMMEDIATE tables were already processed at request time
      const deferredTables = getDeferredSuspensionTables();

      const result = await this.anonymizationService.anonymize({
        identityId,
        anonymizedUid,
        mode: 'SUSPEND',
        suspensionUid,
        tables: deferredTables,
      });

      // Mark request as completed (guarded: PROCESSING -> COMPLETED)
      const completed = await this.gdprRepository.markRequestCompleted(id);
      if (!completed) {
        this.logger.debug(
          `Completion transition skipped for suspension request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // CRITICAL: Transition from SUSPENDING to SUSPENDED
      // This unlocks recovery - only do this after ALL processing completes
      // ─────────────────────────────────────────────────────────────
      await this.prisma.accountSuspension.update({
        where: { id: existingSuspension.id },
        data: { lifecycleState: SuspensionLifecycleState.SUSPENDED },
      });
      this.logger.debug(`Suspension finalized: ${suspensionUid} -> SUSPENDED`);

      // Emit hooks (failures logged, not thrown)
      await this.invokeSuspendHooks(identityId);

      // Notify user
      await this.notifySuspended(identityId, suspendedUntil);

      // Write audit log
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.SUSPEND,
        metadata: {
          status: 'SUCCESS',
          requestId: id,
          suspensionUid,
          anonymizedUid,
          lifecycleState: 'SUSPENDED',
          suspendedUntil: suspendedUntil?.toISOString() ?? null,
          details: result.summary,
          totalRowsAffected: result.totalRowsAffected,
          phase: 'DEFERRED', // Distinguish from IMMEDIATE phase
        },
        performedBy: 'SYSTEM',
      });

      this.logger.log(
        `Suspension completed (deferred): ${id} (${result.totalRowsAffected} rows across ${result.summary.length} tables)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed - but suspension record exists for cleanup/recovery
      const failed = await this.gdprRepository.markRequestFailed(id, errorMessage);
      if (!failed) {
        this.logger.debug(
          `Failure transition skipped for suspension request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // Write audit log with failure
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.SUSPEND,
        metadata: {
          status: 'FAILED',
          requestId: id,
          suspensionUid,
          error: errorMessage,
          note: 'Suspension record exists - cleanup or retry possible',
          phase: 'DEFERRED',
        },
        performedBy: 'SYSTEM',
      });

      this.logger.error(`Suspension failed (deferred): ${id} - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Execute recovery: restore all backed-up data using shared service.
   */
  private async executeRecovery(
    suspension: Awaited<ReturnType<typeof this.getActiveSuspension>>,
  ): Promise<GdprRecoveryResult> {
    if (!suspension) {
      throw new Error('Suspension not found');
    }

    const { suspensionUid, identityId } = suspension;

    // Restore using shared anonymization service
    const { tableSummaries, totalRowsRestored } =
      await this.anonymizationService.restoreFromBackups(suspensionUid);

    // Mark suspension as recovered
    const now = new Date();
    await this.prisma.accountSuspension.update({
      where: { id: suspension.id },
      data: {
        lifecycleState: SuspensionLifecycleState.RECOVERED,
        recoveredAt: now,
        resumedAt: now, // Legacy alias
        lastRecoveryAt: now,
      },
    });

    // Synchronize Identity.isSuspended flag with lifecycle state
    await this.identityService.resumeIdentity(identityId);

    return {
      identityId,
      suspensionUid,
      recoveredAt: now,
      summary: tableSummaries,
      totalRowsRestored,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the last recovery time for an identity.
   */
  private async getLastRecoveryTime(identityId: string): Promise<Date | null> {
    const lastRecovery = await this.prisma.accountSuspension.findFirst({
      where: {
        identityId,
        recoveredAt: { not: null },
      },
      orderBy: { recoveredAt: 'desc' },
      select: { recoveredAt: true },
    });
    return lastRecovery?.recoveredAt ?? null;
  }

  /**
   * Back up and DELETE risky tables immediately during suspension request.
   *
   * Called during suspension request (T+0) to ensure:
   * - No outbound notifications can be sent
   * - No delivery tokens remain active
   * - No scheduled notifications can fire
   *
   * NOTE: Uses DELETE, not cancel. These rows are removed entirely.
   * Recovery does not guarantee restoration of risky tables.
   *
   * IMMEDIATE-risk deletion is about behavioral safety, not completeness.
   * Full anonymization is always handled by cron.
   */
  private async backupAndDeleteRiskyTables(
    identityId: string,
    suspensionUid: string,
    anonymizedUid: string,
  ): Promise<void> {
    const riskyTables = getImmediateSuspensionTables();

    if (riskyTables.length === 0) {
      this.logger.warn('No IMMEDIATE suspension tables found - skipping');
      return;
    }

    this.logger.log(`Backing up and DELETING ${riskyTables.length} risky tables immediately`);

    try {
      await this.anonymizationService.anonymize({
        identityId,
        anonymizedUid,
        mode: 'SUSPEND',
        suspensionUid,
        tables: riskyTables,
      });
      this.logger.debug(`Risky tables processed successfully for ${identityId}`);
    } catch (error) {
      // Log but don't fail - cron will handle remaining cleanup
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process risky tables for ${identityId}: ${errorMessage}`);
      // Re-throw to allow request to surface the error
      throw error;
    }
  }

  /**
   * Check if cooldown period since last recovery has passed.
   */
  private isCooldownPassed(lastRecovery: Date): boolean {
    const cooldownHours = this.config.recoveryCooldownHours ?? 24;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    return Date.now() - lastRecovery.getTime() >= cooldownMs;
  }

  /**
   * Calculate the suspension deadline based on grace period.
   */
  private calculateSuspendedUntil(suspendedAt: Date): Date | null {
    if (this.config.defaultGracePeriodDays === null) {
      return null; // No auto-escalation
    }

    const days = this.config.defaultGracePeriodDays ?? 30;
    const deadline = new Date(suspendedAt);
    deadline.setDate(deadline.getDate() + days);
    return deadline;
  }

  // ─────────────────────────────────────────────────────────────
  // Hook Invocation
  // ─────────────────────────────────────────────────────────────

  /**
   * Invoke all registered suspension hooks for onSuspend.
   */
  private async invokeSuspendHooks(userId: string): Promise<void> {
    if (!this.suspensionHooks || this.suspensionHooks.length === 0) {
      return;
    }

    for (const hook of this.suspensionHooks) {
      try {
        await hook.onSuspend(userId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Suspension hook failed for onSuspend: ${errorMessage}`);
        // Continue with other hooks - failures don't block suspension
      }
    }
  }

  /**
   * Invoke all registered suspension hooks for onResume.
   */
  private async invokeResumeHooks(userId: string): Promise<void> {
    if (!this.suspensionHooks || this.suspensionHooks.length === 0) {
      return;
    }

    for (const hook of this.suspensionHooks) {
      try {
        await hook.onResume(userId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Suspension hook failed for onResume: ${errorMessage}`);
        // Continue with other hooks - failures don't block resume
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Notifications
  // ─────────────────────────────────────────────────────────────

  /**
   * Notify user that account has been suspended.
   *
   * Uses notifyByIdentityId to avoid phantom identity creation
   * (identityId is the internal UUID, not externalUserId).
   */
  private async notifySuspended(identityId: string, suspendedUntil: Date | null): Promise<void> {
    try {
      await this.notificationsService.notifyByIdentityId({
        identityId,
        type: 'GDPR_SUSPENSION_ACTIVE',
        payload: {
          suspendedAt: new Date().toISOString(),
          autoDeleteDate: suspendedUntil?.toISOString() ?? null,
          lifecycleState: 'SUSPENDED',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send suspension notification: ${errorMessage}`);
      // Don't throw - notification failure shouldn't block suspension
    }
  }

  /**
   * Notify user that account has been recovered.
   *
   * Uses notifyByIdentityId to avoid phantom identity creation
   * (identityId is the internal UUID, not externalUserId).
   */
  private async notifyRecovered(identityId: string): Promise<void> {
    try {
      await this.notificationsService.notifyByIdentityId({
        identityId,
        type: 'GDPR_SUSPENSION_RECOVERED',
        payload: {
          recoveredAt: new Date().toISOString(),
          lifecycleState: 'RECOVERED',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send recovery notification: ${errorMessage}`);
      // Don't throw - notification failure shouldn't block recovery
    }
  }
}
