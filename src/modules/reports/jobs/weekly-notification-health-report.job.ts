import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';

/**
 * Payload contract for WEEKLY_NOTIFICATION_HEALTH_REPORT notification.
 * Must be kept in sync with AdminEmailHook handling.
 */
export interface WeeklyNotificationHealthPayload {
  periodStart: string; // ISO
  periodEnd: string; // ISO

  /** 1. Notification Volume Summary */
  volume: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    previousWeekTotal: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
  };

  /** 2. Delivery Outcomes */
  delivery: {
    totalAttempts: number;
    sent: number;
    failed: number;
    skipped: number;
    failureRate: number; // percentage
    previousWeekFailureRate: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
  };

  /** 3. Channel Usage */
  channels: {
    email: { count: number; percent: number };
    push: { count: number; percent: number };
    none: { count: number; percent: number };
  };

  /**
   * 4. Failure Analysis
   *
   * AGGREGATION RULES:
   * - Failures are grouped by eventType (not per-recipient)
   * - Reasons are grouped by normalized reason string, NOT raw error payloads
   */
  failures: {
    topEventTypes: Array<{ eventType: string; count: number }>;
    topReasons: Array<{ reason: string; count: number }>;
    previousWeekFailures: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
  };

  /**
   * 5. Configuration Health Signals
   *
   * DEFINITIONS:
   * - "active" email channel: enabled = true (promoEnabled is irrelevant for transactional)
   * - "all disabled": user has email channels but none with enabled = true
   */
  configHealth: {
    usersWithEmailChannel: number;
    usersWithAllChannelsDisabled: number;
    usersEnabledButNoActiveChannel: number;
  };

  generatedAt: string;
}

@Injectable()
export class WeeklyNotificationHealthReportJob {
  private readonly logger = new Logger(WeeklyNotificationHealthReportJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Run the Weekly Notification Health Report job.
   *
   * 1. Aggregates notification volume from NotificationLog.
   * 2. Aggregates delivery outcomes from NotificationDeliveryLog.
   * 3. Aggregates channel usage from NotificationDeliveryLog.
   * 4. Aggregates failure analysis from NotificationDeliveryLog.
   * 5. Aggregates configuration health from UserEmailChannel.
   * 6. Emits a SYSTEM notification with structured payload.
   * 7. Delivery is handled by AdminEmailHook.
   */
  async run(): Promise<void> {
    this.logger.log('Starting Weekly Notification Health Report Job');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // ─────────────────────────────────────────────────────────────
    // 1. Notification Volume Summary (from NotificationLog)
    // ─────────────────────────────────────────────────────────────

    const [currentWeekNotifications, previousWeekNotifications, notificationsByType] =
      await Promise.all([
        // Current week total
        this.prisma.notificationLog.count({
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
        // Previous week total
        this.prisma.notificationLog.count({
          where: {
            createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
          },
        }),
        // Breakdown by type (current week)
        this.prisma.notificationLog.groupBy({
          by: ['type'],
          where: { createdAt: { gte: sevenDaysAgo } },
          _count: { type: true },
          orderBy: { _count: { type: 'desc' } },
          take: 10, // Top 10 types
        }),
      ]);

    const volumeTrend = this.calculateTrend(currentWeekNotifications, previousWeekNotifications);

    // ─────────────────────────────────────────────────────────────
    // 2. Delivery Outcomes (from NotificationDeliveryLog)
    // ─────────────────────────────────────────────────────────────

    const [currentDeliveryStats, previousDeliveryStats] = await Promise.all([
      this.prisma.notificationDeliveryLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { status: true },
      }),
      this.prisma.notificationDeliveryLog.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
        _count: { status: true },
      }),
    ]);

    const currentSent = this.getStatusCount(currentDeliveryStats, 'SENT');
    const currentFailed = this.getStatusCount(currentDeliveryStats, 'FAILED');
    const currentSkipped = this.getStatusCount(currentDeliveryStats, 'SKIPPED');
    const currentTotal = currentSent + currentFailed + currentSkipped;
    const currentFailureRate = currentTotal > 0 ? (currentFailed / currentTotal) * 100 : 0;

    const prevFailed = this.getStatusCount(previousDeliveryStats, 'FAILED');
    const prevTotal =
      this.getStatusCount(previousDeliveryStats, 'SENT') +
      prevFailed +
      this.getStatusCount(previousDeliveryStats, 'SKIPPED');
    const prevFailureRate = prevTotal > 0 ? (prevFailed / prevTotal) * 100 : 0;

    const deliveryTrend = this.calculateTrend(currentFailureRate, prevFailureRate);

    // ─────────────────────────────────────────────────────────────
    // 3. Channel Usage (from NotificationDeliveryLog)
    // ─────────────────────────────────────────────────────────────

