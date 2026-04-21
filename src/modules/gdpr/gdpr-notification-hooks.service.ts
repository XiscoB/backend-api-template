/**
 * GDPR Notification Hooks (Phase 7 → Phase 8)
 *
 * Integrates GDPR events with the global notification orchestrator.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service provides a clean integration layer between GDPR operations
 * and the notification system. It ensures:
 *
 * 1. All GDPR events trigger notification attempts
 * 2. Notification failures NEVER block GDPR logic
 * 3. All outcomes are auditable
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN (Phase 8 Update)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - This service delegates to GlobalNotificationService
 * - It provides GDPR-specific method names for clarity
 * - It constructs appropriate payloads for each event type
 * - It NEVER throws - callers can safely ignore the return value
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOCALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All notification text is sourced from global translations.
 * Pass the user's language (from profile.language) to get localized content.
 * Falls back to English if language is not provided or not supported.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Call these methods at appropriate points in GDPR processing:
 *
 * ```typescript
 * // After export completes successfully
 * await this.gdprNotificationHooks.onExportCompleted(identityId, {
 *   requestId,
 *   downloadUrl: '...',
 *   expiresAt: '...',
 *   language: profile.language, // Pass user's language
 * });
 *
 * // After export expires during download attempt
 * await this.gdprNotificationHooks.onExportExpired(identityId, requestId);
 *
 * // After export is deleted by cleanup cron
 * await this.gdprNotificationHooks.onExportDeleted(identityId, requestId);
 * ```
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  GlobalNotificationService,
  NotificationEvent,
  NotifyUserResult,
} from '../notifications/global-notification.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { getTranslations, interpolate } from '../../common/translations';

/**
 * Payload for export completed notification.
 */
export interface ExportCompletedPayload {
  requestId: string;
  downloadUrl?: string;
  expiresAt?: string;
  filename?: string;
  fileSize?: number;
  /** User's preferred language for localized notification */
  language?: string;
}

/**
 * Payload for export expired notification.
 */
export interface ExportExpiredPayload {
  requestId: string;
  reason?: string;
  /** User's preferred language for localized notification */
  language?: string;
}

/**
 * Payload for export deleted notification.
 */
export interface ExportDeletedPayload {
  requestId: string;
  reason?: string;
  /** User's preferred language for localized notification */
  language?: string;
}

@Injectable()
export class GdprNotificationHooks {
  private readonly logger = new Logger(GdprNotificationHooks.name);

  constructor(
    private readonly globalNotification: GlobalNotificationService,
    private readonly emailNotificationService: EmailNotificationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Notify user that their GDPR export is ready for download.
   *
   * Call this after:
   * - Export pipeline completes successfully
   * - File is stored and presigned URL is available
   *
   * @param identityId - User's identity ID
   * @param payload - Export details
   */
  async onExportCompleted(
    identityId: string,
    payload: ExportCompletedPayload,
  ): Promise<NotifyUserResult> {
    this.logger.debug(
      `[GDPR Hook] Export completed: identity=${identityId}, request=${payload.requestId}`,
    );

    // Send email (Fire and forget, allow failure without blocking)
    this.handleExportReadyEmail(identityId, payload).catch((err) =>
      this.logger.warn(`Failed to trigger export ready email: ${err}`),
    );

    const t = getTranslations(payload.language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_EXPORT_READY,
      payload: {
        title: t.notifications.gdprExportReady.title,
        body: t.notifications.gdprExportReady.body,
        requestId: payload.requestId,
        downloadUrl: payload.downloadUrl,
        expiresAt: payload.expiresAt,
        filename: payload.filename,
        fileSize: payload.fileSize,
      },
    });
  }

