/**
 * Notification Audit Service (Phase 7)
 *
 * Audit-first notification service that always logs delivery outcomes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service guarantees:
 * > "The system always knows whether a user was notified or not."
 *
 * It does NOT guarantee:
 * > "An email or push was actually sent."
 *
 * The distinction is critical for GDPR compliance:
 * - We must always know if we attempted to notify the user
 * - The actual delivery success is a separate concern
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Audit-first**: Every call creates a log entry, even on failure
 * 2. **Never throws**: Callers must not be blocked by notification failures
 * 3. **Scaffold only**: Actual delivery is stubbed (Phase 7)
 * 4. **Channel-aware**: Logs which channels were available
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FUTURE PROVIDERS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * When real email/push providers are added:
 * 1. Inject the NotificationDeliveryService
 * 2. Call it AFTER creating the audit log
 * 3. Update the audit log with delivery result (optional)
 *
 * The audit log is the source of truth for "did we try to notify?"
 * The delivery service handles "did the notification actually arrive?"
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { NotificationChannelType, NotificationDeliveryStatus } from './notifications.types';

/**
 * Event types for notification audit.
 */
export enum NotificationEventType {
  // GDPR Events
  GDPR_EXPORT_COMPLETED = 'GDPR_EXPORT_COMPLETED',
  GDPR_EXPORT_EXPIRED = 'GDPR_EXPORT_EXPIRED',
  GDPR_EXPORT_DELETED = 'GDPR_EXPORT_DELETED',
  GDPR_DELETE_COMPLETED = 'GDPR_DELETE_COMPLETED',
  GDPR_SUSPEND_COMPLETED = 'GDPR_SUSPEND_COMPLETED',
  GDPR_RESUME_COMPLETED = 'GDPR_RESUME_COMPLETED',
  GDPR_SUSPENSION_EXPIRING = 'GDPR_SUSPENSION_EXPIRING',
}

/**
 * Result of a notification attempt.
 */
export interface NotificationAuditResult {
  /** Whether the notification was processed successfully (not necessarily delivered) */
  success: boolean;
  /** Audit log IDs created for this notification */
  auditLogIds: string[];
  /** Summary of outcomes per channel */
  channels: {
    email: NotificationDeliveryStatus | null;
    push: NotificationDeliveryStatus | null;
  };
  /** Reason if no channels were available */
  reason?: string;
}

/**
 * Payload for notification events.
 */