    const channelStats = await this.prisma.notificationDeliveryLog.groupBy({
      by: ['channelType'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { channelType: true },
    });

    const emailCount = this.getChannelCount(channelStats, 'EMAIL');
    const pushCount = this.getChannelCount(channelStats, 'PUSH');
    const noneCount = this.getChannelCount(channelStats, 'NONE');
    const channelTotal = emailCount + pushCount + noneCount;

    // ─────────────────────────────────────────────────────────────
    // 4. Failure Analysis (from NotificationDeliveryLog)
    //
    // AGGREGATION RULES:
    // - Group by eventType (not by recipient)
    // - Group reasons by normalized string (not raw error payloads)
    // ─────────────────────────────────────────────────────────────

    const [topFailingEventTypes, topFailureReasons] = await Promise.all([
      this.prisma.notificationDeliveryLog.groupBy({
        by: ['eventType'],
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: 'FAILED',
        },
        _count: { eventType: true },
        orderBy: { _count: { eventType: 'desc' } },
        take: 5,
      }),
      this.prisma.notificationDeliveryLog.groupBy({
        by: ['reason'],
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: 'FAILED',
          reason: { not: null },
        },
        _count: { reason: true },
        orderBy: { _count: { reason: 'desc' } },
        take: 5,
      }),
    ]);

    const failureTrend = this.calculateTrend(currentFailed, prevFailed);

    // ─────────────────────────────────────────────────────────────
    // 5. Configuration Health Signals (from UserEmailChannel)
    //
    // DEFINITIONS:
    // - "active" = enabled = true (promoEnabled irrelevant for transactional)
    // - "all disabled" = has channels but none enabled
    // ─────────────────────────────────────────────────────────────

    const [usersWithEmailChannel, usersWithActiveChannel] = await Promise.all([
      // Users with at least one email channel (any state)
      this.prisma.userEmailChannel.groupBy({
        by: ['notificationProfileId'],
        _count: { notificationProfileId: true },
      }),
      // Users with at least one ACTIVE (enabled=true) email channel
      this.prisma.userEmailChannel.groupBy({
        by: ['notificationProfileId'],
        where: { enabled: true },
        _count: { notificationProfileId: true },
      }),
    ]);

    const usersWithAnyChannel = usersWithEmailChannel.length;
    const usersWithAnyActiveChannel = usersWithActiveChannel.length;
    const usersWithAllDisabled = usersWithAnyChannel - usersWithAnyActiveChannel;

    // Users with notifications enabled but no active email channel
    // This requires a more complex query - users where notificationsEnabled=true
    // but they have no enabled email channels
    const profileIdsWithActiveChannel = new Set(
      usersWithActiveChannel.map((r) => r.notificationProfileId),
    );

    const profilesEnabledNoActiveChannel = await this.prisma.userNotificationProfile.count({
      where: {
        notificationsEnabled: true,
        id: { notIn: Array.from(profileIdsWithActiveChannel) },
      },
    });

    // ─────────────────────────────────────────────────────────────
    // Construct Payload
    // ─────────────────────────────────────────────────────────────

    const payload: WeeklyNotificationHealthPayload = {
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: now.toISOString(),

      volume: {
        total: currentWeekNotifications,
        byType: notificationsByType.map((r) => ({
          type: r.type,
          count: r._count.type,
        })),
        previousWeekTotal: previousWeekNotifications,
        trend: volumeTrend,
      },

      delivery: {
        totalAttempts: currentTotal,
        sent: currentSent,
        failed: currentFailed,
        skipped: currentSkipped,
        failureRate: Number(currentFailureRate.toFixed(1)),
        previousWeekFailureRate: Number(prevFailureRate.toFixed(1)),
        trend: deliveryTrend,
      },

      channels: {
        email: {
          count: emailCount,
          percent: channelTotal > 0 ? Number(((emailCount / channelTotal) * 100).toFixed(1)) : 0,
        },
        push: {
          count: pushCount,
          percent: channelTotal > 0 ? Number(((pushCount / channelTotal) * 100).toFixed(1)) : 0,
        },
        none: {
          count: noneCount,
          percent: channelTotal > 0 ? Number(((noneCount / channelTotal) * 100).toFixed(1)) : 0,
        },
      },

      failures: {
        topEventTypes: topFailingEventTypes.map((r) => ({
          eventType: r.eventType,
          count: r._count.eventType,
        })),
        topReasons: topFailureReasons.map((r) => ({
          reason: r.reason ?? 'Unknown',
          count: r._count.reason,
        })),
        previousWeekFailures: prevFailed,
        trend: failureTrend,
      },

      configHealth: {
        usersWithEmailChannel: usersWithAnyChannel,
        usersWithAllChannelsDisabled: usersWithAllDisabled,
        usersEnabledButNoActiveChannel: profilesEnabledNoActiveChannel,
      },

      generatedAt: now.toISOString(),
    };

    // ─────────────────────────────────────────────────────────────
    // Emit Notification
    // ─────────────────────────────────────────────────────────────

    const systemIdentity = await this.identityService.getOrCreateSystemIdentity();

    await this.notificationsService.notifyByIdentityId({
      identityId: systemIdentity.id,
      actorIdentityId: systemIdentity.id,
      type: 'WEEKLY_NOTIFICATION_HEALTH_REPORT',
      payload: { ...payload } as Record<string, unknown>,
    });

    this.logger.log('Weekly Notification Health Report generated and notification emitted.');
  }

  /**
   * Calculate trend direction based on current vs previous values.
   * For failure rates, higher = worse (UP means degradation).
   */
  private calculateTrend(current: number, previous: number): 'UP' | 'DOWN' | 'FLAT' {
    const threshold = 0.05; // 5% tolerance for "flat"
    if (previous === 0) {
      return current > 0 ? 'UP' : 'FLAT';
    }
    const changeRatio = (current - previous) / previous;
    if (changeRatio > threshold) return 'UP';
    if (changeRatio < -threshold) return 'DOWN';
    return 'FLAT';
  }

  private getStatusCount(
    stats: Array<{ status: string; _count: { status: number } }>,
    status: string,
  ): number {
    const found = stats.find((s) => s.status === status);
    return found?._count.status ?? 0;
  }

  private getChannelCount(
    stats: Array<{ channelType: string; _count: { channelType: number } }>,
    channel: string,
  ): number {
    const found = stats.find((s) => s.channelType === channel);
    return found?._count.channelType ?? 0;
  }
}
