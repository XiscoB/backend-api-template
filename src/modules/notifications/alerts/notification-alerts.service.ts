import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationAlert, NotificationAlertsResult } from './alerts.types';
import { NotificationChannelType } from '@prisma/client';

// Local constants for alert thresholds - NOT configured in app.constants
const FAILURE_RATIO_THRESHOLD = 0.1; // 10% failure rate
const FAILURE_MIN_ATTEMPTS = 50; // Minimum attempts to trigger ratio alert
const ANOMALY_DEVIATION_THRESHOLD = 0.5; // 50% deviation from baseline
const ANOMALY_MIN_ABSOLUTE_CHANGE = 10; // Minimum absolute change to trigger anomaly
const CHECK_WINDOW_MINUTES = 60; // Look back 1 hour

@Injectable()
export class NotificationAlertsService {
  private readonly logger = new Logger(NotificationAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all alert checks.
   */
  async runChecks(): Promise<NotificationAlertsResult> {
    const alerts: NotificationAlert[] = [];
    const now = new Date();
    const windowStart = new Date(now.getTime() - CHECK_WINDOW_MINUTES * 60 * 1000);

    this.logger.log(`Running notification alert checks (window: ${CHECK_WINDOW_MINUTES}m)...`);

    // 1. Check High Failure Ratios
    const failureAlerts = await this.detectHighFailureRatio(windowStart);
    alerts.push(...failureAlerts);

    // 2. Check Silent Delivery Skips
    const skipAlerts = await this.detectSilentSkips(windowStart);
    alerts.push(...skipAlerts);

    // 3. Check Channel Resolution Anomalies
    const anomalyAlerts = await this.detectResolutionAnomalies(now);
    alerts.push(...anomalyAlerts);

    return {
      alerts,
      checkedCount: 3, // Number of checks run
    };
  }

  /**
   * Detect high failure ratios in notification deliveries.
   */
  private async detectHighFailureRatio(since: Date): Promise<NotificationAlert[]> {
    const alerts: NotificationAlert[] = [];

    // Aggregate stats by eventType
    // Valid approach for group-by with conditional count isn't direct in Prisma
    // So we fetch grouped totals, then grouped failures
    // Or simpler: just raw query for analytics, but we want to stick to Prisma if possible.
    // Let's do: Group by [eventType, status]
    const groups = await this.prisma.notificationDeliveryLog.groupBy({
      by: ['eventType', 'status'],
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'FAILED'] },
      },
      _count: { _all: true },
    });

    // Process groups in memory
    const eventStats = new Map<string, { total: number; failed: number }>();

    for (const group of groups) {
      const entry = eventStats.get(group.eventType) ?? { total: 0, failed: 0 };
      entry.total += group._count._all;
      if (group.status === 'FAILED') {
        entry.failed += group._count._all;
      }
      eventStats.set(group.eventType, entry);
    }

    // Check thresholds
    for (const [eventType, stat] of eventStats.entries()) {
      if (stat.total < FAILURE_MIN_ATTEMPTS) continue;

      const failureRatio = stat.failed / stat.total;
      if (failureRatio >= FAILURE_RATIO_THRESHOLD) {
        alerts.push({
          type: 'HIGH_FAILURE_RATIO',
          severity: 'HIGH',
          title: `High Failure Ratio: ${eventType}`,
          description: `Event '${eventType}' has ${
            stat.failed
          } failures out of ${stat.total} attempts (${(failureRatio * 100).toFixed(1)}%)`,
          metadata: {
            eventType,
            total: stat.total,
            failed: stat.failed,
            ratio: failureRatio,
            threshold: FAILURE_RATIO_THRESHOLD,
          },
          timestamp: new Date(),
        });
      }
    }

    return alerts;
  }

  /**
   * Detect silent delivery skips (channel resolved to NONE despite enabled email).
   */
  private async detectSilentSkips(since: Date): Promise<NotificationAlert[]> {
    // Find logs where channelType is NONE
    // AND user has notifications enabled
    // AND user has at least one enabled email channel
    // Note: This requires joining with UserNotificationProfile and UserEmailChannel
    // Prisma distinct/groupBy doesn't support relation filtering easily in aggregation
    // So we find the logs first.

    // Limit to recent logs to avoid scanning waiting massive history if index missing
    const logs = await this.prisma.notificationDeliveryLog.findMany({
      where: {
        createdAt: { gte: since },
        channelType: NotificationChannelType.NONE,
        // Optimization: Only check logs that might be problematic
        // This is a heuristic.
      },
      include: {
        notificationProfile: {
          include: {
            emailChannels: true,
          },
        },
      },
      take: 100, // Cap to prevent memory issues, we only need to alert on EXISTENCE
    });

    const alerts: NotificationAlert[] = [];

    for (const log of logs) {
      const profile = log.notificationProfile;

      // If no profile, it might be valid (user has no profile yet = no channels)
      // But if we want to be strict, maybe that's an issue too?
      // User request says: "UserNotificationProfile exists AND notificationsEnabled = true AND at least one UserEmailChannel.enabled = true"

      if (!profile) continue;
      if (!profile.notificationsEnabled) continue;

      const hasEnabledEmail = profile.emailChannels.some((c) => c.enabled);

      if (hasEnabledEmail) {
        // FOUND ONE!
        alerts.push({
          type: 'SILENT_DELIVERY_SKIP',
          severity: 'CRITICAL',
          title: 'Silent Delivery Skip Detected',
          description: `User ${profile.identityId} has enabled email channel but delivery resolved to NONE for event ${log.eventType}`,
          metadata: {
            identityId: profile.identityId,
            eventType: log.eventType,
            logId: log.id,
          },
          timestamp: new Date(),
        });

        // Break after finding one - we don't need to spam alerts for every single one
        // One is enough to trigger investigation
        break;
      }
    }

    return alerts;
  }

  /**
   * Detect channel resolution anomalies (unexpected deviation in NONE resolutions).
   */
  private async detectResolutionAnomalies(now: Date): Promise<NotificationAlert[]> {
    const alerts: NotificationAlert[] = [];

    const currentWindowStart = new Date(now.getTime() - CHECK_WINDOW_MINUTES * 60 * 1000);
    const prevWindowStart = new Date(
      currentWindowStart.getTime() - CHECK_WINDOW_MINUTES * 60 * 1000,
    );
    const prevWindowEnd = currentWindowStart;

    // Compare counts of channelType = NONE
    // Ideally we'd group by eventType too, but global check is a good start for V1

    // Previous window
    const prevCount = await this.prisma.notificationDeliveryLog.count({
      where: {
        createdAt: { gte: prevWindowStart, lt: prevWindowEnd },
        channelType: NotificationChannelType.NONE,
      },
    });

    // Current window
    const currentCount = await this.prisma.notificationDeliveryLog.count({
      where: {
        createdAt: { gte: currentWindowStart },
        channelType: NotificationChannelType.NONE,
      },
    });

    // Anomaly logic:
    // 1. Must have enough volume in previous window to be a baseline?
    //    Actually, "Spike in NONE" means we care if current is much higher than prev.
    //    If prev was 0 and current is 100, that's an anomaly.
    //    If prev was 1000 and current is 1100, that's not (10%).

    const diff = currentCount - prevCount;
    const absDiff = Math.abs(diff);

    // If change is small in absolute terms, ignore
    if (absDiff < ANOMALY_MIN_ABSOLUTE_CHANGE) {
      return alerts;
    }

    // Calculate percent change relative to previous (or baseline 1 if 0)
    const baseline = prevCount === 0 ? 1 : prevCount;
    const deviation = diff / baseline;

    // Check if deviation exceeds threshold (positive spike for NONE)
    // We mainly care about INCREASES in NONE resolutions
    if (deviation >= ANOMALY_DEVIATION_THRESHOLD) {
      alerts.push({
        type: 'RESOLUTION_ANOMALY',
        severity: 'HIGH',
        title: 'Channel Resolution Anomaly (Spike in NONE)',
        description: `NONE resolutions spiked by ${(deviation * 100).toFixed(0)}% (Prev: ${prevCount}, Curr: ${currentCount})`,
        metadata: {
          prevCount,
          currentCount,
          diff,
          windowMinutes: CHECK_WINDOW_MINUTES,
        },
        timestamp: new Date(),
      });
    }

    return alerts;
  }
}
