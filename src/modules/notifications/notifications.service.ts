import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { NotificationLog, ScheduledNotification } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';
import { IdentityService } from '../identity/identity.service';
import {
  CreateImmediateNotificationInput,
  CreateScheduledNotificationInput,
  NotificationLogFilters,
  PaginationOptions,
  NotificationDeliveryHook,
  NOTIFICATION_DELIVERY_HOOKS,
} from './notifications.types';

/**
 * Notifications Service
 *
 * Business logic for notification operations.
 * This service is version-agnostic and can be used by multiple API versions.
 *
 * Key responsibilities:
 * - Create immediate and scheduled notifications
 * - Invoke delivery hooks (optional)
 * - Query and manage notification logs
 *
 * This is a platform primitive:
 * - No domain-specific notification logic
 * - No delivery providers (email, push, etc.)
 * - Payload is opaque - interpreted by consumers
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly identityService: IdentityService,
    @Optional()
    @Inject(NOTIFICATION_DELIVERY_HOOKS)
    private readonly deliveryHooks?: NotificationDeliveryHook[],
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Notification Creation
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an immediate notification (visible now).
   *
   * Creates a NotificationLog directly. Use for notifications that
   * should be visible to the user immediately.
   *
   * After creation, invokes any registered delivery hooks.
   * Hook failures are logged but do not affect the notification.
   *
   * @param input - Notification data
   * @returns The created notification log
   */
  async createImmediate(input: CreateImmediateNotificationInput): Promise<NotificationLog> {
    const notificationLog = await this.notificationsRepository.createNotificationLog(input);

    // Invoke delivery hooks (if any are registered)
    await this.invokeDeliveryHooks(notificationLog);

    return notificationLog;
  }

  /**
   * Create a scheduled notification (visible later).
   *
   * Creates a ScheduledNotification that will be processed by cron.
   * When processed, it will create a NotificationLog and invoke hooks.
   *
   * @param input - Scheduled notification data
   * @returns The created scheduled notification
   */
  async createScheduled(input: CreateScheduledNotificationInput): Promise<ScheduledNotification> {
    return await this.notificationsRepository.createScheduledNotification(input);
  }

  // ─────────────────────────────────────────────────────────────
  // Intent-Level Helpers (Ergonomic API)
  // ─────────────────────────────────────────────────────────────

  /**
   * Send an immediate notification to a user by external user ID (JWT sub).
   *
   * This is an intent-level helper that wraps createImmediate.
   * Use this for readable, self-documenting code.
   *
   * ⚠️ WARNING: This method calls resolveIdentity() which uses findOrCreate().
   * It WILL create a new Identity if the userId doesn't exist as externalUserId.
   *
   * - For controller/request-boundary code: Use this method (userId = JWT sub)
   * - For internal services with identityId: Use notifyByIdentityId() instead
   *
   * @example
   * await notificationsService.notifyNow({
   *   userId: user.id,  // This is the JWT 'sub' claim from @CurrentUser()
   *   type: 'GDPR_EXPORT_READY',
   *   payload: { downloadUrl: '...' },
   * });
   *
   * @param options - Notification options (userId = external user ID / JWT sub)
   * @returns The created notification log
   */
  async notifyNow(options: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
    actorUserId?: string;
    visibleAt?: Date;
  }): Promise<ScheduledNotification> {
    // Resolve Identity at boundary
    const identity = await this.identityService.resolveIdentity(options.userId);
    let actorIdentityId: string | undefined;
    if (options.actorUserId) {
      const actorIdentity = await this.identityService.resolveIdentity(options.actorUserId);
      actorIdentityId = actorIdentity.id;
    }

    // Fix: Use scheduled notification for "immediate" delivery to ensure
    // Cron is the sole writer of NotificationLog (Invariant #2).
    // Schedule for near-future (e.g., 2 seconds) to allow transaction/db propagation.
    const scheduledAt = new Date(Date.now() + 2000);

    // Map `visibleAt` to scheduled time if not provided, or respect it if future
    if (options.visibleAt && options.visibleAt > scheduledAt) {
      // If user wants it visible LATER, that's fine, schedule for then.
      // But if they want it NOW (visibleAt < now+2s), we enforce the 2s delay.
      // Actually, notifyNow implies "as soon as possible".
      // We ignore visibleAt for scheduling purposes unless it is far in future?
      // No, notifyNow with visibleAt is basically createScheduled.
      // Let's just use the delay.
    }

    const scheduled = await this.createScheduled({
      identityId: identity.id,
      type: options.type,
      payload: options.payload,
      actorId: actorIdentityId,
      scheduledAt:
        options.visibleAt && options.visibleAt > scheduledAt ? options.visibleAt : scheduledAt,
    });

    return scheduled;
  }

  /**
   * Send an immediate notification to a user by internal Identity ID.
   *
   * IMPORTANT: Use this when you already have the internal identityId (UUID).
   * This method does NOT call resolveIdentity/findOrCreate, avoiding phantom
   * identity creation when called from internal services like GDPR suspension.
   *
   * For controller/request-boundary code, prefer notifyNow() which accepts
   * the external user ID (JWT sub) and resolves the identity.
   *
   * @example
   * // In GDPR suspension service (already has identityId)
   * await notificationsService.notifyByIdentityId({
   *   identityId: identityId,
   *   type: 'GDPR_SUSPENSION_ACTIVE',
   *   payload: { ... },
   * });
   *
   * @param options - Notification options with internal identityId
   * @returns The created notification log
   */
  async notifyByIdentityId(options: {
    identityId: string;
    type: string;
    payload: Record<string, unknown>;
    actorIdentityId?: string;
    visibleAt?: Date;
  }): Promise<NotificationLog> {
    // No identity resolution - identityId is already the internal ID
    return await this.createImmediate({
      identityId: options.identityId,
      type: options.type,
      payload: options.payload,
      actorId: options.actorIdentityId,
      visibleAt: options.visibleAt,
    });
  }

  /**
   * Schedule a notification for future delivery.
   *
   * This is an intent-level helper that wraps createScheduled.
   * Use this for readable, self-documenting code.
   *
   * @example
   * await notificationsService.scheduleNotification({
   *   userId: user.id,
   *   type: 'REMINDER',
   *   payload: { message: '...' },
   *   scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
   * });
   *
   * @param options - Scheduled notification options
   * @returns The created scheduled notification
   */
  async scheduleNotification(options: {
    userId: string;
    type: string;
    payload: Record<string, unknown>;
    scheduledAt: Date;
    actorUserId?: string;
  }): Promise<ScheduledNotification> {
    // Resolve Identity at boundary
    const identity = await this.identityService.resolveIdentity(options.userId);
    let actorIdentityId: string | undefined;
    if (options.actorUserId) {
      const actorIdentity = await this.identityService.resolveIdentity(options.actorUserId);
      actorIdentityId = actorIdentity.id;
    }

    return await this.createScheduled({
      identityId: identity.id,
      type: options.type,
      payload: options.payload,
      scheduledAt: options.scheduledAt,
      actorId: actorIdentityId,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Notification Queries
  // ─────────────────────────────────────────────────────────────

  /**
   * Get a notification by ID.
   */
  async getNotificationById(id: string): Promise<NotificationLog | null> {
    return await this.notificationsRepository.findNotificationLogById(id);
  }

  /**
   * Get notifications for a user.
   *
   * By default, returns only visible, non-deleted notifications.
   */
  async getNotificationsForUser(
    externalUserId: string,
    filters: NotificationLogFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<NotificationLog[]> {
    // Resolve Identity at boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Default to only visible notifications
    const effectiveFilters: NotificationLogFilters = {
      visibleBefore: new Date(),
      ...filters,
    };

    return await this.notificationsRepository.findNotificationLogsForIdentity(
      identity.id,
      effectiveFilters,
      pagination,
    );
  }

  /**
   * Count unread notifications for a user.
   */
  async getUnreadCount(externalUserId: string): Promise<number> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    return await this.notificationsRepository.countUnreadForIdentity(identity.id);
  }

  /**
   * Check if user has any unread notifications.
   *
   * Uses EXISTS/LIMIT 1 for O(1) performance.
   * Ideal for badge/dot UI indicators.
   */
  async hasUnread(externalUserId: string): Promise<boolean> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    return await this.notificationsRepository.hasUnreadForIdentity(identity.id);
  }

  // ─────────────────────────────────────────────────────────────
  // Notification Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Mark a notification as read (with ownership verification).
   *
   * Only marks as read if notification exists and is owned by the user.
   * Idempotent: if already read, returns current state.
   *
   * @returns The notification, or null if not found/not owned
   */
  async markAsReadForUser(
    notificationId: string,
    externalUserId: string,
  ): Promise<NotificationLog | null> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    return await this.notificationsRepository.markAsReadForIdentity(notificationId, identity.id);
  }

  /**
   * Mark a notification as read.
   * @deprecated Use markAsReadForUser for ownership-verified operations
   */
  async markAsRead(id: string): Promise<NotificationLog> {
    return await this.notificationsRepository.markAsRead(id);
  }

  /**
   * Mark all notifications as read for a user.
   *
   * @returns Number of notifications marked as read
   */
  async markAllAsRead(externalUserId: string): Promise<number> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    return await this.notificationsRepository.markAllAsReadForIdentity(identity.id);
  }

  /**
   * Soft delete a notification (hide from user).
   */
  async deleteNotification(id: string): Promise<NotificationLog> {
    return await this.notificationsRepository.softDelete(id);
  }

  /**
   * Soft delete all notifications for a user.
   *
   * @returns Number of notifications deleted
   */
  async deleteAllForUser(externalUserId: string): Promise<number> {
    const identity = await this.identityService.resolveIdentity(externalUserId);
    return await this.notificationsRepository.softDeleteAllForIdentity(identity.id);
  }

  // ─────────────────────────────────────────────────────────────
  // Scheduled Notification Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Get a scheduled notification by ID.
   */
  async getScheduledNotificationById(id: string): Promise<ScheduledNotification | null> {
    return await this.notificationsRepository.findScheduledNotificationById(id);
  }

  /**
   * Cancel a scheduled notification.
   */
  async cancelScheduledNotification(id: string): Promise<ScheduledNotification> {
    return await this.notificationsRepository.cancelScheduledNotification(id);
  }

  /**
   * Cancel all pending scheduled notifications for an identity.
   *
   * Used during GDPR deletion to prevent orphaned notifications.
   *
   * @param identityId - The identity ID (not externalUserId)
   * @returns Number of notifications cancelled
   */
  async cancelAllScheduledNotificationsForIdentity(identityId: string): Promise<number> {
    return await this.notificationsRepository.cancelAllPendingForIdentity(identityId);
  }

  // ─────────────────────────────────────────────────────────────
  // Delivery Hook Invocation
  // ─────────────────────────────────────────────────────────────

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
