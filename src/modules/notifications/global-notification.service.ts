/**
 * Global Notification Service (Phase 8)
 *
 * The single canonical way the backend expresses intent to notify a user.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service is the one entry point for ALL notification intents:
 * - GDPR events
 * - System messages
 * - Future features
 *
 * It handles:
 * > Immediate vs scheduled orchestration
 * > Channel resolution (email, push)
 * > Audit log persistence
 * > Fault-tolerant batch processing
 *
 * It does NOT:
 * > Send real emails or push notifications (stubbed)
 * > Implement retry logic (future)
 * > Integrate SMTP/FCM/APNs (future)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Single Entry Point**: All notification intents flow through notifyUser()
 * 2. **Channel-Agnostic**: No email/push provider logic at this layer
 * 3. **Audit-First**: Always logs, never throws
 * 4. **Schedule = Persist**: notBefore creates ScheduledNotification record
 * 5. **Safe Everywhere**: Can be called from any domain without side effects
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MENTAL MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 8 answers: "How does the backend express intent to notify?"
 * Phase 8 does NOT answer: "How is an email/push actually sent?"
 *
 * This layer is forever. Adapters come later.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationAuditService } from './notification-audit.service';
import { NOTIFICATIONS } from '../../config/app.constants';

/**
 * Semantic notification event types.
 *
 * These are business events, not delivery channels.
 * Extensible without breaking changes.
 */
export enum NotificationEvent {
  // GDPR lifecycle events
  GDPR_EXPORT_READY = 'GDPR_EXPORT_READY',
  GDPR_EXPORT_EXPIRED = 'GDPR_EXPORT_EXPIRED',
  GDPR_EXPORT_DELETED = 'GDPR_EXPORT_DELETED',
  GDPR_DELETE_COMPLETED = 'GDPR_DELETE_COMPLETED',
  GDPR_SUSPEND_COMPLETED = 'GDPR_SUSPEND_COMPLETED',
  GDPR_RESUME_COMPLETED = 'GDPR_RESUME_COMPLETED',
  GDPR_SUSPENSION_EXPIRING = 'GDPR_SUSPENSION_EXPIRING',

  // System events (extensible)
  SYSTEM_MESSAGE = 'SYSTEM_MESSAGE',
}

/**
 * Notification request payload.
 */
export interface NotifyUserRequest {
  /** Identity ID of the user to notify */
  userId: string;

  /** Semantic event type */
  eventType: NotificationEvent;

  /** Domain-specific data (opaque to this layer) */
  payload?: Record<string, unknown>;

  /**
   * Optional scheduling gate.
   * If set to a future date, creates ScheduledNotification.
   * If missing or <= now, processes immediately.
   */
  notBefore?: Date;
}

/**
 * Result of a notification request.
 */
export interface NotifyUserResult {
  /** Whether the request was accepted (always true - never throws) */
  success: boolean;

  /** Whether notification was scheduled for later processing */
  scheduled: boolean;

  /** IDs of audit logs created (empty if scheduled) */
  auditLogIds: string[];

  /** Human-readable reason (for debugging) */
  reason?: string;
}

@Injectable()
export class GlobalNotificationService {
  private readonly logger = new Logger(GlobalNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationAudit: NotificationAuditService,
  ) {}