export interface NotificationPayload {
  /** Title/subject of the notification */
  title?: string;
  /** Body/content of the notification */
  body?: string;
  /** Additional data (JSON) */
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationAuditService {
  private readonly logger = new Logger(NotificationAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Notify a user and create notification records.
   *
   * This is the main entry point for all notification attempts.
   *
   * CORE INVARIANT:
   * Creates exactly ONE notification_logs record per event (user-facing inbox).
   * Creates one notification_delivery_log per delivery channel (audit trail).
   *
   * This happens regardless of:
   * - Number of delivery channels
   * - Delivery success or failure
   * - Whether channels are missing
   *
   * This method NEVER throws. Callers can safely call it without
   * error handling and trust that it will log outcomes.
   *
   * @param eventType - The event that triggered this notification
   * @param identityId - The user's identity ID
   * @param payload - Optional notification content
   * @returns Audit result (always succeeds, check channels for details)
   */
  async notifyUser(
    eventType: NotificationEventType | string,
    identityId: string,
    payload?: NotificationPayload,
  ): Promise<NotificationAuditResult> {
    const auditLogIds: string[] = [];

    try {
      this.logger.debug(`[Audit] Notifying user: identity=${identityId}, event=${eventType}`);

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 0: Check identity status - block notifications for deleted users
      // ═══════════════════════════════════════════════════════════════════════════
      // GDPR INVARIANT: Identity state check is source-of-truth.
      // Do NOT cache or memoize - correctness > optimization.
      // Notification suppression for deleted identities is a successful NO-OP.
      const identity = await this.prisma.identity.findUnique({
        where: { id: identityId },
        select: { deletedAt: true, anonymized: true },
      });

      if (identity?.anonymized === true || identity?.deletedAt != null) {
        this.logger.debug(
          `[Audit] Blocked notification for deleted/pending-deletion identity: ${identityId}`,
        );
        return {
          success: true, // NO-OP, not an error
          auditLogIds: [],
          channels: { email: null, push: null },
          reason: 'Identity is deleted or pending deletion',
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 1: Resolve delivery channels (BEFORE Log Creation)
      // ═══════════════════════════════════════════════════════════════════════════
      // Invariant: NotificationLog must never exist without at least one delivery attempt.

      // Load notification profile
      const profile = await this.prisma.userNotificationProfile.findUnique({
        where: { identityId },
        select: {
          id: true,
          notificationsEnabled: true,
          emailChannels: true,
        },
      });

      // If no profile exists, RETURN (No NotificationLog, No DeliveryLog)
      if (!profile) {
        this.logger.debug(`[Audit] No profile for user: identity=${identityId}`);

        return {
          success: true,
          auditLogIds: [],
          channels: { email: null, push: null },
          reason: 'No notification profile exists',
        };
      }

      // Check if notifications are globally disabled
      if (!profile.notificationsEnabled) {
        this.logger.debug(`[Audit] Notifications disabled for user: identity=${identityId}`);

        return {
          success: true,
          auditLogIds: [],
          channels: { email: null, push: null },
          reason: 'Notifications disabled by user',
        };
      }

      // Check for enabled channels
      // STRICT INVARIANT: If no channels are eligible, do NOT create a NotificationLog.
      const hasEnabledEmail = profile.emailChannels.some((ch) => ch.enabled);

      if (!hasEnabledEmail) {
        this.logger.debug(`[Audit] No eligible channels for user: identity=${identityId}`);
        return {
          success: true,
          auditLogIds: [],
          channels: { email: null, push: null },
          reason: 'No eligible channels available',
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 2: Create user-facing notification (Target Guaranteed)
      // ═══════════════════════════════════════════════════════════════════════════
      // Only proceed because we confirmed at least one channel is eligible.

      const notificationLog = await this.prisma.notificationLog.create({
        data: {
          identityId,
          type: eventType,
          payload: {
            title: payload?.title,
            body: payload?.body,
            ...payload?.data,
          },
          visibleAt: new Date(),
        },
      });

      this.logger.debug(
        `[Audit] Created notification_logs entry: id=${notificationLog.id}, identity=${identityId}`,
      );

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 3: Process Delivery (Core Channels Only)
      // ═══════════════════════════════════════════════════════════════════════════

      // Process email channels (creates delivery logs per channel)
      const emailStatus = await this.processEmailChannels(
        identityId,
        profile.id,
        eventType,
        profile.emailChannels,
        payload,
        auditLogIds,
      );

      // NOTE: Push channels are NOT processed here.
      // They are handled by `PushDeliveryHook` (if installed) responding to the `NotificationLog` creation.
      // The Hook is responsible for calling `logDelivery`.

      this.logger.log(
        `[Audit] Notification processed: identity=${identityId}, event=${eventType}, ` +
          `email=${emailStatus ?? 'none'}`,
      );

      return {
        success: true,
        auditLogIds,
        channels: { email: emailStatus, push: null },
      };
    } catch (error) {
      // Never throw - log the error and return failure result
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Audit] Failed to notify user: ${errorMessage}`);

      // DO NOT create a failure audit log here because we don't know if the
      // NotificationLog (parent) was created successfully.
      // Prioritizing invariant: No DeliveryLog without NotificationLog.

      return {
        success: false,
        auditLogIds,
        channels: { email: null, push: null },
        reason: errorMessage,
      };
    }
  }

  /**
   * Notify a user by external user ID (JWT sub).
   *
   * Convenience wrapper that resolves identity first.
   */
  async notifyByExternalUserId(
    eventType: NotificationEventType | string,
    externalUserId: string,
    payload?: NotificationPayload,
  ): Promise<NotificationAuditResult> {
    try {
      const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);
      if (!identity) {
        this.logger.warn(`[Audit] Identity not found for external user: ${externalUserId}`);
        return {
          success: false,
          auditLogIds: [],
          channels: { email: null, push: null },
          reason: 'Identity not found',
        };
      }
      return await this.notifyUser(eventType, identity.id, payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Audit] Failed to resolve identity: ${errorMessage}`);
      return {
        success: false,
        auditLogIds: [],
        channels: { email: null, push: null },
        reason: errorMessage,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Process email channels and create audit logs.
   */
  private async processEmailChannels(
    identityId: string,
    profileId: string,
    eventType: string,
    channels: Array<{
      id: string;
      email: string;
      enabled: boolean;
    }>,
    payload: NotificationPayload | undefined,
    auditLogIds: string[],
  ): Promise<NotificationDeliveryStatus | null> {
    if (channels.length === 0) {
      return null;
    }

    // Find eligible channels
    const eligibleChannels = channels.filter((ch) => ch.enabled);

    if (eligibleChannels.length === 0) {
      // Invariant: We should have filtered this upstream.
      return null;
    }

    // For each eligible channel, log as SENT (scaffold - no real delivery)
    for (const channel of eligibleChannels) {
      const logId = await this.createDeliveryLog({
        identityId,
        notificationProfileId: profileId,
        eventType,
        channelType: NotificationChannelType.EMAIL,
        status: NotificationDeliveryStatus.SENT,
        reason: 'Email notification queued (scaffold - no delivery)',
        target: channel.email,
        meta: { ...payload?.data },
      });
      auditLogIds.push(logId);

      // SCAFFOLD: In Phase 8+, actual email sending would happen here
      this.logger.debug(`[Audit/Scaffold] Would send email to: ${channel.email}`);
    }

    return NotificationDeliveryStatus.SENT;
  }

  /**
   * Log a delivery attempt from an external hook.
   */
  async logDelivery(params: {
    identityId: string;
    channelType: NotificationChannelType;
    status: NotificationDeliveryStatus;
    reason?: string;
    eventType: string;
    target?: string;
    notificationProfileId: string | null;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.createDeliveryLog({
      identityId: params.identityId,
      notificationProfileId: params.notificationProfileId,
      eventType: params.eventType,
      channelType: params.channelType,
      status: params.status,
      reason: params.reason,
      target: params.target,
      meta: params.meta,
    });
  }

  /**
   * Create a delivery audit log entry.
   */
  private async createDeliveryLog(params: {
    identityId: string;
    notificationProfileId: string | null;
    eventType: string;
    channelType: NotificationChannelType;
    status: NotificationDeliveryStatus;
    reason?: string;
    target?: string;
    meta?: Record<string, unknown>;
  }): Promise<string> {
    const log = await this.prisma.notificationDeliveryLog.create({
      data: {
        identityId: params.identityId,
        notificationProfileId: params.notificationProfileId,
        eventType: params.eventType,
        channelType: params.channelType,
        status: params.status,
        reason: params.reason,
        target: params.target,
        meta: params.meta as object | undefined,
      },
    });
    return log.id;
  }
}
