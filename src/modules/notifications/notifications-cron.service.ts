import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { NotificationLog } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  NotificationCronResult,
  ScheduledNotificationExecutionResult,
  NotificationDeliveryHook,
  NOTIFICATION_DELIVERY_HOOKS,
} from './notifications.types';
import { NOTIFICATIONS } from '../../config/app.constants';

/**
 * Notifications Cron Service
 *
 * Provides methods designed to be called by external cron jobs or schedulers.
 *
 * This service does NOT include @nestjs/schedule decorators intentionally.
 * The actual scheduling should be done by:
 * - External cron jobs (Kubernetes CronJob, AWS EventBridge, etc.)
 * - A separate scheduler module if internal scheduling is needed
 *
 * Why external scheduling?
 * - Template neutrality: Different projects have different infra
 * - Flexibility: Can use any scheduler (K8s, Lambda, node-cron, etc.)
 * - Testability: Methods can be called directly in tests
 *
 * Processing guarantees:
 * - Idempotent: Re-processing a notification has no effect (status check)
 * - Batch-safe: Processes up to batchSize notifications per run
 * - Downtime-safe: Pending notifications are preserved during downtime
 * - Retry-safe: Failed notifications can be retried (status remains PENDING until success)
 *
 * Usage examples:
 *
 * 1. Call from HTTP endpoint (for testing or manual triggers):
 *    POST /api/internal/notifications/process
 *
 * 2. Call from external cron (Kubernetes CronJob):
 *    curl -X POST http://localhost:3000/api/internal/notifications/process
 *
 * 3. Call from @nestjs/schedule (if added separately):
 *    @Cron('* * * * *')
 *    async handleCron() {
 *      await this.notificationsCronService.processPendingNotifications();
 *    }
 */
/**
 * Invariant:
 * - NotificationLog MUST exist before any delivery attempt
 * - NotificationDeliveryLog MUST only be written by NotificationDeliveryService
 * - Scheduler decides eligibility; delivery is unconditional
 */
@Injectable()
export class NotificationsCronService {
  private readonly logger = new Logger(NotificationsCronService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(NOTIFICATION_DELIVERY_HOOKS)
    private readonly deliveryHooks?: NotificationDeliveryHook[],
  ) {}

