// NotificationsRepository loading
import { Injectable } from '@nestjs/common';
import {
  NotificationLog,
  ScheduledNotification,
  ScheduledNotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateImmediateNotificationInput,
  CreateScheduledNotificationInput,
  NotificationLogFilters,
  PaginationOptions,
} from './notifications.types';

/**
 * Notifications Repository
 *
 * Handles database operations for notification entities.
 * All Prisma operations for notifications are encapsulated here.
 *
 * This is a platform primitive - no domain-specific logic.
 *
 * IMPORTANT: This repository operates on identityId, NOT externalUserId.
 * Identity resolution happens at the service layer.
 */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // NotificationLog Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an immediate notification log.
   */
  async createNotificationLog(input: CreateImmediateNotificationInput): Promise<NotificationLog> {
    return await this.prisma.notificationLog.create({
      data: {
        identityId: input.identityId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        actorId: input.actorId ?? null,
        visibleAt: input.visibleAt ?? new Date(),
      },
    });
  }

  /**
   * Find a notification log by ID.
   */
  async findNotificationLogById(id: string): Promise<NotificationLog | null> {
    return await this.prisma.notificationLog.findUnique({
      where: { id },
    });
  }

  /**
   * Find notification logs for an identity with optional filters.
   */
  async findNotificationLogsForIdentity(
    identityId: string,
    filters: NotificationLogFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<NotificationLog[]> {
    const where: Prisma.NotificationLogWhereInput = {
      identityId,
    };

    // By default, exclude soft-deleted notifications
    if (!filters.includeDeleted) {
      where.deletedAt = null;
    }

    // Filter by visibility
    if (filters.visibleBefore) {
      where.visibleAt = { lte: filters.visibleBefore };
    }

    // Filter by read status
    if (filters.unreadOnly) {
      where.readAt = null;
    }

    // Filter by type
    if (filters.type) {
      where.type = filters.type;
    }

    return await this.prisma.notificationLog.findMany({
      where,
      orderBy: { visibleAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  /**
   * Count unread notifications for an identity.
   */
  async countUnreadForIdentity(identityId: string): Promise<number> {
    return await this.prisma.notificationLog.count({
      where: {
        identityId,
        deletedAt: null,
        readAt: null,
        visibleAt: { lte: new Date() },
      },
    });
  }

  /**
   * Check if identity has any unread notifications.
   *
   * Uses findFirst with take:1 for O(1) performance.
   * Ideal for badge/dot UI indicators.
   */
  async hasUnreadForIdentity(identityId: string): Promise<boolean> {
    const notification = await this.prisma.notificationLog.findFirst({
      where: {
        identityId,
        deletedAt: null,
        readAt: null,
        visibleAt: { lte: new Date() },
      },
      select: { id: true },
    });
    return notification !== null;
  }

  /**
   * Mark a notification as read (with ownership verification).
   *
   * Returns null if notification not found or not owned by identity.
   * Idempotent: if already read, returns current state.
   */
  async markAsReadForIdentity(id: string, identityId: string): Promise<NotificationLog | null> {
    // First verify ownership
    const notification = await this.prisma.notificationLog.findFirst({
      where: { id, identityId },
    });

    if (!notification) {
      return null;
    }

    // Idempotent: if already read, return as-is
    if (notification.readAt !== null) {
      return notification;
    }

    return await this.prisma.notificationLog.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /**
   * Mark a notification as read.
   * @deprecated Use markAsReadForIdentity for ownership-verified operations
   */
  async markAsRead(id: string): Promise<NotificationLog> {
    return await this.prisma.notificationLog.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /**
   * Mark multiple notifications as read for an identity.
   */
  async markAllAsReadForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.notificationLog.updateMany({
      where: {
        identityId,
        readAt: null,
        deletedAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Soft delete a notification.
   */
  async softDelete(id: string): Promise<NotificationLog> {
    return await this.prisma.notificationLog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Soft delete all notifications for an identity.
   */
  async softDeleteAllForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.notificationLog.updateMany({
      where: {
        identityId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  // ─────────────────────────────────────────────────────────────
  // ScheduledNotification Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a scheduled notification.
   */
  async createScheduledNotification(
    input: CreateScheduledNotificationInput,
  ): Promise<ScheduledNotification> {
    return await this.prisma.scheduledNotification.create({
      data: {
        identityId: input.identityId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        actorId: input.actorId ?? null,
        scheduledAt: input.scheduledAt,
        status: ScheduledNotificationStatus.PENDING,
      },
    });
  }

  /**
   * Find a scheduled notification by ID.
   */
  async findScheduledNotificationById(id: string): Promise<ScheduledNotification | null> {
    return await this.prisma.scheduledNotification.findUnique({
      where: { id },
    });
  }

  /**
   * Find pending scheduled notifications ready for processing.
   *
   * Returns notifications where:
   * - status = PENDING
   * - scheduledAt <= now
   *
   * Ordered by scheduledAt (oldest first) for fair processing.
   */
  async findPendingScheduledNotifications(limit: number): Promise<ScheduledNotification[]> {
    return await this.prisma.scheduledNotification.findMany({
      where: {
        status: ScheduledNotificationStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Execute a scheduled notification (create log and update status).
   *
   * This is an atomic transaction:
   * 1. Create the NotificationLog
   * 2. Update ScheduledNotification status to EXECUTED
   * 3. Link the notification log
   *
   * @returns The created NotificationLog
   */
  async executeScheduledNotification(scheduled: ScheduledNotification): Promise<NotificationLog> {
    return await this.prisma.$transaction(async (tx) => {
      // Create the notification log
      const notificationLog = await tx.notificationLog.create({
        data: {
          identityId: scheduled.identityId,
          type: scheduled.type,
          payload: scheduled.payload as Prisma.InputJsonValue,
          actorId: scheduled.actorId,
          visibleAt: new Date(),
        },
      });

      // Mark scheduled notification as executed and link
      await tx.scheduledNotification.update({
        where: { id: scheduled.id },
        data: {
          status: ScheduledNotificationStatus.EXECUTED,
          executedAt: new Date(),
          notificationLogId: notificationLog.id,
        },
      });

      return notificationLog;
    });
  }

  /**
   * Mark a scheduled notification as failed.
   */
  async markScheduledNotificationFailed(id: string, error: string): Promise<ScheduledNotification> {
    return await this.prisma.scheduledNotification.update({
      where: { id },
      data: {
        status: ScheduledNotificationStatus.FAILED,
        lastError: error,
        retryCount: { increment: 1 },
      },
    });
  }

  /**
   * Cancel a scheduled notification.
   */
  async cancelScheduledNotification(id: string): Promise<ScheduledNotification> {
    return await this.prisma.scheduledNotification.update({
      where: { id },
      data: { status: ScheduledNotificationStatus.CANCELLED },
    });
  }

  /**
   * Cancel all pending scheduled notifications for an identity.
   *
   * Used during GDPR deletion to prevent orphaned notifications.
   */
  async cancelAllPendingForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.scheduledNotification.updateMany({
      where: {
        identityId,
        status: ScheduledNotificationStatus.PENDING,
      },
      data: { status: ScheduledNotificationStatus.CANCELLED },
    });
    return result.count;
  }

  // ─────────────────────────────────────────────────────────────
  // GDPR Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Find all notification logs for an identity (for GDPR export).
   */
  async findAllNotificationLogsForIdentity(identityId: string): Promise<NotificationLog[]> {
    return await this.prisma.notificationLog.findMany({
      where: { identityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete all notification logs for an identity (for GDPR deletion).
   */
  async deleteAllNotificationLogsForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.notificationLog.deleteMany({
      where: { identityId },
    });
    return result.count;
  }

  /**
   * Anonymize all notification logs for an identity (for GDPR deletion with ANONYMIZE strategy).
   */
  async anonymizeAllNotificationLogsForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.notificationLog.updateMany({
      where: { identityId },
      data: {
        payload: Prisma.JsonNull,
        actorId: null,
        anonymizedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Delete all scheduled notifications for an identity (for GDPR deletion).
   */
  async deleteAllScheduledNotificationsForIdentity(identityId: string): Promise<number> {
    const result = await this.prisma.scheduledNotification.deleteMany({
      where: { identityId },
    });
    return result.count;
  }
}
