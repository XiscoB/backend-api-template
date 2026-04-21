import { Injectable, Logger } from '@nestjs/common';
import { GdprAuditAction, SuspensionLifecycleState } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprRepository } from './gdpr.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { GdprExpirationResult } from './gdpr.types';

/**
 * GDPR Suspension Expiration Service
 *
 * Handles finalization of expired suspensions.
 * This is the IRREVERSIBLE step that makes recovery impossible.
 *
 * Mental Model:
 * - Suspension = reversible deletion with recovery window
 * - Expiration = finalization, equivalent to permanent deletion
 * - After expiration: recovery is IMPOSSIBLE
 *
 * Expiration Flow:
 * 1. Find expired suspensions:
 *    - now > suspended_until
 *    - lifecycleState = SUSPENDED (not RECOVERED or EXPIRED)
 * 2. For each expired suspension:
 *    - Create minimal legal retention record (audit log)
 *    - Permanently delete all backups
 *    - Mark lifecycleState = EXPIRED
 *    - Notify user (if possible)
 *
 * CRITICAL INVARIANT:
 * After expiration, recovery is IMPOSSIBLE.
 * The suspended user is equivalent to a permanently deleted user.
 */
@Injectable()
export class GdprSuspensionEscalationService {
  private readonly logger = new Logger(GdprSuspensionEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprRepository: GdprRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Process expired suspensions and finalize them.
   *
   * Finds suspensions past their recovery window and makes them permanent.
   * After this operation, recovery is IMPOSSIBLE.
   *
   * @param limit - Maximum number of expirations to process
   * @returns Number of suspensions expired
   */
  async processExpiredSuspensions(limit: number = 10): Promise<number> {
    const now = new Date();

    // Find expired suspensions (still SUSPENDED, past deadline)
    const expiredSuspensions = await this.prisma.accountSuspension.findMany({
      where: {
        suspendedUntil: { lt: now },
        lifecycleState: SuspensionLifecycleState.SUSPENDED,
      },
      take: limit,
      orderBy: { suspendedUntil: 'asc' },
    });

    if (expiredSuspensions.length === 0) {
      return 0;
    }

    let expired = 0;

    for (const suspension of expiredSuspensions) {
      try {
        await this.finalizeSuspension(suspension);
        expired++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to finalize suspension ${suspension.suspensionUid}: ${errorMessage}`,
        );
        // Continue with other suspensions
      }
    }

    return expired;
  }

  /**
   * Finalize a single suspension (make recovery impossible).
   *
   * This is the IRREVERSIBLE step:
   * - Backups are permanently deleted
   * - Lifecycle state is set to EXPIRED
   * - User becomes equivalent to permanently deleted
   */
  private async finalizeSuspension(
    suspension: Awaited<ReturnType<typeof this.prisma.accountSuspension.findFirst>>,
  ): Promise<GdprExpirationResult> {
    if (!suspension) {
      throw new Error('Suspension not found');
    }

    const { suspensionUid, identityId, anonymizedUid } = suspension;
    const now = new Date();

    this.logger.log(`Finalizing suspension ${suspensionUid} (making recovery impossible)`);

    // Step 1: Create legal retention record (audit log with finalization details)
    await this.gdprRepository.createAuditLog({
      identityId,
      action: GdprAuditAction.DELETE,
      metadata: {
        status: 'SUSPENSION_EXPIRED',
        suspensionUid,
        anonymizedUid,
        suspendedAt: suspension.suspendedAt.toISOString(),
        suspendedUntil: suspension.suspendedUntil?.toISOString() ?? null,
        expiredAt: now.toISOString(),
        note: 'Recovery window expired. Backups permanently deleted. Recovery is impossible.',
      },
      performedBy: 'SYSTEM',
    });

    // Step 2: Permanently delete all backups (no longer recoverable)
    const deleteResult = await this.prisma.suspensionBackup.deleteMany({
      where: { suspensionUid },
    });

    this.logger.debug(`Deleted ${deleteResult.count} backups for suspension ${suspensionUid}`);

    // Step 3: Mark suspension as EXPIRED
    await this.prisma.accountSuspension.update({
      where: { id: suspension.id },
      data: {
        lifecycleState: SuspensionLifecycleState.EXPIRED,
        expiredAt: now,
      },
    });

    // Step 4: Notify user (they're effectively deleted, but try anyway)
    await this.notifyExpiration(identityId, suspensionUid);

    this.logger.log(`Suspension ${suspensionUid} finalized. Recovery is now impossible.`);

    return {
      suspensionUid,
      identityId,
      expiredAt: now,
      backupsDeleted: deleteResult.count,
      legalRetentionRecordCreated: true,
    };
  }

  /**
   * Send expiration warnings for suspensions approaching their deadline.
   *
   * @param daysBeforeExpiration - How many days before expiration to warn
   * @param limit - Maximum number of warnings to send
   * @returns Number of warnings sent
   */
  async sendExpirationWarnings(
    daysBeforeExpiration: number = 7,
    limit: number = 100,
  ): Promise<number> {
    const now = new Date();
    const warningDeadline = new Date(now);
    warningDeadline.setDate(warningDeadline.getDate() + daysBeforeExpiration);

    // Find suspensions expiring within the warning period
    // that are still in SUSPENDED state
    const expiringSuspensions = await this.prisma.accountSuspension.findMany({
      where: {
        suspendedUntil: {
          gt: now,
          lte: warningDeadline,
        },
        lifecycleState: SuspensionLifecycleState.SUSPENDED,
      },
      take: limit,
      orderBy: { suspendedUntil: 'asc' },
    });

    if (expiringSuspensions.length === 0) {
      return 0;
    }

    let warned = 0;

    for (const suspension of expiringSuspensions) {
      try {
        // Check if we already sent a warning for this suspension
        const existingWarning = await this.prisma.notificationLog.findFirst({
          where: {
            identityId: suspension.identityId,
            type: 'GDPR_SUSPENSION_EXPIRING',
            payload: {
              path: ['suspensionUid'],
              equals: suspension.suspensionUid,
            },
          },
        });

        if (existingWarning) {
          // Already warned, skip
          continue;
        }

        await this.notificationsService.notifyByIdentityId({
          identityId: suspension.identityId,
          type: 'GDPR_SUSPENSION_EXPIRING',
          payload: {
            suspensionUid: suspension.suspensionUid,
            suspendedAt: suspension.suspendedAt.toISOString(),
            expiresAt: suspension.suspendedUntil?.toISOString() ?? null,
            daysRemaining: Math.ceil(
              (suspension.suspendedUntil!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            ),
            lifecycleState: 'SUSPENDED',
            message:
              'Your account suspension is about to expire. Recover your account now or data will be permanently deleted.',
          },
        });

        warned++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to send expiration warning for suspension ${suspension.suspensionUid}: ${errorMessage}`,
        );
        // Continue with other suspensions
      }
    }

    return warned;
  }

  /**
   * Notify user that their suspension has expired (finalized).
   * Recovery is no longer possible.
   *
   * Uses notifyByIdentityId to avoid phantom identity creation
   * (identityId is the internal UUID, not externalUserId).
   */
  private async notifyExpiration(identityId: string, suspensionUid: string): Promise<void> {
    try {
      await this.notificationsService.notifyByIdentityId({
        identityId,
        type: 'GDPR_SUSPENSION_EXPIRED',
        payload: {
          suspensionUid,
          expiredAt: new Date().toISOString(),
          lifecycleState: 'EXPIRED',
          message: 'Your account suspension has expired. Recovery is no longer possible.',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send expiration notification: ${errorMessage}`);
      // Don't throw - notification failure shouldn't block expiration
    }
  }
}