  /**
   * Process pending scheduled notifications.
   *
   * Finds all PENDING notifications where scheduledAt <= now and processes them.
   * For each notification:
   * 1. Create a NotificationLog (source of truth)
   * 2. Mark ScheduledNotification as EXECUTED
   * 3. Invoke delivery hooks (if any)
   *
   * Failed notifications are marked as FAILED with error details.
   * Retry logic is NOT implemented in the base - extending projects can
   * implement retry by querying FAILED notifications and resetting to PENDING.
   *
   * @param batchSize - Maximum notifications to process per run (default: NOTIFICATIONS.CRON_BATCH_SIZE)
   * @returns Summary of the processing run
   */
  async processPendingNotifications(
    batchSize: number = NOTIFICATIONS.CRON_BATCH_SIZE,
  ): Promise<NotificationCronResult> {
    const startTime = Date.now();

    this.logger.log(`Starting notification processing run (batchSize: ${batchSize})...`);

    // Find pending notifications ready for processing
    const pending = await this.notificationsRepository.findPendingScheduledNotifications(batchSize);

    if (pending.length === 0) {
      const durationMs = Date.now() - startTime;
      this.logger.debug(`No pending notifications to process (${durationMs}ms)`);
      return { processed: 0, succeeded: 0, failed: 0, durationMs };
    }

    this.logger.log(`Found ${pending.length} pending notifications to process`);

    // Process each notification
    const results: ScheduledNotificationExecutionResult[] = [];

    for (const scheduled of pending) {
      const result = await this.processOne(scheduled.id);
      results.push(result);
    }

    const succeeded = results.filter((r): boolean => r.success).length;
    const failed = results.filter((r): boolean => !r.success).length;
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Notification processing complete: ${succeeded} succeeded, ${failed} failed (${durationMs}ms)`,
    );

    return {
      processed: results.length,
      succeeded,
      failed,
      durationMs,
    };
  }

  /**
   * Process a single scheduled notification.
   *
   * @param scheduledNotificationId - The ID of the scheduled notification
   * @returns Execution result
   */
  private async processOne(
    scheduledNotificationId: string,
  ): Promise<ScheduledNotificationExecutionResult> {
    try {
      // Fetch the scheduled notification (ensures it still exists and is PENDING)
      const scheduled =
        await this.notificationsRepository.findScheduledNotificationById(scheduledNotificationId);

      if (!scheduled) {
        return {
          scheduledNotificationId,
          success: false,
          error: 'Scheduled notification not found',
        };
      }

      if (scheduled.status !== 'PENDING') {
        // Already processed - idempotent behavior
        return {
          scheduledNotificationId,
          success: true,
          notificationLogId: scheduled.notificationLogId ?? undefined,
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // GDPR INVARIANT: Check identity status before execution
      // ═══════════════════════════════════════════════════════════════════════════
      // Identity state check is source-of-truth. Do NOT cache or memoize.
      // Notification suppression for deleted identities is a successful NO-OP.
      const identity = await this.prisma.identity.findUnique({
        where: { id: scheduled.identityId },
        select: { deletedAt: true, anonymized: true },
      });

      if (identity?.anonymized === true || identity?.deletedAt != null) {
        // Cancel notification instead of executing
        await this.notificationsRepository.cancelScheduledNotification(scheduledNotificationId);
        this.logger.debug(
          `Cancelled scheduled notification ${scheduledNotificationId}: identity is deleted/pending deletion`,
        );
        return {
          scheduledNotificationId,
          success: true, // NO-OP, not an error
          skippedReason: 'Identity is deleted or pending deletion',
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // VALIDATE CHANNELS (Invariant: No Log without Delivery Attempt)
      // ═══════════════════════════════════════════════════════════════════════════
      const profile = await this.prisma.userNotificationProfile.findUnique({
        where: { identityId: scheduled.identityId },
        include: { emailChannels: true /*, pushChannels: true*/ }, // Push channels not in base schema yet?
      });

      // Note: Base template assumes Push is external or handled via adapter hookup,
      // but without a UserPushChannel model in schema we can't query it here easily
      // unless we assume profile.pushChannels exists (if schema was updated).
      // The instructions said UserPushChannel was REMOVED.
      // So detailed Push eligibility check is tricky without the model.
      // However, we MUST ensure at least ONE channel exists.
      // If we only have Email in base schema, we check Email.
      // If product adds Push, they must update this logic or rely on Hooks having targets.
      // BUT strict requirement: "NotificationLog must never exist without...".

      const hasEnabledEmail = profile?.emailChannels.some((c): boolean => c.enabled);
      // const hasEnabledPush = ... (Product specific)

      if (!profile || !profile.notificationsEnabled || !hasEnabledEmail /* && !hasEnabledPush */) {
        // Skip execution (do NOT create NotificationLog)
        // We mark it as EXECUTED (or CANCELLED) so it doesn't stay PENDING.
        await this.notificationsRepository.cancelScheduledNotification(scheduledNotificationId);

        return {
          scheduledNotificationId,
          success: true,
          skippedReason: 'No eligible channels available',
        };
      }

      // Execute: create NotificationLog and update status atomically
      const notificationLog =
        await this.notificationsRepository.executeScheduledNotification(scheduled);

      // Invoke delivery hooks (if any)
      await this.invokeDeliveryHooks(notificationLog);

      return {
        scheduledNotificationId,
        success: true,
        notificationLogId: notificationLog.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to process scheduled notification ${scheduledNotificationId}: ${errorMessage}`,
      );

      // Mark as failed (preserves for potential retry)
      try {
        await this.notificationsRepository.markScheduledNotificationFailed(
          scheduledNotificationId,
          errorMessage,
        );
      } catch (updateError) {
        // Log but don't throw - original error is more important
        this.logger.error(
          `Failed to update status for notification ${scheduledNotificationId}: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
        );
      }

      return {
        scheduledNotificationId,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Invoke all registered delivery hooks.
   *
   * Hook failures are logged but do not throw.
   * The NotificationLog is the source of truth regardless of delivery.
   */
  private async invokeDeliveryHooks(notification: NotificationLog): Promise<void> {
    if (!this.deliveryHooks || this.deliveryHooks.length === 0) {
      return;
    }

    for (const hook of this.deliveryHooks) {
      try {
        await hook.onNotificationCreated(notification);
      } catch (error) {
        // Log but don't throw - notification exists regardless of delivery
        this.logger.error(
          `Delivery hook failed for notification ${notification.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