  /**
   * Helper to send Export Ready email effectively.
   */
  private async handleExportReadyEmail(
    identityId: string,
    payload: ExportCompletedPayload,
  ): Promise<void> {
    if (!payload.downloadUrl || !payload.expiresAt) return;

    const email = await this.resolveEmail(identityId);
    if (!email) return;

    const expiresDate = new Date(payload.expiresAt);
    const now = new Date();
    const expiryDays = Math.max(
      1,
      Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    await this.emailNotificationService.sendGdprExportReady(
      email,
      payload.downloadUrl,
      expiryDays,
      expiresDate,
      payload.language,
    );
  }

  /**
   * Resolve best email for a user.
   */
  private async resolveEmail(identityId: string): Promise<string | undefined> {
    try {
      const profile = await this.prisma.userNotificationProfile.findUnique({
        where: { identityId },
        include: {
          emailChannels: {
            where: { enabled: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      return profile?.emailChannels[0]?.email;
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Notify user that their GDPR export has expired.
   *
   * Call this when:
   * - User attempts to download an expired export
   * - The expiration is detected during access
   *
   * NOTE: This is informational - the export was likely auto-cleaned.
   *
   * @param identityId - User's identity ID
   * @param payload - Expiration details
   */
  async onExportExpired(
    identityId: string,
    payload: ExportExpiredPayload,
  ): Promise<NotifyUserResult> {
    this.logger.debug(
      `[GDPR Hook] Export expired: identity=${identityId}, request=${payload.requestId}`,
    );

    const t = getTranslations(payload.language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_EXPORT_EXPIRED,
      payload: {
        title: t.notifications.gdprExportExpired.title,
        body: t.notifications.gdprExportExpired.body,
        requestId: payload.requestId,
        reason: payload.reason ?? 'Export exceeded retention period',
      },
    });
  }

  /**
   * Notify user that their GDPR export has been deleted.
   *
   * Call this when:
   * - Cleanup cron deletes an expired export
   * - Manual cleanup removes an export
   *
   * @param identityId - User's identity ID
   * @param payload - Deletion details
   */
  async onExportDeleted(
    identityId: string,
    payload: ExportDeletedPayload,
  ): Promise<NotifyUserResult> {
    this.logger.debug(
      `[GDPR Hook] Export deleted: identity=${identityId}, request=${payload.requestId}`,
    );

    const t = getTranslations(payload.language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_EXPORT_DELETED,
      payload: {
        title: t.notifications.gdprExportDeleted.title,
        body: t.notifications.gdprExportDeleted.body,
        requestId: payload.requestId,
        reason: payload.reason ?? 'Automatic cleanup after expiration',
      },
    });
  }

  /**
   * Notify user that their GDPR deletion is complete.
   *
   * @param identityId - User's identity ID
   * @param requestId - The deletion request ID
   * @param language - Optional user's preferred language
   */
  async onDeleteCompleted(
    identityId: string,
    requestId: string,
    language?: string,
  ): Promise<NotifyUserResult> {
    this.logger.debug(`[GDPR Hook] Delete completed: identity=${identityId}, request=${requestId}`);

    const t = getTranslations(language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_DELETE_COMPLETED,
      payload: {
        title: t.notifications.gdprDeleteCompleted.title,
        body: t.notifications.gdprDeleteCompleted.body,
        requestId,
      },
    });
  }

  /**
   * Notify user that their account suspension is complete.
   *
   * @param identityId - User's identity ID
   * @param requestId - The suspension request ID
   * @param language - Optional user's preferred language
   */
  async onSuspendCompleted(
    identityId: string,
    requestId: string,
    language?: string,
  ): Promise<NotifyUserResult> {
    this.logger.debug(
      `[GDPR Hook] Suspend completed: identity=${identityId}, request=${requestId}`,
    );

    const t = getTranslations(language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_SUSPEND_COMPLETED,
      payload: {
        title: t.notifications.gdprSuspendCompleted.title,
        body: t.notifications.gdprSuspendCompleted.body,
        requestId,
      },
    });
  }

  /**
   * Notify user that their account has been resumed.
   *
   * @param identityId - User's identity ID
   * @param requestId - The resume request ID
   * @param language - Optional user's preferred language
   */
  async onResumeCompleted(
    identityId: string,
    requestId: string,
    language?: string,
  ): Promise<NotifyUserResult> {
    this.logger.debug(`[GDPR Hook] Resume completed: identity=${identityId}, request=${requestId}`);

    const t = getTranslations(language);

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_RESUME_COMPLETED,
      payload: {
        title: t.notifications.gdprResumeCompleted.title,
        body: t.notifications.gdprResumeCompleted.body,
        requestId,
      },
    });
  }

  /**
   * Notify user that their suspension is about to expire.
   *
   * @param identityId - User's identity ID
   * @param daysRemaining - Days until auto-deletion
   * @param language - Optional user's preferred language
   */
  async onSuspensionExpiring(
    identityId: string,
    daysRemaining: number,
    language?: string,
  ): Promise<NotifyUserResult> {
    this.logger.debug(
      `[GDPR Hook] Suspension expiring: identity=${identityId}, days=${daysRemaining}`,
    );

    const t = getTranslations(language);
    const body = interpolate(t.notifications.gdprSuspensionExpiring.bodyTemplate, {
      daysRemaining,
    });

    return await this.globalNotification.notifyUser({
      userId: identityId,
      eventType: NotificationEvent.GDPR_SUSPENSION_EXPIRING,
      payload: {
        title: t.notifications.gdprSuspensionExpiring.title,
        body,
        daysRemaining,
      },
    });
  }
}