  /**
   * Express intent to notify a user.
   *
   * This is the ONE method all backend code uses for notifications.
   *
   * Behavior:
   * - If notBefore is in the future → persist ScheduledNotification
   * - Otherwise → resolve channels and create audit logs
   * - Never throws - all errors are absorbed and logged
   *
   * @param request - Notification request
   * @returns Result (always succeeds)
   */
  async notifyUser(request: NotifyUserRequest): Promise<NotifyUserResult> {
    try {
      const { userId, eventType, notBefore } = request;

      this.logger.debug(
        `[NotifyUser] userId=${userId}, event=${eventType}, scheduled=${!!notBefore}`,
      );

      // Path A: Scheduled path (notBefore in the future)
      if (notBefore && notBefore > new Date()) {
        return await this.scheduleNotification(request);
      }

      // Path B: Immediate path (process now)
      return await this.processImmediateNotification(request);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[NotifyUser] Unexpected error: ${err.message}`, err.stack);

      // Never throw - return success with reason
      return {
        success: true,
        scheduled: false,
        auditLogIds: [],
        reason: `Internal error: ${err.message}`,
      };
    }
  }

  /**
   * Process scheduled notifications that are now eligible.
   *
   * This is called by a cron job or manual trigger.
   *
   * @param limit - Max number of notifications to process (default NOTIFICATIONS.SCHEDULED_BATCH_SIZE)
   * @returns Number of notifications processed
   */
  async processScheduledNotifications(
    limit: number = NOTIFICATIONS.SCHEDULED_BATCH_SIZE,
  ): Promise<number> {
    try {
      this.logger.log(`[Scheduled] Processing up to ${limit} scheduled notifications...`);

      const now = new Date();

      // Fetch eligible notifications
      const notifications = await this.prisma.scheduledNotification.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
      });

      if (notifications.length === 0) {
        this.logger.debug('[Scheduled] No notifications to process');
        return 0;
      }

      this.logger.log(`[Scheduled] Found ${notifications.length} eligible notifications`);

      let processedCount = 0;

      // Process each notification (fault-tolerant)
      for (const notification of notifications) {
        try {
          // Extract identityId from the notification
          const identityId = notification.identityId;

          // Call notifyUser without notBefore (immediate processing)
          await this.notifyUser({
            userId: identityId,
            eventType: notification.type as NotificationEvent,
            payload: notification.payload as Record<string, unknown>,
            // No notBefore - process immediately
          });

          // Mark as processed
          await this.prisma.scheduledNotification.update({
            where: { id: notification.id },
            data: {
              status: 'EXECUTED',
              executedAt: new Date(),
            },
          });

          processedCount++;
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Scheduled] Failed to process notification ${notification.id}: ${err.message}`,
          );

          // Mark as failed but continue processing others
          await this.prisma.scheduledNotification
            .update({
              where: { id: notification.id },
              data: {
                status: 'FAILED',
                lastError: err.message,
                retryCount: { increment: 1 },
              },
            })
            .catch((updateError: unknown) => {
              const updateErrMsg =
                updateError instanceof Error ? updateError.message : String(updateError);
              this.logger.error(
                `[Scheduled] Failed to mark notification as failed: ${updateErrMsg}`,
              );
            });
        }
      }

      this.logger.log(
        `[Scheduled] Successfully processed ${processedCount}/${notifications.length} notifications`,
      );

      return processedCount;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Scheduled] Batch processing error: ${err.message}`, err.stack);
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Implementation
  // ─────────────────────────────────────────────────────────────

  /**
   * Schedule a notification for future processing.
   */
  private async scheduleNotification(request: NotifyUserRequest): Promise<NotifyUserResult> {
    const { userId, eventType, payload, notBefore } = request;

    try {
      // Create ScheduledNotification record
      await this.prisma.scheduledNotification.create({
        data: {
          identityId: userId,
          type: eventType,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
          scheduledAt: notBefore!,
          status: 'PENDING',
        },
      });

      // Create audit log with SCHEDULED status
      const auditLogId = await this.createScheduledAuditLog(userId, eventType);

      this.logger.log(
        `[Schedule] Created scheduled notification: userId=${userId}, event=${eventType}, notBefore=${notBefore!.toISOString()}`,
      );

      return {
        success: true,
        scheduled: true,
        auditLogIds: [auditLogId],
        reason: 'Scheduled for future processing',
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Schedule] Failed to schedule notification: ${err.message}`);

      return {
        success: true,
        scheduled: false,
        auditLogIds: [],
        reason: `Scheduling failed: ${err.message}`,
      };
    }
  }

  /**
   * Process an immediate notification.
   */
  private async processImmediateNotification(
    request: NotifyUserRequest,
  ): Promise<NotifyUserResult> {
    const { userId, eventType, payload } = request;

    try {
      // Delegate to NotificationAuditService for channel resolution and delivery
      const auditResult = await this.notificationAudit.notifyUser(eventType, userId, {
        data: payload,
      });

      this.logger.log(
        `[Immediate] Notification processed: userId=${userId}, event=${eventType}, channels=${JSON.stringify(auditResult.channels)}`,
      );

      return {
        success: true,
        scheduled: false,
        auditLogIds: auditResult.auditLogIds,
        reason: auditResult.reason,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Immediate] Failed to process notification: ${err.message}`);

      return {
        success: true,
        scheduled: false,
        auditLogIds: [],
        reason: `Processing failed: ${err.message}`,
      };
    }
  }

  /**
   * Create an audit log for a scheduled notification.
   */
  private async createScheduledAuditLog(
    userId: string,
    eventType: NotificationEvent,
  ): Promise<string> {
    try {
      const log = await this.prisma.notificationDeliveryLog.create({
        data: {
          identityId: userId,
          eventType: eventType,
          channelType: 'NONE',
          status: 'SKIPPED',
          reason: 'SCHEDULED',
        },
      });

      return log.id;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[Schedule] Failed to create audit log: ${err.message}`);
      throw error;
    }
  }
}
